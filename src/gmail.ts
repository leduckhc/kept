// gmail.ts — Gmail API sync, send, reply, block, snooze
import { fetch } from '@tauri-apps/plugin-http';
import { type Account, ensureFreshToken } from './auth';
import { getDb } from './db';

const API = 'https://gmail.googleapis.com/gmail/v1';

export interface Thread {
  id: string;
  subject: string;
  snippet: string;
  senderName: string;
  senderEmail: string;
  receivedAt: number; // unix ms
  isUnread: boolean;
  isArchived: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  gmailThreadId: string;
  snoozedUntil: number | null; // unix ms, null = not snoozed
  snoozeLabel: string | null;
  messageCount: number | null;
  label: string;      // KPT-023: 'INBOX' | 'SENT' | 'DRAFT' | 'STARRED'
  accountId: string;  // KPT-037: which account this thread belongs to
  isMuted: boolean;   // KPT-040: suppressed from inbox permanently
}

// ── Settings helpers ──────────────────────────────────────
async function getSetting(accountId: string, key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string | null }>>(
    'SELECT value FROM settings WHERE key = ? AND account_id = ?',
    [key, accountId]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(accountId: string, key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR REPLACE INTO settings (key, account_id, value) VALUES (?, ?, ?)',
    [key, accountId, value]
  );
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

  // Full sync — INBOX + SENT + DRAFT labels in parallel
  await Promise.all([
    syncFull(a, account.id, 'INBOX', onProgress),
    syncFull(a, account.id, 'SENT'),
    syncFull(a, account.id, 'DRAFT'),
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
    const BATCH = 10;
    for (let i = 0; i < threadIds.length; i += BATCH) {
      await Promise.all(threadIds.slice(i, i + BATCH).map((id: string) => syncThread(account, id, accountId, label)));
      total += Math.min(BATCH, threadIds.length - i);
      onProgress?.(total);
    }
    pageToken = data.nextPageToken;
    page++;
    if (page >= MAX_SYNC_PAGES) {
      console.log(`syncFull(${label}): hit MAX_SYNC_PAGES, stopping`);
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

    let n = 0;
    for (const threadId of changedThreadIds) {
      await syncThread(account, threadId, account.id);
      n++;
      onProgress?.(n);
    }

    // Store the new historyId returned by the history API
    if (data.historyId) {
      await setSetting(account.id, 'historyId', data.historyId);
    }

    return true;
  } catch (e) {
    // Network or unexpected error — fall back to full sync
    console.warn('Incremental sync failed, falling back to full sync:', e);
    return false;
  }
}

/** gmailGet variant that returns the raw Response so we can inspect status codes */
async function gmailGetRaw(account: Account, path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
}

// ── Attachment detection helper ───────────────────────────
function hasAttachment(message: any): boolean {
  function checkParts(parts: any[]): boolean {
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

async function syncThread(account: Account, gmailThreadId: string, accountId: string, label: string = 'INBOX'): Promise<void> {
  const db = await getDb();
  const data = await gmailGet(account, `/users/me/threads/${gmailThreadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`) as {
    id: string;
    messages: Array<{
      id: string;
      labelIds: string[];
      internalDate: string;
      payload: { headers: Array<{ name: string; value: string }>; parts?: any[] };
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

  // Check existing snooze/mute state and message count so we can auto-unsnooze on new messages
  const existing = await db.select<Array<{ snoozed_until: number | null; snooze_label: string | null; message_count: number | null; is_muted: number | null }>>(
    'SELECT snoozed_until, snooze_label, message_count, is_muted FROM threads WHERE id = ?',
    [gmailThreadId]
  );
  const row = existing[0] ?? null;

  // Auto-unsnooze: if snoozed and message count grew, clear snooze
  let clearSnooze = false;
  if (row && row.snoozed_until !== null && row.message_count !== null && newMessageCount > row.message_count) {
    clearSnooze = true;
  }
  const snoozedUntil = clearSnooze ? null : (row?.snoozed_until ?? null);
  const snoozeLabel = clearSnooze ? null : (row?.snooze_label ?? null);
  const isMuted = row?.is_muted ?? 0;

  await db.execute(
    `INSERT INTO threads
       (id, account_id, subject, snippet, sender_name, sender_email, received_at, is_unread, is_starred, gmail_thread_id, has_attachment, label, message_count, snoozed_until, snooze_label, is_muted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       is_muted       = COALESCE(threads.is_muted, excluded.is_muted)`,
    [gmailThreadId, accountId, subject, last.snippet, senderName, senderEmail, receivedAt, isUnread, isStarred, gmailThreadId, hasAttachment(last) ? 1 : 0, label, newMessageCount, snoozedUntil, snoozeLabel, isMuted]
  );
}

// ── Load inbox from DB ────────────────────────────────────
export async function loadThreads(accountId: string, labelOrSearch?: string, search?: string): Promise<Thread[]> {
  const db = await getDb();

  // Overload: loadThreads(accountId, label, search?) — label is one of INBOX/SENT/DRAFT/STARRED
  // Backwards-compat: loadThreads(accountId, search) — old call site passes search string as 2nd arg
  let activeLabel: string;
  let activeSearch: string | undefined;

  const KNOWN_LABELS = ['INBOX', 'SENT', 'DRAFT', 'STARRED'];
  if (labelOrSearch && KNOWN_LABELS.includes(labelOrSearch)) {
    activeLabel = labelOrSearch;
    activeSearch = search;
  } else {
    activeLabel = 'INBOX';
    activeSearch = labelOrSearch; // backwards-compat
  }

  const nowMs = Date.now();

  if (activeSearch) {
    // Try FTS5 first for fast ranked search; fall back to LIKE on any error
    try {
      const ftsQuery = `"${activeSearch.replace(/"/g, '')}"`;
      let ftsSql: string;
      let ftsParams: (string | number)[];
      if (activeLabel === 'STARRED') {
        ftsSql = `
          SELECT t.*
          FROM threads t
          JOIN threads_fts fts ON t.rowid = fts.rowid
          WHERE threads_fts MATCH ?
            AND t.account_id = ?
            AND t.is_starred = 1
            AND t.is_archived = 0
            AND t.is_blocked = 0
            AND (t.is_muted IS NULL OR t.is_muted = 0)
            AND (t.snoozed_until IS NULL OR t.snoozed_until <= ?)
          ORDER BY t.received_at DESC
          LIMIT 500
        `;
        ftsParams = [ftsQuery, accountId, nowMs];
      } else {
        ftsSql = `
          SELECT t.*
          FROM threads t
          JOIN threads_fts fts ON t.rowid = fts.rowid
          WHERE threads_fts MATCH ?
            AND t.account_id = ?
            AND t.label = ?
            AND t.is_archived = 0
            AND t.is_blocked = 0
            AND (t.is_muted IS NULL OR t.is_muted = 0)
            AND (t.snoozed_until IS NULL OR t.snoozed_until <= ?)
          ORDER BY t.received_at DESC
          LIMIT 500
        `;
        ftsParams = [ftsQuery, accountId, activeLabel, nowMs];
      }
      const rows = await db.select<Array<Record<string, unknown>>>(ftsSql, ftsParams);
      return rows.map(rowToThread);
    } catch {
      // FTS5 unavailable — fall back to LIKE
      let likeSql: string;
      const likeParams: (string | number)[] = [accountId];
      if (activeLabel === 'STARRED') {
        likeSql = `SELECT * FROM threads WHERE account_id = ? AND is_starred = 1 AND is_archived = 0 AND is_blocked = 0
                   AND (is_muted IS NULL OR is_muted = 0) AND (snoozed_until IS NULL OR snoozed_until <= ?)`;
        likeParams.push(nowMs);
      } else {
        likeSql = `SELECT * FROM threads WHERE account_id = ? AND label = ? AND is_archived = 0 AND is_blocked = 0
                   AND (is_muted IS NULL OR is_muted = 0) AND (snoozed_until IS NULL OR snoozed_until <= ?)`;
        likeParams.push(activeLabel, nowMs);
      }
      likeSql += ` AND (subject LIKE ? OR sender_email LIKE ? OR sender_name LIKE ? OR snippet LIKE ?) ORDER BY received_at DESC LIMIT 500`;
      const q = `%${activeSearch}%`;
      likeParams.push(q, q, q, q);
      const rows = await db.select<Array<Record<string, unknown>>>(likeSql, likeParams);
      return rows.map(rowToThread);
    }
  }

  // No search — label-aware query
  let sql: string;
  const params: (string | number)[] = [accountId];
  if (activeLabel === 'STARRED') {
    sql = `SELECT * FROM threads WHERE account_id = ? AND is_starred = 1 AND is_archived = 0 AND is_blocked = 0
           AND (is_muted IS NULL OR is_muted = 0) AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY received_at DESC LIMIT 500`;
    params.push(nowMs);
  } else {
    sql = `SELECT * FROM threads WHERE account_id = ? AND label = ? AND is_archived = 0 AND is_blocked = 0
           AND (is_muted IS NULL OR is_muted = 0) AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY received_at DESC LIMIT 500`;
    params.push(activeLabel, nowMs);
  }
  const rows = await db.select<Array<Record<string, unknown>>>(sql, params);
  return rows.map(rowToThread);
}

export async function loadSenderEmails(accountId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ sender_email: string }>>(
    'SELECT DISTINCT sender_email FROM threads WHERE account_id = ? AND is_blocked = 0 ORDER BY received_at DESC LIMIT 200',
    [accountId]
  );
  return rows.map(r => r.sender_email);
}

/** Returns unique emails the user has sent to (people we replied to = "known senders"). */
export async function loadRepliedToSenders(accountId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ sender_email: string }>>(
    `SELECT DISTINCT sender_email FROM threads WHERE account_id = ? AND label = 'SENT'`,
    [accountId]
  );
  return rows.map(r => r.sender_email);
}

/** Load all unique sender emails from inbox history (for baseline seeding) */
export async function loadAllSenderEmails(accountId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ sender_email: string }>>(
    `SELECT DISTINCT sender_email FROM threads WHERE account_id = ?`,
    [accountId]
  );
  return rows.map(r => r.sender_email);
}

export async function loadSnoozedThreads(accountId: string): Promise<Thread[]> {
  const db = await getDb();
  const nowMs = Date.now();
  const sql = `SELECT * FROM threads WHERE account_id = ? AND is_archived = 0 AND is_blocked = 0
               AND snoozed_until IS NOT NULL AND snoozed_until > ?
               ORDER BY snoozed_until ASC LIMIT 500`;
  const rows = await db.select<Array<Record<string, unknown>>>(sql, [accountId, nowMs]);
  return rows.map(rowToThread);
}

export async function loadStarredThreads(accountId: string): Promise<Thread[]> {
  const db = await getDb();
  const sql = `SELECT * FROM threads WHERE account_id = ? AND is_blocked = 0 AND is_starred = 1
               ORDER BY received_at DESC LIMIT 500`;
  const rows = await db.select<Array<Record<string, unknown>>>(sql, [accountId]);
  return rows.map(rowToThread);
}

function rowToThread(r: Record<string, unknown>): Thread {
  return {
    id: r.id as string,
    subject: (r.subject as string) ?? '(no subject)',
    snippet: (r.snippet as string) ?? '',
    senderName: (r.sender_name as string) ?? '',
    senderEmail: r.sender_email as string,
    receivedAt: r.received_at as number,
    isUnread: (r.is_unread as number) === 1,
    isArchived: (r.is_archived as number) === 1,
    isStarred: (r.is_starred as number) === 1,
    hasAttachment: (r.has_attachment as number) === 1,
    gmailThreadId: r.gmail_thread_id as string,
    snoozedUntil: (r.snoozed_until as number | null) ?? null,
    snoozeLabel: (r.snooze_label as string | null) ?? null,
    messageCount: (r.message_count as number | null) ?? null,
    label: (r.label as string) ?? 'INBOX',
    accountId: (r.account_id as string) ?? '',
    isMuted: (r.is_muted as number) === 1,
  };
}

// ── Actions ───────────────────────────────────────────────
export async function markRead(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['UNREAD'] });
  const db = await getDb();
  await db.execute('UPDATE threads SET is_unread = 0 WHERE id = ?', [thread.id]);
}

export async function markUnread(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { addLabelIds: ['UNREAD'] });
  const db = await getDb();
  await db.execute('UPDATE threads SET is_unread = 1 WHERE id = ?', [thread.id]);
}

