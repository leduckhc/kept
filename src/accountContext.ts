// accountContext.ts — Multi-account state management
import { type Account } from './auth';

export type AccountError = 'token-expired' | 'sync-failing' | null;

export interface AccountEntry {
  account: Account;
  error: AccountError;
}

// ── Internal state ─────────────────────────────────────────────────────────
let accounts: AccountEntry[] = [];
let activeId: string | null = null;
const listeners: Array<() => void> = [];

// ── Subscribe ──────────────────────────────────────────────────────────────
export function onAccountChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function notify() {
  listeners.forEach(fn => fn());
}

// ── Query ──────────────────────────────────────────────────────────────────
export function getAccounts(): AccountEntry[] {
  return accounts;
}

export function getActive(): Account | null {
  if (!activeId) return null;
  return accounts.find(e => e.account.id === activeId)?.account ?? null;
}

export function getActiveEntry(): AccountEntry | null {
  if (!activeId) return null;
  return accounts.find(e => e.account.id === activeId) ?? null;
}

// ── Mutations ──────────────────────────────────────────────────────────────
export function setActive(accountId: string): void {
  const entry = accounts.find(e => e.account.id === accountId);
  if (!entry) throw new Error(`Unknown account: ${accountId}`);
  activeId = accountId;
  notify();
}

export function addAccount(account: Account): void {
  const existing = accounts.findIndex(e => e.account.id === account.id);
  if (existing !== -1) {
    accounts[existing] = { account, error: null };
  } else {
    accounts.push({ account, error: null });
  }
  if (!activeId) activeId = account.id;
  notify();
}

export function removeAccount(accountId: string): void {
  accounts = accounts.filter(e => e.account.id !== accountId);
  if (activeId === accountId) {
    activeId = accounts[0]?.account.id ?? null;
  }
  notify();
}

export function setAccountError(accountId: string, error: AccountError): void {
  const entry = accounts.find(e => e.account.id === accountId);
  if (entry) {
    entry.error = error;
    notify();
  }
}

/** Initialise from DB on boot */
export async function loadAccountsFromDb(): Promise<void> {
  const { getAllAccounts } = await import('./auth');
  const rows = await getAllAccounts();
  accounts = rows.map(a => ({ account: a, error: null }));
  // Default: first account is active (or restore from localStorage)
  const savedActive = localStorage.getItem('activeAccountId');
  if (savedActive && accounts.some(e => e.account.id === savedActive)) {
    activeId = savedActive;
  } else if (accounts.length > 0) {
    activeId = accounts[0].account.id;
  }
  notify();
}

/** Persist active account choice across sessions */
export function persistActiveChoice(): void {
  if (activeId) localStorage.setItem('activeAccountId', activeId);
  else localStorage.removeItem('activeAccountId');
}
