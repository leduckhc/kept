// store.ts — Provider-agnostic SQLite-only data access (no HTTP/Gmail API calls)

import { getDb } from './db';

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
  isSetAside: boolean; // KPT-080: shelf — quick-access, no time component
  category: string;   // 'personal' | 'newsletters' | 'updates'
  userLabels: string; // KPT-085: comma-separated auto-labels
}

// ── Settings helpers ──────────────────────────────────────
export async function getSetting(accountId: string, key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string | null }>>(
    'SELECT value FROM settings WHERE key = ? AND account_id = ?',
    [key, accountId]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(accountId: string, key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR REPLACE INTO settings (key, account_id, value) VALUES (?, ?, ?)',
    [key, accountId, value]
  );
}

// ── Row mapper ────────────────────────────────────────────
export function rowToThread(r: Record<string, unknown>): Thread {
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
    isSetAside: (r.is_set_aside as number) === 1,
    category: (r.category as string) ?? 'personal',
    userLabels: (r.user_labels as string) ?? '',
  };
}

// ── Load inbox from DB ────────────────────────────────────
export async function loadThreads(accountId: string, labelOrSearch?: string, search?: string): Promise<Thread[]> {
  const db = await getDb();

  let activeLabel: string;
  let activeSearch: string | undefined;

  const KNOWN_LABELS = ['INBOX', 'SENT', 'DRAFT', 'STARRED', 'TRASH', 'ARCHIVE'];
  if (labelOrSearch && KNOWN_LABELS.includes(labelOrSearch)) {
    activeLabel = labelOrSearch;
    activeSearch = search;
  } else {
    activeLabel = 'INBOX';
    activeSearch = labelOrSearch;
  }

  const nowMs = Date.now();

  if (activeSearch) {
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
           AND (is_muted IS NULL OR is_muted = 0) AND (is_set_aside IS NULL OR is_set_aside = 0) AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY received_at DESC LIMIT 500`;
    params.push(nowMs);
  } else if (activeLabel === 'TRASH') {
    sql = `SELECT * FROM threads WHERE account_id = ? AND label = 'TRASH' ORDER BY received_at DESC LIMIT 500`;
  } else if (activeLabel === 'ARCHIVE') {
    sql = `SELECT * FROM threads WHERE account_id = ? AND is_archived = 1 AND label != 'TRASH' ORDER BY received_at DESC LIMIT 500`;
  } else {
    sql = `SELECT * FROM threads WHERE account_id = ? AND label = ? AND is_archived = 0 AND is_blocked = 0
           AND (is_muted IS NULL OR is_muted = 0) AND (is_set_aside IS NULL OR is_set_aside = 0) AND (snoozed_until IS NULL OR snoozed_until <= ?) ORDER BY received_at DESC LIMIT 500`;
    params.push(activeLabel, nowMs);
  }
  const rows = await db.select<Array<Record<string, unknown>>>(sql, params);
  return rows.map(rowToThread);
}

/**
 * Unified inbox: single SQL query across all accounts (no N+1).
 */
export async function loadThreadsUnified(accountFilter?: string | null, label = 'INBOX'): Promise<Thread[]> {
  const db = await getDb();
  const nowMs = Date.now();
  let sql: string;
  let params: (string | number)[];

  if (label === 'STARRED') {
    sql = `SELECT * FROM threads WHERE is_starred = 1 AND is_archived = 0 AND is_blocked = 0
           AND (is_muted IS NULL OR is_muted = 0)
           AND (is_set_aside IS NULL OR is_set_aside = 0)
           AND (snoozed_until IS NULL OR snoozed_until <= ?)`;
    params = [nowMs];
  } else if (label === 'TRASH') {
    sql = `SELECT * FROM threads WHERE label = 'TRASH'`;
    params = [];
  } else if (label === 'ARCHIVE') {
    sql = `SELECT * FROM threads WHERE is_archived = 1 AND label != 'TRASH'`;
    params = [];
  } else {
    sql = `SELECT * FROM threads WHERE label = ? AND is_archived = 0 AND is_blocked = 0
           AND (is_muted IS NULL OR is_muted = 0)
           AND (is_set_aside IS NULL OR is_set_aside = 0)
           AND (snoozed_until IS NULL OR snoozed_until <= ?)`;
    params = [label, nowMs];
  }

  if (accountFilter) {
    sql += ' AND account_id = ?';
    params.push(accountFilter);
  }

  sql += ' ORDER BY received_at DESC LIMIT 500';
  const rows = await db.select<Array<Record<string, unknown>>>(sql, params);
  return rows.map(rowToThread);
}

/** Load VIP senders for ALL accounts (union). */
export async function getAllVipSenders(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ email: string }>>('SELECT DISTINCT email FROM vip_senders');
  return rows.map(r => r.email);
}

/** Load grouped senders for ALL accounts (union). */
export async function getAllGroupedSenders(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ email: string }>>("SELECT DISTINCT email FROM grouped_senders WHERE group_type IS NULL OR group_type != 'domain'");
  return rows.map(r => r.email);
}

/** Load grouped domains for ALL accounts (union). */
export async function getAllGroupedDomains(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ email: string }>>("SELECT DISTINCT email FROM grouped_senders WHERE group_type = 'domain'");
  return rows.map(r => r.email);
}

/** FTS search across all accounts (unified). */
export async function searchThreadsUnified(query: string, accountFilter?: string | null, label = 'INBOX'): Promise<Thread[]> {
  const db = await getDb();
  const nowMs = Date.now();
  const ftsQuery = `"${query.replace(/"/g, '')}"`;
  let sql: string;
  let params: (string | number)[];

  if (label === 'STARRED') {
    sql = `SELECT t.* FROM threads t
           JOIN threads_fts fts ON t.rowid = fts.rowid
           WHERE threads_fts MATCH ?
             AND t.is_starred = 1 AND t.is_archived = 0 AND t.is_blocked = 0
             AND (t.is_muted IS NULL OR t.is_muted = 0)
             AND (t.snoozed_until IS NULL OR t.snoozed_until <= ?)`;
    params = [ftsQuery, nowMs];
  } else {
    sql = `SELECT t.* FROM threads t
           JOIN threads_fts fts ON t.rowid = fts.rowid
           WHERE threads_fts MATCH ?
             AND t.label = ? AND t.is_archived = 0 AND t.is_blocked = 0
             AND (t.is_muted IS NULL OR t.is_muted = 0)
             AND (t.snoozed_until IS NULL OR t.snoozed_until <= ?)`;
    params = [ftsQuery, label, nowMs];
  }

  if (accountFilter) {
    sql += ' AND t.account_id = ?';
    params.push(accountFilter);
  }

  sql += ' ORDER BY t.received_at DESC LIMIT 500';
  try {
    const rows = await db.select<Array<Record<string, unknown>>>(sql, params);
    return rows.map(rowToThread);
  } catch {
    // FTS5 unavailable — fall back to LIKE
    let likeSql = `SELECT * FROM threads WHERE label = ? AND is_archived = 0 AND is_blocked = 0
                   AND (is_muted IS NULL OR is_muted = 0)
                   AND (snoozed_until IS NULL OR snoozed_until <= ?)`;
    const likeParams: (string | number)[] = [label, nowMs];
    if (accountFilter) {
      likeSql += ' AND account_id = ?';
      likeParams.push(accountFilter);
    }
    likeSql += ` AND (subject LIKE ? OR sender_email LIKE ? OR sender_name LIKE ? OR snippet LIKE ?) ORDER BY received_at DESC LIMIT 500`;
    const q = `%${query}%`;
    likeParams.push(q, q, q, q);
    const rows = await db.select<Array<Record<string, unknown>>>(likeSql, likeParams);
    return rows.map(rowToThread);
  }
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