export async function toggleStar(account: Account, thread: Thread): Promise<boolean> {
  const a = await ensureFreshToken(account);
  const newStarred = !thread.isStarred;
  if (newStarred) {
    await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { addLabelIds: ['STARRED'] });
  } else {
    await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['STARRED'] });
  }
  const db = await getDb();
  await db.execute('UPDATE threads SET is_starred = ? WHERE id = ?', [newStarred ? 1 : 0, thread.id]);
  return newStarred;
}

export async function archiveThread(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['INBOX'] });
  const db = await getDb();
  await db.execute('UPDATE threads SET is_archived = 1 WHERE id = ?', [thread.id]);
}

export async function unarchiveThread(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { addLabelIds: ['INBOX'] });
  const db = await getDb();
  await db.execute('UPDATE threads SET is_archived = 0 WHERE id = ?', [thread.id]);
}

export async function trashThread(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/trash`, {});
  const db = await getDb();
  await db.execute('UPDATE threads SET is_archived = 1 WHERE id = ?', [thread.id]);
}

export async function untrashThread(account: Account, thread: Thread): Promise<void> {
  await gmailPost(account, `/users/me/threads/${thread.gmailThreadId}/untrash`, {});
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

// ── Snooze ────────────────────────────────────────────────
export async function snoozeThread(thread: Thread, untilMs: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE threads SET snoozed_until = ?, snooze_label = ? WHERE id = ?',
    [untilMs, 'Snoozed', thread.id]
  );
}

export async function unsnoozeThread(thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE threads SET snoozed_until = NULL, snooze_label = NULL WHERE id = ?',
    [thread.id]
  );
}

export async function muteThread(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['INBOX'] });
  const db = await getDb();
  await db.execute('UPDATE threads SET is_muted = 1 WHERE id = ?', [thread.id]);
}

export async function unmuteThread(thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_muted = 0 WHERE id = ?', [thread.id]);
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
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
}

export async function sendEmail(account: Account, opts: SendOptions): Promise<void> {
  const a = await ensureFreshToken(account);
  const lines = [
    `From: ${account.email}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    opts.body,
  ].filter(Boolean);
  const raw = btoa(unescape(encodeURIComponent(lines.join('\r\n')))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payload: Record<string, string> = { raw };
  if (opts.threadId) payload.threadId = opts.threadId;
  await gmailPost(a, '/users/me/messages/send', payload);
}

