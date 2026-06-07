// gmail.ts — Gmail API transport layer (sync, send, actions)
// NOTE: This file is being phased out. New code should use:
//   - providerFor(account).method() for API operations
//   - import from './store' for DB operations
// Remaining exports here are Gmail-specific API calls that haven't yet
// been migrated to the GmailProvider class methods directly.

// Tauri HTTP plugin loaded lazily (crashes in browser E2E mode)
let _fetch: typeof globalThis.fetch | null = null;
async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!_fetch) {
    if ('__TAURI_INTERNALS__' in window) {
      const mod = await import('@tauri-apps/plugin-http');
      _fetch = mod.fetch as unknown as typeof globalThis.fetch;
    } else {
      _fetch = globalThis.fetch.bind(globalThis);
    }
  }
  return _fetch(input, init);
}
import { type Account, ensureFreshToken } from './auth';
import { getDb } from './db';
import { autoCancelIfReplied, loadReminders } from './followupReminders';
import { type Thread, getSetting, setSetting } from './store';

const API = 'https://gmail.googleapis.com/gmail/v1';

/** Process items in chunks of `size` concurrently to avoid Gmail rate limits. */
async function chunkedParallel<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    await Promise.all(chunk.map(fn));
  }
}



// ── Sync ──────────────────────────────────────────────────
export async function syncInbox(account: Account, onProgress?: (n: number) => void): Promise<void> {
  const a = await ensureFreshToken(account);

  // Try incremental sync first
  const storedHistoryId = await getSetting(account.id, 'historyId');
  if (storedHistoryId) {
    const didIncremental = await trySyncIncremental(a, storedHistoryId, onProgress);
    if (didIncremental) return;
    // Fall through to full sync if incremental failed (historyId too old / 404)
  }

  // Full sync — all system labels in parallel
  await Promise.all([
    syncFull(a, account.id, 'INBOX', onProgress),
    syncFull(a, account.id, 'SENT'),
    syncFull(a, account.id, 'DRAFT'),
    syncFull(a, account.id, 'STARRED'),
    syncFull(a, account.id, 'TRASH'),
  ]);

  // After full sync, fetch and store current historyId
  try {
    const profile = await gmailGet(a, '/users/me/profile') as { historyId?: string };
    if (profile.historyId) {
      await setSetting(account.id, 'historyId', profile.historyId);
    }
  } catch {
    // Non-fatal: next sync will just do another full sync
  }
}

const MAX_SYNC_PAGES = 10;

async function syncFull(account: Account, accountId: string, label: string = 'INBOX', onProgress?: (n: number) => void): Promise<void> {
  let pageToken: string | undefined;
  let total = 0;
  let page = 0;
  do {
    const params = new URLSearchParams({ labelIds: label, maxResults: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await gmailGet(account, `/users/me/threads?${params}`);
    const data = res as { threads?: Array<{ id: string }>; nextPageToken?: string };
    if (!data.threads) break;

    const threadIds = data.threads.map((t: { id: string }) => t.id);
    const BATCH = 50;
    for (let i = 0; i < threadIds.length; i += BATCH) {
      await Promise.all(threadIds.slice(i, i + BATCH).map((id: string) => syncThread(account, id, accountId, label)));
      total += Math.min(BATCH, threadIds.length - i);
      onProgress?.(total);
    }
    pageToken = data.nextPageToken;
    page++;
    if (page >= MAX_SYNC_PAGES) {
      if (import.meta.env.DEV) console.log(`syncFull(${label}): hit MAX_SYNC_PAGES, stopping`); // eslint-disable-line no-console
      break;
    }
  } while (pageToken);
}

/** Returns true if incremental sync succeeded, false if we need a full sync fallback. */
async function trySyncIncremental(
  account: Account,
  startHistoryId: string,
  onProgress?: (n: number) => void
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
    });
    params.append('historyTypes', 'labelAdded');
    params.append('historyTypes', 'labelRemoved');

    const res = await gmailGetRaw(account, `/users/me/history?${params}`);
    if (res.status === 404) return false; // historyId too old → fall back to full sync

    if (!res.ok) throw new Error(`Gmail History API error ${res.status}`);

    const data = await res.json() as {
      history?: Array<{
        messages?: Array<{ id: string; threadId: string }>;
        messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
        labelsAdded?: Array<{ message: { id: string; threadId: string }; labelIds: string[] }>;
        labelsRemoved?: Array<{ message: { id: string; threadId: string }; labelIds: string[] }>;
      }>;
      historyId?: string;
    };

    // Collect unique threadIds that changed
    const changedThreadIds = new Set<string>();
    for (const h of data.history ?? []) {
      for (const m of h.messagesAdded ?? []) changedThreadIds.add(m.message.threadId);
      for (const m of h.labelsAdded ?? []) changedThreadIds.add(m.message.threadId);
      for (const m of h.labelsRemoved ?? []) changedThreadIds.add(m.message.threadId);
      // Fallback: top-level messages array
      for (const m of h.messages ?? []) changedThreadIds.add(m.threadId);
    }

    const ids = Array.from(changedThreadIds);
    for (let i = 0; i < ids.length; i += 50) {
      await Promise.all(ids.slice(i, i + 50).map(id => syncThread(account, id, account.id)));
      onProgress?.(Math.min(i + 50, ids.length));
    }

    // Store the new historyId returned by the history API
    if (data.historyId) {
      await setSetting(account.id, 'historyId', data.historyId);
    }

    return true;
  } catch (e) {
    // Network or unexpected error — fall back to full sync
    if (import.meta.env.DEV) console.warn('Incremental sync failed, falling back to full sync:', e);
    return false;
  }
}