// ── Set Aside (shelf) ─────────────────────────────────────
export async function setAsideThread(thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_set_aside = 1 WHERE id = ?', [thread.id]);
}

export async function unsetAsideThread(thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_set_aside = 0 WHERE id = ?', [thread.id]);
}

export async function loadSetAsideThreads(accountId: string): Promise<Thread[]> {
  const db = await getDb();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM threads WHERE account_id = ? AND is_set_aside = 1 ORDER BY received_at DESC',
    [accountId]
  );
  return rows.map(rowToThread);
}

export async function unmuteThread(thread: Thread): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE threads SET is_muted = 0 WHERE id = ?', [thread.id]);
}

/** Returns true if this account has completed at least one sync (historyId is set). */
export async function hasSyncedBefore(accountId: string): Promise<boolean> {
  const historyId = await getSetting(accountId, 'historyId');
  return historyId !== null;
}

// ── Grouped Senders ───────────────────────────────────────
export async function getGroupedSenders(accountId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ email: string }>>(
    'SELECT email FROM grouped_senders WHERE account_id = ?',
    [accountId]
  );
  return rows.map(r => r.email);
}

export async function addGroupedSender(accountId: string, email: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR REPLACE INTO grouped_senders (email, account_id) VALUES (?, ?)',
    [email, accountId]
  );
}

export async function removeGroupedSender(accountId: string, email: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'DELETE FROM grouped_senders WHERE email = ? AND account_id = ?',
    [email, accountId]
  );
}

// ── Grouped Domains ───────────────────────────────────────
export async function getGroupedDomains(accountId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ email: string }>>(
    "SELECT email FROM grouped_senders WHERE account_id = ? AND group_type = 'domain'",
    [accountId]
  );
  return rows.map(r => r.email);
}