// ── Fetch full message body ───────────────────────────────
export async function fetchMessageBody(account: Account, gmailThreadId: string): Promise<{
  messages: Array<{ from: string; body: string; htmlBody: string | null; receivedAt: number; gmailMessageId: string }>;
  lastMessageId: string | null;
}> {
  const a = await ensureFreshToken(account);
  // schema needs gmail_thread_id + position columns on messages table for caching
  // (cache read/write skipped until migration adds those columns)
  const data = await gmailGet(a, `/users/me/threads/${gmailThreadId}?format=full`) as {
    messages: Array<{
      id: string;
      internalDate: string;
      payload: MimePart & { headers: Array<{ name: string; value: string }> };
    }>;
  };
  const msgs = data.messages ?? [];
  const lastMessageId = msgs.length > 0 ? msgs[msgs.length - 1].id : null;
  return {
    messages: msgs.map(msg => {
      const getH = (n: string) => msg.payload.headers.find(h => h.name.toLowerCase() === n)?.value ?? '';
      const body = extractTextBody(msg.payload);
      const htmlBody = extractHtmlBody(msg.payload);
      return { from: getH('from'), body, htmlBody, receivedAt: parseInt(msg.internalDate, 10), gmailMessageId: msg.id };
    }),
    lastMessageId,
  };
}