/** gmailGet variant that returns the raw Response so we can inspect status codes */
async function gmailGetRaw(account: Account, path: string): Promise<Response> {
  return fetchWithRetry(`${API}${path}`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  }, path);
}

// ── Attachment detection helper ───────────────────────────
function hasAttachment(message: { payload?: { parts?: MimePart[] } }): boolean {
  function checkParts(parts: MimePart[]): boolean {
    for (const part of parts) {
      const mime: string = part.mimeType ?? '';
      const filename: string = part.filename ?? '';
      if (
        filename.length > 0 &&
        mime !== 'text/plain' &&
        mime !== 'text/html' &&
        !mime.startsWith('multipart/')
      ) {
        return true;
      }
      if (part.parts && checkParts(part.parts)) return true;
    }
    return false;
  }
  const parts = message?.payload?.parts ?? [];
  return checkParts(parts);
}

async function syncThread(account: Account, gmailThreadId: string, accountId: string, _hintLabel?: string): Promise<void> {
  const db = await getDb();

  // Fetch thread metadata; if 404, thread was deleted on server — remove locally
  const res = await gmailGetRaw(account, `/users/me/threads/${gmailThreadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`);
  if (res.status === 404) {
    await db.execute('DELETE FROM threads WHERE id = ?', [gmailThreadId]);
    return;
  }
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: /users/me/threads/${gmailThreadId}`);

  const data = await res.json() as {
    id: string;
    messages: Array<{
      id: string;
      labelIds: string[];
      internalDate: string;
      payload: { headers: Array<{ name: string; value: string }>; parts?: MimePart[] };
      snippet: string;
    }>;
  };

  const msgs = data.messages;
  const first = msgs[0];
  const last = msgs[msgs.length - 1];

  const getHeader = (msg: typeof first, name: string) =>
    msg.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const subject = getHeader(first, 'subject');
  const fromRaw = getHeader(first, 'from');
  const { name: senderName, email: senderEmail } = parseFrom(fromRaw);
  const receivedAt = parseInt(last.internalDate, 10);
  const isUnread = last.labelIds.includes('UNREAD') ? 1 : 0;
  const isStarred = last.labelIds.includes('STARRED') ? 1 : 0;
  const newMessageCount = msgs.length;

  // Derive canonical label from actual Gmail labelIds (priority order)
  const allLabelIds = msgs.flatMap(m => m.labelIds ?? []);
  let label: string;
  let isArchived = 0;
  if (allLabelIds.includes('TRASH')) {
    label = 'TRASH';
    isArchived = 1;
  } else if (allLabelIds.includes('DRAFT')) {
    label = 'DRAFT';
  } else if (allLabelIds.includes('INBOX')) {
    label = 'INBOX';
  } else if (allLabelIds.includes('SENT')) {
    label = 'SENT';
  } else {
    // Not in INBOX, SENT, DRAFT, or TRASH → it's archived
    label = 'INBOX';
    isArchived = 1;
  }

  // Extract category from Gmail labels
  let category = 'personal';
  if (allLabelIds.includes('CATEGORY_PROMOTIONS') || allLabelIds.includes('CATEGORY_FORUMS')) {
    category = 'newsletters';
  } else if (allLabelIds.includes('CATEGORY_UPDATES') || allLabelIds.includes('CATEGORY_SOCIAL')) {
    category = 'updates';
  }

  // Check existing snooze/mute state and message count so we can auto-unsnooze on new messages
  const existing = await db.select<Array<{ snoozed_until: number | null; snooze_label: string | null; message_count: number | null; is_muted: number | null }>>('SELECT snoozed_until, snooze_label, message_count, is_muted FROM threads WHERE id = ?', [gmailThreadId]);
  const row = existing[0] ?? null;

  // Auto-unsnooze: if snoozed and message count grew, clear snooze
  let clearSnooze = false;
  if (row && row.snoozed_until !== null && row.message_count !== null && newMessageCount > row.message_count) {
    clearSnooze = true;
  }
  const snoozedUntil = clearSnooze ? null : (row?.snoozed_until ?? null);
  const snoozeLabel = clearSnooze ? null : (row?.snooze_label ?? null);
  const isMuted = row?.is_muted ?? 0;

  // Backfill messageCountAtSet for reminders that were created before sync
  const reminders = loadReminders();
  const activeReminder = reminders.find(r => r.threadId === gmailThreadId && !r.notified && r.messageCountAtSet === undefined);
  if (activeReminder) {
    activeReminder.messageCountAtSet = newMessageCount;
    localStorage.setItem('kept-followup-reminders', JSON.stringify(reminders));
  }

  // Auto-cancel follow-up reminders if a reply arrived (message count grew)
  if (row && row.message_count !== null && newMessageCount > row.message_count) {
    autoCancelIfReplied(gmailThreadId, newMessageCount);
  }

  await db.execute(
    `INSERT INTO threads
       (id, account_id, subject, snippet, sender_name, sender_email, received_at, is_unread, is_starred, gmail_thread_id, has_attachment, label, message_count, snoozed_until, snooze_label, is_muted, category, is_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id    = excluded.account_id,
       subject       = excluded.subject,
       snippet       = excluded.snippet,
       sender_name   = excluded.sender_name,
       sender_email  = excluded.sender_email,
       received_at   = excluded.received_at,
       is_unread     = excluded.is_unread,
       is_starred    = excluded.is_starred,
       gmail_thread_id = excluded.gmail_thread_id,
       has_attachment = excluded.has_attachment,
       label          = excluded.label,
       message_count  = excluded.message_count,
       snoozed_until  = CASE WHEN excluded.snoozed_until IS NULL THEN NULL ELSE COALESCE(threads.snoozed_until, excluded.snoozed_until) END,
       snooze_label   = CASE WHEN excluded.snoozed_until IS NULL THEN NULL ELSE COALESCE(threads.snooze_label, excluded.snooze_label) END,
       is_muted       = COALESCE(threads.is_muted, excluded.is_muted),
       category       = excluded.category,
       is_archived    = excluded.is_archived`,
    [gmailThreadId, accountId, subject, last.snippet, senderName, senderEmail, receivedAt, isUnread, isStarred, gmailThreadId, hasAttachment(last) ? 1 : 0, label, newMessageCount, snoozedUntil, snoozeLabel, isMuted, category, isArchived]
  );
}





// ── Actions ───────────────────────────────────────────────
export async function markRead(account: Account, thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_unread = 0 WHERE id = ?', [thread.id]);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['UNREAD'] });
}

export async function markUnread(account: Account, thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_unread = 1 WHERE id = ?', [thread.id]);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { addLabelIds: ['UNREAD'] });
}

// Mark thread as unread by threadId (no Thread object needed)
export async function markThreadUnread(account: Account, threadId: string): Promise<void> {
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${threadId}/modify`, { addLabelIds: ['UNREAD'] });
}

