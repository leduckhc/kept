// accountContext.ts — module-level account singleton, extracted from main.ts
// This module owns the active account state so future multi-account support
// only needs to update this file.

import type { Account } from './auth';

let _active: Account | null = null;
const _accounts: Map<string, Account> = new Map();

/** Set the active account by id (must already be in the store) or pass an Account to set + register it. */
export function setActive(idOrAccount: string | Account): void {
  if (typeof idOrAccount === 'string') {
    const acct = _accounts.get(idOrAccount);
    if (!acct) throw new Error(`accountContext: unknown account id "${idOrAccount}"`);
    _active = acct;
  } else {
    _accounts.set(idOrAccount.id, idOrAccount);
    _active = idOrAccount;
  }
}

/** Returns the currently active account, or null if none. */
export function getActive(): Account | null {
  return _active;
}

/** Returns a snapshot of all registered accounts. */
export function listAccounts(): Account[] {
  return Array.from(_accounts.values());
}

/** Register an account in the store without necessarily making it active. */
export function addAccount(a: Account): void {
  _accounts.set(a.id, a);
}

/** Remove an account from the store. Clears active if it was the active account. */
export function removeAccount(id: string): void {
  _accounts.delete(id);
  if (_active?.id === id) _active = null;
}