// Recursive MIME part type (supports arbitrary nesting)
export interface MimePart {
  mimeType: string;
  body?: { data?: string };
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
async function gmailGet(account: Account, path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${path}`);
  return res.json();
}

async function gmailPost(account: Account, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${path}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ── Helpers ───────────────────────────────────────────────
function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].replace(/^"|"$/g, '').trim(), email: match[2] };
  return { name: '', email: raw.trim() };
}

export function groupBySection(threads: Thread[]): Array<{ label: string; threads: Thread[] }> {
  const now = new Date();
  const today = startOf('day', now);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekStart = startOf('week', now);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
  const monthStart = startOf('month', now);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const newSenders: Thread[] = [];
  const todayGroup: Thread[] = [];
  const yesterdayGroup: Thread[] = [];
  const thisWeek: Thread[] = [];
  const lastWeek: Thread[] = [];
  const thisMonth: Thread[] = [];
  const lastMonth: Thread[] = [];
  const byYear: Record<number, Thread[]> = {};

  // Detect new senders = first time we see this sender (crude: no prior archived threads needed)
  // For now: unread threads from senders with only 1 thread total
  const senderCounts: Record<string, number> = {};
  for (const t of threads) senderCounts[t.senderEmail] = (senderCounts[t.senderEmail] ?? 0) + 1;

  for (const t of threads) {
    const d = new Date(t.receivedAt);
    if (senderCounts[t.senderEmail] === 1 && t.isUnread) {
      newSenders.push(t); continue;
    }
    if (d >= today) { todayGroup.push(t); continue; }
    if (d >= yesterday) { yesterdayGroup.push(t); continue; }
    if (d >= weekStart) { thisWeek.push(t); continue; }
    if (d >= lastWeekStart) { lastWeek.push(t); continue; }
    if (d >= monthStart) { thisMonth.push(t); continue; }
    if (d >= lastMonthStart) { lastMonth.push(t); continue; }
    // Group by year
    const year = d.getFullYear();
    (byYear[year] ??= []).push(t);
  }

  const sections: Array<{ label: string; threads: Thread[] }> = [
    { label: 'New senders', threads: newSenders },
    { label: 'Today', threads: todayGroup },
    { label: 'Yesterday', threads: yesterdayGroup },
    { label: 'This week', threads: thisWeek },
    { label: 'Last week', threads: lastWeek },
    { label: MONTH_NAMES[now.getMonth()], threads: thisMonth },
    { label: MONTH_NAMES[(now.getMonth() - 1 + 12) % 12], threads: lastMonth },
  ];

  // Add year groups sorted descending
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  for (const y of years) {
    sections.push({ label: String(y), threads: byYear[y] });
  }

  return sections.filter(s => s.threads.length > 0);
}

function startOf(unit: 'day' | 'week' | 'month', d: Date): Date {
  if (unit === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (unit === 'week') {
    const day = d.getDay(); // 0=Sun
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Returns true if this account has completed at least one sync (historyId is set).
 * Used to gate notifications: on the very first sync we don't spam. */
export async function hasSyncedBefore(accountId: string): Promise<boolean> {
  const historyId = await getSetting(accountId, 'historyId');
  return historyId !== null;
}