// Report spam (add SPAM, remove INBOX)
export async function reportSpam(account: Account, threadId: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_archived = 1 WHERE gmail_thread_id = ?', [threadId]);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${threadId}/modify`, { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] });
}

// Move to label (add target label, optionally remove INBOX)
export async function moveToLabel(account: Account, threadId: string, labelId: string, removeFromInbox = true): Promise<void> {
  if (removeFromInbox) {
    const db = await getDb();
    await db.execute('UPDATE threads SET is_archived = 1 WHERE gmail_thread_id = ?', [threadId]);
  }
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  const removeLabelIds = removeFromInbox ? ['INBOX'] : [];
  await gmailPost(a, `/users/me/threads/${threadId}/modify`, { addLabelIds: [labelId], removeLabelIds });
}

// Fetch user's labels for the move-to picker
export async function fetchLabels(account: Account): Promise<Array<{id: string, name: string}>> {
  const a = await ensureFreshToken(account);
  const data = await gmailGet(a, '/users/me/labels') as { labels?: Array<{ id: string; name: string; type: string }> };
  return (data.labels || []).filter((l) => l.type === 'user').map((l) => ({ id: l.id, name: l.name }));
}

export async function toggleStar(account: Account, thread: Thread, targetStarred?: boolean): Promise<boolean> {
  const newStarred = targetStarred ?? !thread.isStarred;
  const db = await getDb();
  await db.execute('UPDATE threads SET is_starred = ? WHERE id = ?', [newStarred ? 1 : 0, thread.id]);
  if (import.meta.env.VITE_E2E === '1') return newStarred;
  const a = await ensureFreshToken(account);
  if (newStarred) {
    await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { addLabelIds: ['STARRED'] });
  } else {
    await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['STARRED'] });
  }
  return newStarred;
}