export async function addGroupedDomain(accountId: string, domain: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO grouped_senders (email, account_id, group_type) VALUES (?, ?, 'domain')",
    [domain, accountId]
  );
}

export async function removeGroupedDomain(accountId: string, domain: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM grouped_senders WHERE email = ? AND account_id = ? AND group_type = 'domain'",
    [domain, accountId]
  );
}

// ── VIP / Priority Senders (KPT-081) ─────────────────────
export async function getVipSenders(accountId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ email: string }>>(
    'SELECT email FROM vip_senders WHERE account_id = ?',
    [accountId]
  );
  return rows.map(r => r.email);
}

export async function addVipSender(accountId: string, email: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR REPLACE INTO vip_senders (email, account_id) VALUES (?, ?)',
    [email, accountId]
  );
}

export async function removeVipSender(accountId: string, email: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'DELETE FROM vip_senders WHERE email = ? AND account_id = ?',
    [email, accountId]
  );
}

// ── Section grouping (pure logic) ─────────────────────────

let _cachedSections: Array<{ label: string; threads: Thread[]; categoryThreads?: { newsletters: Thread[]; updates: Thread[] }; senderGroups?: Record<string, Thread[]> }> | null = null;
let _cachedSectionsKey = '';

export function invalidateSectionCache() {
  _cachedSections = null;
  _cachedSectionsKey = '';
}

