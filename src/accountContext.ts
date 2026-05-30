// accountContext.ts — Active account state + multi-account context
// Provides: activeAccountId persistence (localStorage), setActive/getActive helpers.
// Other modules import from here rather than directly from auth.ts for account-specific context.

import { type Account, getAllAccounts, getAccountById } from './auth';

const STORAGE_KEY = 'activeAccountId';

// ── Active account ID ─────────────────────────────────────

export function getActiveAccountId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setActiveAccountId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

export function clearActiveAccountId(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Resolve active account ────────────────────────────────
// Returns the active account. Falls back to the first account in DB if
// activeAccountId is not set or refers to a removed account.

export async function resolveActiveAccount(): Promise<Account | null> {
  const id = getActiveAccountId();
  if (id) {
    const acct = await getAccountById(id);
    if (acct) return acct;
    // Stale id — fall through and pick first available
    clearActiveAccountId();
  }
  const all = await getAllAccounts();
  if (all.length === 0) return null;
  setActiveAccountId(all[0].id);
  return all[0];
}