export async function archiveThread(account: Account, thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_archived = 1 WHERE id = ?', [thread.id]);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['INBOX'] });
}

/** Batch archive: chunked parallel API calls to avoid Gmail rate limits. */
export async function archiveThreads(account: Account, threads: Thread[]): Promise<void> {
  if (threads.length === 0) return;
  const db = await getDb();
  const ids = threads.map(t => t.id);
  await db.execute(`UPDATE threads SET is_archived = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await chunkedParallel(threads, 50, t =>
    gmailPost(a, `/users/me/threads/${t.gmailThreadId}/modify`, { removeLabelIds: ['INBOX'] })
  );
}

export async function unarchiveThread(account: Account, thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_archived = 0 WHERE id = ?', [thread.id]);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { addLabelIds: ['INBOX'] });
}

/** Batch unarchive: chunked parallel API calls to avoid Gmail rate limits. */
export async function unarchiveThreads(account: Account, threads: Thread[]): Promise<void> {
  if (threads.length === 0) return;
  const db = await getDb();
  const ids = threads.map(t => t.id);
  await db.execute(`UPDATE threads SET is_archived = 0 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await chunkedParallel(threads, 50, t =>
    gmailPost(a, `/users/me/threads/${t.gmailThreadId}/modify`, { addLabelIds: ['INBOX'] })
  );
}

export async function trashThread(account: Account, thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_archived = 1, label = \'TRASH\' WHERE id = ?', [thread.id]);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/trash`, {});
}

/** Batch trash: chunked parallel API calls to avoid Gmail rate limits. */
export async function trashThreads(account: Account, threads: Thread[]): Promise<void> {
  if (threads.length === 0) return;
  const db = await getDb();
  const ids = threads.map(t => t.id);
  await db.execute(`UPDATE threads SET is_archived = 1, label = 'TRASH' WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  if (import.meta.env.VITE_E2E === '1') return;
  const a = await ensureFreshToken(account);
  await chunkedParallel(threads, 50, t =>
    gmailPost(a, `/users/me/threads/${t.gmailThreadId}/trash`, {})
  );
}

export async function untrashThread(account: Account, thread: Thread): Promise<void> {
  await gmailPost(account, `/users/me/threads/${thread.gmailThreadId}/untrash`, {});
}