export function groupBySection(threads: Thread[], groupedSenders?: string[], groupedDomains?: string[], vipSenders?: string[]): Array<{ label: string; threads: Thread[]; categoryThreads?: { newsletters: Thread[]; updates: Thread[] }; senderGroups?: Record<string, Thread[]>; domainGroups?: Record<string, Thread[]> }> {
  // Fast cache key: length + boundary timestamps + boundary unread states
  const gsKey = groupedSenders?.join(',') ?? '';
  const gdKey = groupedDomains?.join(',') ?? '';
  const vipKey = vipSenders?.join(',') ?? '';
  const key = `${threads.length}:${threads[0]?.receivedAt}:${threads[threads.length-1]?.receivedAt}:${threads[0]?.isUnread}:${threads[threads.length-1]?.isUnread}:${threads[0]?.isStarred}:${threads[threads.length-1]?.isStarred}:${gsKey}:${gdKey}:${vipKey}`;
  if (_cachedSectionsKey === key && _cachedSections) return _cachedSections;

  const now = new Date();
  const today = startOf('day', now);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekStart = startOf('week', now);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
  const monthStart = startOf('month', now);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const groupedSet = new Set(groupedSenders ?? []);
  const domainSet = new Set(groupedDomains ?? []);
  const vipSet = new Set(vipSenders ?? []);

  // KPT-081: Pull VIP sender threads out into priority section
  const priorityThreads: Thread[] = [];
  const nonVipThreads: Thread[] = [];
  for (const t of threads) {
    if (vipSet.size > 0 && vipSet.has(t.senderEmail)) {
      priorityThreads.push(t);
    } else {
      nonVipThreads.push(t);
    }
  }

  const newSenders: Thread[] = [];
  const todayGroup: Thread[] = [];
  const yesterdayGroup: Thread[] = [];
  const thisWeek: Thread[] = [];
  const lastWeek: Thread[] = [];
  const thisMonth: Thread[] = [];
  const lastMonth: Thread[] = [];
  const byYear: Record<number, Thread[]> = {};

  // Category threads collected globally (not just today)
  const allNewsletters: Thread[] = [];
  const allUpdates: Thread[] = [];

  // Detect new senders = first time we see this sender (crude: no prior archived threads needed)
  const senderCounts: Record<string, number> = {};
  for (const t of nonVipThreads) senderCounts[t.senderEmail] = (senderCounts[t.senderEmail] ?? 0) + 1;

  for (const t of nonVipThreads) {
    const d = new Date(t.receivedAt);

    // Newsletters/updates go into category rows — never into regular time buckets
    if (t.category === 'newsletters') {
      allNewsletters.push(t); continue;
    }
    if (t.category === 'updates') {
      allUpdates.push(t); continue;
    }

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

  // Helper: remove grouped threads from a list, returning only non-grouped threads
  function removeGrouped(list: Thread[]): Thread[] {
    if (groupedSet.size === 0 && domainSet.size === 0) return list;
    return list.filter(t => {
      if (groupedSet.has(t.senderEmail)) return false;
      const domain = t.senderEmail.split('@')[1] ?? '';
      if (domain && domainSet.has(domain)) return false;
      return true;
    });
  }

  // Collect ALL grouped threads across all time buckets, keyed by sender/domain
  const allSenderGroups: Record<string, Thread[]> = {};
  const allDomainGroups: Record<string, Thread[]> = {};
  const allTimeBuckets = [todayGroup, yesterdayGroup, thisWeek, lastWeek, thisMonth, lastMonth, ...Object.values(byYear)];
  for (const bucket of allTimeBuckets) {
    for (const t of bucket) {
      if (groupedSet.has(t.senderEmail)) {
        (allSenderGroups[t.senderEmail] ??= []).push(t);
      } else {
        const domain = t.senderEmail.split('@')[1] ?? '';
        if (domain && domainSet.has(domain)) {
          (allDomainGroups[domain] ??= []).push(t);
        }
      }
    }
  }

  // Determine which section each group belongs to (based on latest thread)
  type SectionLabel = string;
  const sectionOrder = ['Today', 'Yesterday', 'This week', 'Last week', MONTH_NAMES[now.getMonth()], MONTH_NAMES[(now.getMonth() - 1 + 12) % 12]];
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  for (const y of years) sectionOrder.push(String(y));

  function getSectionForDate(d: Date): SectionLabel {
    if (d >= today) return 'Today';
    if (d >= yesterday) return 'Yesterday';
    if (d >= weekStart) return 'This week';
    if (d >= lastWeekStart) return 'Last week';
    if (d >= monthStart) return MONTH_NAMES[now.getMonth()];
    if (d >= lastMonthStart) return MONTH_NAMES[(now.getMonth() - 1 + 12) % 12];
    return String(d.getFullYear());
  }

  // Place each group in the section of its latest (first) thread
  const sectionSenderGroups: Record<SectionLabel, Record<string, Thread[]>> = {};
  const sectionDomainGroups: Record<SectionLabel, Record<string, Thread[]>> = {};
  for (const [email, groupThreads] of Object.entries(allSenderGroups)) {
    const latest = groupThreads[0];
    const section = getSectionForDate(new Date(latest.receivedAt));
    (sectionSenderGroups[section] ??= {})[email] = groupThreads;
  }
  for (const [domain, groupThreads] of Object.entries(allDomainGroups)) {
    const latest = groupThreads[0];
    const section = getSectionForDate(new Date(latest.receivedAt));
    (sectionDomainGroups[section] ??= {})[domain] = groupThreads;
  }

  const sections: Array<{ label: string; threads: Thread[]; categoryThreads?: { newsletters: Thread[]; updates: Thread[] }; senderGroups?: Record<string, Thread[]>; domainGroups?: Record<string, Thread[]> }> = [];

  // KPT-081: Priority section at the very top
  if (priorityThreads.length > 0) {
    sections.push({ label: 'Priority', threads: priorityThreads });
  }

  sections.push(
    { label: 'Today', threads: removeGrouped(todayGroup), categoryThreads: { newsletters: allNewsletters, updates: allUpdates }, senderGroups: sectionSenderGroups['Today'], domainGroups: sectionDomainGroups['Today'] },
    { label: 'Yesterday', threads: removeGrouped(yesterdayGroup), senderGroups: sectionSenderGroups['Yesterday'], domainGroups: sectionDomainGroups['Yesterday'] },
    { label: 'This week', threads: removeGrouped(thisWeek), senderGroups: sectionSenderGroups['This week'], domainGroups: sectionDomainGroups['This week'] },
    { label: 'Last week', threads: removeGrouped(lastWeek), senderGroups: sectionSenderGroups['Last week'], domainGroups: sectionDomainGroups['Last week'] },
    { label: MONTH_NAMES[now.getMonth()], threads: removeGrouped(thisMonth), senderGroups: sectionSenderGroups[MONTH_NAMES[now.getMonth()]], domainGroups: sectionDomainGroups[MONTH_NAMES[now.getMonth()]] },
    { label: MONTH_NAMES[(now.getMonth() - 1 + 12) % 12], threads: removeGrouped(lastMonth), senderGroups: sectionSenderGroups[MONTH_NAMES[(now.getMonth() - 1 + 12) % 12]], domainGroups: sectionDomainGroups[MONTH_NAMES[(now.getMonth() - 1 + 12) % 12]] },
  );

  // Add year groups sorted descending
  for (const y of years) {
    sections.push({ label: String(y), threads: removeGrouped(byYear[y]), senderGroups: sectionSenderGroups[String(y)], domainGroups: sectionDomainGroups[String(y)] });
  }

  const result = sections.filter(s => s.threads.length > 0 || (s.categoryThreads && (s.categoryThreads.newsletters.length > 0 || s.categoryThreads.updates.length > 0)) || (s.senderGroups && Object.keys(s.senderGroups).length > 0) || (s.domainGroups && Object.keys(s.domainGroups).length > 0));
  _cachedSectionsKey = key;
  _cachedSections = result;
  return result;
}

function startOf(unit: 'day' | 'week' | 'month', d: Date): Date {
  if (unit === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (unit === 'week') {
    const day = d.getDay(); // 0=Sun
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
