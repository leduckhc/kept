// prioritySenders.ts — KPT-086: Priority Senders
// Mark senders as priority → their emails surface at top of inbox, highlighted.
// Pure logic + DB persistence. No DOM dependencies in this module.

import { getDb } from './db';
import type { Thread } from './store';

export interface PrioritySender {
  email: string;
  name: string;
  addedAt: number; // unix ms
}

// ── In-memory cache (loaded per account on sync/boot) ─────

let _cache: Map<string, Set<string>> = new Map(); // accountId → Set<email>

export function resetPrioritySendersCache(): void {
  _cache = new Map();
}

export function getCachedPriorityEmails(accountId: string): Set<string> {
  return _cache.get(accountId) || new Set();
}

// ── DB operations ─────────────────────────────────────────

export async function loadPrioritySendersToCache(accountId: string): Promise<void> {
  const senders = await getPrioritySenders(accountId);
  _cache.set(accountId, new Set(senders.map(s => s.email.toLowerCase())));
}

export async function getPrioritySenders(accountId: string): Promise<PrioritySender[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ email: string; name: string; added_at: number }>>(
    'SELECT email, name, added_at FROM priority_senders WHERE account_id = ?',
    [accountId]
  );
  return rows.map(r => ({ email: r.email, name: r.name, addedAt: r.added_at }));
}

export async function addPrioritySender(accountId: string, email: string, name: string): Promise<void> {
  const db = await getDb();
  const normalizedEmail = email.toLowerCase();
  await db.execute(
    'INSERT OR REPLACE INTO priority_senders (account_id, email, name, added_at) VALUES (?, ?, ?, ?)',
    [accountId, normalizedEmail, name, Date.now()]
  );
  // Update cache
  if (!_cache.has(accountId)) _cache.set(accountId, new Set());
  _cache.get(accountId)!.add(normalizedEmail);
}

export async function removePrioritySender(accountId: string, email: string): Promise<void> {
  const db = await getDb();
  const normalizedEmail = email.toLowerCase();
  await db.execute(
    'DELETE FROM priority_senders WHERE account_id = ? AND email = ?',
    [accountId, normalizedEmail]
  );
  // Update cache
  _cache.get(accountId)?.delete(normalizedEmail);
}

export async function isPrioritySender(accountId: string, email: string): Promise<boolean> {
  // Check cache first
  const cached = _cache.get(accountId);
  if (cached) return cached.has(email.toLowerCase());
  // Fallback: load from DB
  const senders = await getPrioritySenders(accountId);
  return senders.some(s => s.email.toLowerCase() === email.toLowerCase());
}

// ── Sort logic ────────────────────────────────────────────

/**
 * Sort threads so priority senders appear first, maintaining receivedAt order
 * within each group (priority vs normal).
 */
export function sortWithPriority(threads: Thread[], priorityEmails: Set<string>): Thread[] {
  if (priorityEmails.size === 0) return threads;

  const priority: Thread[] = [];
  const normal: Thread[] = [];

  for (const t of threads) {
    if (priorityEmails.has(t.senderEmail.toLowerCase())) {
      priority.push(t);
    } else {
      normal.push(t);
    }
  }

  // Both groups maintain their existing order (already sorted by receivedAt desc from DB)
  priority.sort((a, b) => b.receivedAt - a.receivedAt);
  normal.sort((a, b) => b.receivedAt - a.receivedAt);

  return [...priority, ...normal];
}