/** Batch untrash: chunked parallel API calls to avoid Gmail rate limits. */
export async function untrashThreads(account: Account, threads: Thread[]): Promise<void> {
  if (threads.length === 0) return;
  const db = await getDb();
  const ids = threads.map(t => t.id);
  await db.execute(`UPDATE threads SET is_archived = 0, label = 'INBOX' WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const a = await ensureFreshToken(account);
  await chunkedParallel(threads, 50, t =>
    gmailPost(a, `/users/me/threads/${t.gmailThreadId}/untrash`, {})
  );
}

export async function blockSender(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  const db = await getDb();

  // 1. Archive the thread
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['INBOX'] });

  // 2. Apply Gmail label kept/blocked (create if needed)
  const labelId = await ensureLabel(a, 'kept/blocked');
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { addLabelIds: [labelId] });

  // 3. Attempt unsubscribe (best effort — fire and forget)
  tryUnsubscribe(a, thread.gmailThreadId).catch(() => {});

  // 4. Mark blocked locally + hide
  await db.execute('UPDATE threads SET is_blocked = 1, is_archived = 1 WHERE id = ?', [thread.id]);
  await db.execute(
    'INSERT OR REPLACE INTO blocked_senders (email, account_id) VALUES (?, ?)',
    [thread.senderEmail, account.id]
  );
  // Block all existing threads from this sender
  await db.execute(
    'UPDATE threads SET is_blocked = 1, is_archived = 1 WHERE sender_email = ? AND account_id = ?',
    [thread.senderEmail, account.id]
  );
}


export async function muteThread(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['INBOX'] });
  const db = await getDb();
  await db.execute('UPDATE threads SET is_muted = 1 WHERE id = ?', [thread.id]);
}


async function ensureLabel(account: Account, name: string): Promise<string> {
  const res = await gmailGet(account, '/users/me/labels') as { labels: Array<{ id: string; name: string }> };
  const existing = res.labels.find(l => l.name === name);
  if (existing) return existing.id;
  const created = await gmailPost(account, '/users/me/labels', { name, labelListVisibility: 'labelHide', messageListVisibility: 'hide' }) as { id: string };
  return created.id;
}

async function tryUnsubscribe(account: Account, gmailThreadId: string): Promise<void> {
  const thread = await gmailGet(account, `/users/me/threads/${gmailThreadId}?format=metadata&metadataHeaders=List-Unsubscribe`) as {
    messages: Array<{ payload: { headers: Array<{ name: string; value: string }> } }>;
  };
  const header = thread.messages[0]?.payload?.headers?.find(h => h.name.toLowerCase() === 'list-unsubscribe')?.value;
  if (!header) return;
  const mailto = header.match(/<mailto:([^>]+)>/)?.[1];
  if (mailto) {
    const [to, subject] = mailto.split('?subject=');
    await sendEmail(account, { to, subject: subject ?? 'unsubscribe', body: 'unsubscribe', threadId: undefined });
  }
}

// ── Send / reply ──────────────────────────────────────────
interface SendOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  threadId?: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: Uint8Array }>;
}

interface DraftOptions {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  threadId?: string;
}

// ── Drafts API ────────────────────────────────────────────

export async function createDraft(account: Account, opts: DraftOptions): Promise<string> {
  const a = await ensureFreshToken(account);
  const raw = buildMimeRaw(a.email, opts.to, opts.cc, opts.subject, opts.body);
  const payload: Record<string, unknown> = { message: { raw } };
  if (opts.threadId) payload.message = { raw, threadId: opts.threadId };
  const res = await gmailPost(a, '/users/me/drafts', payload) as { id: string };
  return res.id;
}

export async function updateDraft(account: Account, draftId: string, opts: DraftOptions): Promise<void> {
  const a = await ensureFreshToken(account);
  const raw = buildMimeRaw(a.email, opts.to, opts.cc, opts.subject, opts.body);
  const payload: Record<string, unknown> = { message: { raw } };
  if (opts.threadId) payload.message = { raw, threadId: opts.threadId };
  await gmailPut(a, `/users/me/drafts/${draftId}`, payload);
}

export async function deleteDraft(account: Account, draftId: string): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailDelete(a, `/users/me/drafts/${draftId}`);
}

/** Fetch a draft's full content by Gmail thread ID. Returns null if no draft found. */
export async function fetchDraftByThread(account: Account, gmailThreadId: string): Promise<{
  draftId: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
} | null> {
  const a = await ensureFreshToken(account);
  // List drafts filtered by the thread's message — Gmail doesn't support threadId filter on drafts.list,
  // so we list recent drafts and match by thread ID (or just get the thread and find the draft message).
  // Approach: use threads.get to find the draft message ID, then list drafts and match.
  const draftsRes = await gmailGet(a, '/users/me/drafts?maxResults=100') as {
    drafts?: Array<{ id: string; message: { id: string; threadId: string } }>;
  };
  const drafts = draftsRes.drafts ?? [];
  const match = drafts.find(d => d.message.threadId === gmailThreadId);
  if (!match) return null;

  // Fetch the full draft to get headers and body
  const full = await gmailGet(a, `/users/me/drafts/${match.id}?format=full`) as {
    id: string;
    message: {
      payload: MimePart & { headers: Array<{ name: string; value: string }> };
    };
  };
  const headers = full.message.payload.headers;
  const getH = (n: string) => headers.find(h => h.name.toLowerCase() === n)?.value ?? '';
  const body = extractTextBody(full.message.payload);

  return {
    draftId: full.id,
    to: getH('to'),
    cc: getH('cc'),
    subject: getH('subject'),
    body,
  };
}

function buildMimeRaw(from: string, to: string, cc: string | undefined, subject: string, body: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].filter(Boolean);
  return btoa(unescape(encodeURIComponent(lines.join('\r\n')))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function sendEmail(account: Account, opts: SendOptions): Promise<void> {
  const a = await ensureFreshToken(account);

  let raw: string;

  // Helper to build multipart/alternative body (text + html)
  function buildAlternativePart(altBoundary: string): string {
    const altLines = [
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      opts.body,
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      opts.htmlBody!,
      `--${altBoundary}--`,
    ];
    return altLines.join('\r\n');
  }

  const hasHtml = !!opts.htmlBody;

  if (opts.attachments && opts.attachments.length > 0) {
    // Multipart/mixed with nested multipart/alternative for text+html
    const mixBoundary = `----=_Mix_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const headerLines = [
      `From: ${account.email}`,
      `To: ${opts.to}`,
      opts.cc ? `Cc: ${opts.cc}` : '',
      opts.bcc ? `Bcc: ${opts.bcc}` : '',
      `Subject: ${opts.subject}`,
      opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${mixBoundary}"`,
      '',
    ].filter(Boolean);

    const parts: string[] = [headerLines.join('\r\n')];

    if (hasHtml) {
      parts.push([
        `--${mixBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
        buildAlternativePart(altBoundary),
      ].join('\r\n'));
    } else {
      parts.push([
        `--${mixBoundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        opts.body,
      ].join('\r\n'));
    }

    for (const att of opts.attachments) {
      const b64 = uint8ArrayToBase64(att.data);
      parts.push([
        `--${mixBoundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        b64,
      ].join('\r\n'));
    }

    parts.push(`--${mixBoundary}--`);
    const mimeMessage = parts.join('\r\n');
    raw = btoa(unescape(encodeURIComponent(mimeMessage))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } else if (hasHtml) {
    // Multipart/alternative (text + html, no attachments)
    const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const lines = [
      `From: ${account.email}`,
      `To: ${opts.to}`,
      opts.cc ? `Cc: ${opts.cc}` : '',
      opts.bcc ? `Bcc: ${opts.bcc}` : '',
      `Subject: ${opts.subject}`,
      opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      buildAlternativePart(altBoundary),
    ].filter(Boolean);
    raw = btoa(unescape(encodeURIComponent(lines.join('\r\n')))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } else {
    // Simple text email
    const lines = [
      `From: ${account.email}`,
      `To: ${opts.to}`,
      opts.cc ? `Cc: ${opts.cc}` : '',
      opts.bcc ? `Bcc: ${opts.bcc}` : '',
      `Subject: ${opts.subject}`,
      opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      opts.body,
    ].filter(Boolean);
    raw = btoa(unescape(encodeURIComponent(lines.join('\r\n')))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  const payload: Record<string, string> = { raw };
  if (opts.threadId) payload.threadId = opts.threadId;
  await gmailPost(a, '/users/me/messages/send', payload);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Fetch full message body ───────────────────────────────
export async function fetchMessageBody(account: Account, gmailThreadId: string): Promise<{
  messages: Array<{ from: string; to: string; cc: string; replyTo: string; body: string; htmlBody: string | null; sanitizedHtml: string | null; receivedAt: number; gmailMessageId: string }>;
  lastMessageId: string | null;
}> {
  const db = await getDb();

  // E2E mode: read directly from local DB, no Gmail API
  if (import.meta.env.VITE_E2E === '1') {
    const rows = await db.select<Array<{
      id: string; from_name: string | null; from_email: string; to_addresses: string | null;
      subject: string | null; body_text: string | null; body_html: string | null; received_at: number;
    }>>(
      `SELECT m.id, m.from_name, m.from_email, m.to_addresses, m.subject, m.body_text, m.body_html, m.received_at
       FROM messages m JOIN threads t ON m.thread_id = t.id
       WHERE t.gmail_thread_id = ? ORDER BY m.received_at ASC`,
      [gmailThreadId]
    );
    const messages = rows.map(r => ({
      from: r.from_name ? `${r.from_name} <${r.from_email}>` : r.from_email,
      to: r.to_addresses ?? '',
      cc: '',
      replyTo: '',
      body: r.body_text ?? '',
      htmlBody: r.body_html ?? null,
      sanitizedHtml: r.body_html ?? null,
      receivedAt: r.received_at,
      gmailMessageId: r.id,
    }));
    return { messages, lastMessageId: messages.length > 0 ? messages[messages.length - 1].gmailMessageId : null };
  }

  const a = await ensureFreshToken(account);

  // Check for cached sanitized HTML for messages in this thread
  const cachedRows = await db.select<Array<{ gmail_message_id: string; sanitized_html: string | null }>>(
    'SELECT gmail_message_id, sanitized_html FROM messages WHERE thread_id = ? AND sanitized_html IS NOT NULL',
    [gmailThreadId]
  ).catch(() => [] as Array<{ gmail_message_id: string; sanitized_html: string | null }>);
  const sanitizedCache = new Map(cachedRows.map(r => [r.gmail_message_id, r.sanitized_html]));

  let data: { messages: Array<{ id: string; internalDate: string; payload: MimePart & { headers: Array<{ name: string; value: string }> } }> };
  try {
    data = await gmailGet(a, `/users/me/threads/${gmailThreadId}?format=full`) as typeof data;
  } catch (apiErr) {
    // API failed (404 = thread purged, network error, etc.) — fall back to local DB
    console.warn('Gmail API fetch failed, falling back to local DB:', apiErr);
    const rows = await db.select<Array<{
      id: string; from_name: string | null; from_email: string; to_addresses: string | null;
      subject: string | null; body_text: string | null; body_html: string | null; received_at: number;
    }>>(
      `SELECT m.id, m.from_name, m.from_email, m.to_addresses, m.subject, m.body_text, m.body_html, m.received_at
       FROM messages m JOIN threads t ON m.thread_id = t.id
       WHERE t.gmail_thread_id = ? ORDER BY m.received_at ASC`,
      [gmailThreadId]
    );
    if (rows.length === 0) throw apiErr; // No local data either — re-throw original error
    const messages = rows.map(r => ({
      from: r.from_name ? `${r.from_name} <${r.from_email}>` : r.from_email,
      to: r.to_addresses ?? '',
      cc: '',
      replyTo: '',
      body: r.body_text ?? '',
      htmlBody: r.body_html ?? null,
      sanitizedHtml: r.body_html ?? null,
      receivedAt: r.received_at,
      gmailMessageId: r.id,
    }));
    return { messages, lastMessageId: messages.length > 0 ? messages[messages.length - 1].gmailMessageId : null };
  }
  const msgs = data.messages ?? [];
  const lastMessageId = msgs.length > 0 ? msgs[msgs.length - 1].id : null;

  // Extract and store attachment metadata (idempotent)
  const allAttachments: AttachmentMeta[] = [];
  for (const msg of msgs) {
    allAttachments.push(...extractAttachmentMetas(msg.payload, msg.id, gmailThreadId, a.id));
  }
  saveAttachmentMetas(allAttachments).catch(() => {}); // best-effort, don't block render

  return {
    messages: msgs.map(msg => {
      const getH = (n: string) => msg.payload.headers.find(h => h.name.toLowerCase() === n)?.value ?? '';
      const body = extractTextBody(msg.payload);
      const htmlBody = extractHtmlBody(msg.payload);
      const sanitizedHtml = sanitizedCache.get(msg.id) ?? null;
      return { from: getH('from'), to: getH('to'), cc: getH('cc'), replyTo: getH('reply-to'), body, htmlBody, sanitizedHtml, receivedAt: parseInt(msg.internalDate, 10), gmailMessageId: msg.id };
    }),
    lastMessageId,
  };
}

// Recursive MIME part type (supports arbitrary nesting)
export interface MimePart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: MimePart[];
}

function decodeBase64(data: string): string {
  // Convert base64url → base64
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    // Use TextDecoder so non-ASCII chars (UTF-8, ISO-8859, etc.) decode correctly
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    // Last resort fallback
    return atob(b64);
  }
}

function htmlToText(html: string): string {
  // Insert newlines before block tags so content doesn't run together
  const spaced = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|li|blockquote|h[1-6])[^>]*>/gi, '\n');
  const doc = new DOMParser().parseFromString(spaced, 'text/html');
  return (doc.body?.innerText ?? doc.body?.textContent ?? '').trim();
}

function extractTextBody(payload: MimePart, depth = 0): string {
  if (depth > 8) return ''; // guard against pathological nesting

  // Inline body data (non-multipart leaf)
  if (payload.body?.data && !payload.mimeType.startsWith('multipart/')) {
    const text = decodeBase64(payload.body.data);
    if (payload.mimeType === 'text/html') return htmlToText(text);
    return text;
  }

  const parts = payload.parts ?? [];

  // For multipart/alternative, prefer text/plain > text/html > first part
  if (payload.mimeType === 'multipart/alternative') {
    const plain = parts.find(p => p.mimeType === 'text/plain');
    if (plain?.body?.data) return decodeBase64(plain.body.data);
    const html = parts.find(p => p.mimeType === 'text/html');
    if (html?.body?.data) return htmlToText(decodeBase64(html.body.data));
    // Recurse into nested multipart
    for (const p of parts) {
      const result = extractTextBody(p, depth + 1);
      if (result) return result;
    }
    return '';
  }

  // For multipart/mixed and others: collect text from all parts, join with newline
  if (payload.mimeType.startsWith('multipart/')) {
    const texts: string[] = [];
    for (const p of parts) {
      // Skip attachments (parts with filename)
      const isAttachment = (p as { filename?: string }).filename;
      if (isAttachment) continue;
      const t = extractTextBody(p, depth + 1);
      if (t) texts.push(t);
    }
    return texts.join('\n\n');
  }

  return '';
}

/**
 * Extract the HTML body from a MIME message, preferring text/html in multipart/alternative.
 * Returns null if no HTML part is found.
 */
export function extractHtmlBody(payload: MimePart, depth = 0): string | null {
  if (depth > 8) return null;

  // Leaf node with HTML content
  if (payload.body?.data && payload.mimeType === 'text/html') {
    return decodeBase64(payload.body.data);
  }

  const parts = payload.parts ?? [];

  // multipart/alternative: prefer text/html over text/plain
  if (payload.mimeType === 'multipart/alternative') {
    const html = parts.find(p => p.mimeType === 'text/html');
    if (html?.body?.data) return decodeBase64(html.body.data);
    // Recurse into nested multipart
    for (const p of parts) {
      const result = extractHtmlBody(p, depth + 1);
      if (result) return result;
    }
    return null;
  }

  // multipart/mixed, multipart/related: recurse into first HTML-bearing part
  if (payload.mimeType.startsWith('multipart/')) {
    for (const p of parts) {
      const result = extractHtmlBody(p, depth + 1);
      if (result) return result;
    }
  }

  return null;
}

// ── HTTP helpers ──────────────────────────────────────────
/** Retry fetch on 429/5xx with exponential backoff (max 3 attempts). */
async function fetchWithRetry(url: string, init: RequestInit, path: string): Promise<Response> {
  const MAX = 3;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt === MAX) return res; // let caller handle final failure
      const retryAfter = res.headers.get('Retry-After');
      const delay = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 30000) : 1000 * Math.pow(2, attempt - 1);
      console.warn(`Gmail ${res.status} on ${path}, retry ${attempt}/${MAX} in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    return res;
  }
  throw new Error(`fetchWithRetry: unreachable`);
}

async function gmailGet(account: Account, path: string): Promise<unknown> {
  const res = await fetchWithRetry(`${API}${path}`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  }, path);
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${path}`);
  return res.json();
}

async function gmailPost(account: Account, path: string, body: unknown): Promise<unknown> {
  const res = await fetchWithRetry(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, path);
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${path}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function gmailPut(account: Account, path: string, body: unknown): Promise<unknown> {
  const res = await fetchWithRetry(`${API}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, path);
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${path}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function gmailDelete(account: Account, path: string): Promise<void> {
  const res = await fetchWithRetry(`${API}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${account.accessToken}` },
  }, path);
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${path}`);
}

// ── Helpers ───────────────────────────────────────────────
function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].replace(/^"|"$/g, '').trim(), email: match[2] };
  return { name: '', email: raw.trim() };
}

// ── Attachments ──────────────────────────────────────────

export interface AttachmentMeta {
  id: string;
  message_id: string;
  thread_id: string;
  account_id: string;
  filename: string;
  mime_type: string;
  size: number;
  attachment_id: string;
}

/**
 * Extract attachment metadata from a full MIME tree.
 */
function extractAttachmentMetas(
  payload: MimePart,
  messageId: string,
  threadId: string,
  accountId: string
): AttachmentMeta[] {
  const results: AttachmentMeta[] = [];
  let partIdx = 0;

  function walk(part: MimePart) {
    if (part.filename && part.body?.attachmentId) {
      results.push({
        id: `${messageId}_${partIdx}`,
        message_id: messageId,
        thread_id: threadId,
        account_id: accountId,
        filename: part.filename,
        mime_type: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
        attachment_id: part.body.attachmentId,
      });
      partIdx++;
    }
    if (part.parts) part.parts.forEach(walk);
  }
  walk(payload);
  return results;
}

/**
 * Load attachment metadata from DB for a thread.
 */
export async function loadAttachments(threadId: string): Promise<AttachmentMeta[]> {
  const db = await getDb();
  return db.select<AttachmentMeta[]>(
    'SELECT * FROM attachments WHERE thread_id = ? ORDER BY filename',
    [threadId]
  );
}

/**
 * Store attachment metadata to DB (idempotent).
 */
async function saveAttachmentMetas(metas: AttachmentMeta[]): Promise<void> {
  if (!metas.length) return;
  const db = await getDb();
  for (const a of metas) {
    await db.execute(
      `INSERT OR REPLACE INTO attachments (id, message_id, thread_id, account_id, filename, mime_type, size, attachment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.id, a.message_id, a.thread_id, a.account_id, a.filename, a.mime_type, a.size, a.attachment_id]
    );
  }
}

/**
 * Fetch raw attachment bytes from Gmail API.
 */
export async function downloadAttachment(
  account: Account,
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const fresh = await ensureFreshToken(account);
  const url = `${API}/users/me/messages/${messageId}/attachments/${attachmentId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${fresh.accessToken}` },
  });
  if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
  const json = await res.json() as { data: string };
  return base64UrlToBytes(json.data);
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

