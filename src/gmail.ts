// gmail.ts — Gmail API sync, send, reply, block
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
  hasAttachment: boolean;
  gmailThreadId: string;
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

  // Full sync
  await syncFull(a, account.id, onProgress);

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

async function syncFull(account: Account, accountId: string, onProgress?: (n: number) => void): Promise<void> {
  let pageToken: string | undefined;
  let total = 0;
  do {
    const params = new URLSearchParams({ labelIds: 'INBOX', maxResults: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await gmailGet(account, `/users/me/threads?${params}`);
    const data = res as { threads?: Array<{ id: string }>; nextPageToken?: string };
    if (!data.threads) break;

    for (const t of data.threads) {
      await syncThread(account, t.id, accountId);
      total++;
      onProgress?.(total);
    }
    pageToken = data.nextPageToken;
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

async function syncThread(account: Account, gmailThreadId: string, accountId: string): Promise<void> {
  const db = await getDb();
  const data = await gmailGet(account, `/users/me/threads/${gmailThreadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`) as {
    id: string;
    messages: Array<{
      id: string;
      labelIds: string[];
      internalDate: string;
      payload: { headers: Array<{ name: string; value: string }> };
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

  await db.execute(
    `INSERT OR REPLACE INTO threads
       (id, account_id, subject, snippet, sender_name, sender_email, received_at, is_unread, gmail_thread_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [gmailThreadId, accountId, subject, last.snippet, senderName, senderEmail, receivedAt, isUnread, gmailThreadId]
  );
}

// ── Load inbox from DB ────────────────────────────────────
export async function loadThreads(accountId: string, search?: string): Promise<Thread[]> {
  const db = await getDb();
  let sql = `SELECT * FROM threads WHERE account_id = ? AND is_archived = 0 AND is_blocked = 0`;
  const params: (string | number)[] = [accountId];
  if (search) {
    sql += ` AND (subject LIKE ? OR sender_email LIKE ? OR sender_name LIKE ? OR snippet LIKE ?)`;
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  sql += ` ORDER BY received_at DESC LIMIT 500`;
  const rows = await db.select<Array<Record<string, unknown>>>(sql, params);
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
    hasAttachment: (r.has_attachment as number) === 1,
    gmailThreadId: r.gmail_thread_id as string,
  };
}

// ── Actions ───────────────────────────────────────────────
export async function markRead(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['UNREAD'] });
  const db = await getDb();
  await db.execute('UPDATE threads SET is_unread = 0 WHERE id = ?', [thread.id]);
}

export async function archiveThread(account: Account, thread: Thread): Promise<void> {
  const a = await ensureFreshToken(account);
  await gmailPost(a, `/users/me/threads/${thread.gmailThreadId}/modify`, { removeLabelIds: ['INBOX'] });
  const db = await getDb();
  await db.execute('UPDATE threads SET is_archived = 1 WHERE id = ?', [thread.id]);
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
  ].filter(l => l !== undefined);
  const raw = btoa(lines.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payload: Record<string, string> = { raw };
  if (opts.threadId) payload.threadId = opts.threadId;
  await gmailPost(a, '/users/me/messages/send', payload);
}

// ── Fetch full message body ───────────────────────────────
export async function fetchMessageBody(account: Account, gmailThreadId: string): Promise<{
  messages: Array<{ from: string; body: string; receivedAt: number; gmailMessageId: string }>;
}> {
  const a = await ensureFreshToken(account);
  const data = await gmailGet(a, `/users/me/threads/${gmailThreadId}?format=full`) as {
    messages: Array<{
      id: string;
      internalDate: string;
      payload: MimePart & { headers: Array<{ name: string; value: string }> };
    }>;
  };
  return {
    messages: data.messages.map(msg => {
      const getH = (n: string) => msg.payload.headers.find(h => h.name.toLowerCase() === n)?.value ?? '';
      const body = extractTextBody(msg.payload);
      return { from: getH('from'), body, receivedAt: parseInt(msg.internalDate, 10), gmailMessageId: msg.id };
    }),
  };
}

// Recursive MIME part type (supports arbitrary nesting)
interface MimePart {
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
  const monthStart = startOf('month', now);

  const newSenders: Thread[] = [];
  const todayGroup: Thread[] = [];
  const yesterdayGroup: Thread[] = [];
  const thisWeek: Thread[] = [];
  const thisMonth: Thread[] = [];
  const older: Thread[] = [];

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
    if (d >= monthStart) { thisMonth.push(t); continue; }
    older.push(t);
  }

  return [
    { label: 'New senders', threads: newSenders },
    { label: 'Today', threads: todayGroup },
    { label: 'Yesterday', threads: yesterdayGroup },
    { label: 'This week', threads: thisWeek },
    { label: 'This month', threads: thisMonth },
    { label: 'Older', threads: older },
  ].filter(s => s.threads.length > 0);
}

function startOf(unit: 'day' | 'week' | 'month', d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  if (unit === 'week') r.setDate(r.getDate() - r.getDay());
  if (unit === 'month') r.setDate(1);
  return r;
}
