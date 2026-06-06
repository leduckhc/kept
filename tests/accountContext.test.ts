/**
 * accountContext.test.ts — KPT-027J
 *
 * Tests for the updated accountContext module (localStorage-based active account).
 * Verifies: getActiveAccountId, setActiveAccountId, clearActiveAccountId,
 * and resolveActiveAccount fallback behavior.
 *
 * resolveActiveAccount calls getAccountById / getAllAccounts from auth.ts (DB-backed)
 * so those are mocked here.
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

// Polyfill localStorage for Node/vitest environment
// (Tauri webview has it natively; tests run in Node which doesn't.)
beforeAll(() => {
  if (typeof localStorage === 'undefined') {
    const store: Record<string, string> = {};
    const localStorageMock = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const k in store) delete store[k]; },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  }
});
import {
  getActiveAccountId,
  setActiveAccountId,
  clearActiveAccountId,
  resolveActiveAccount,
} from '../src/accountContext';
import type { Account } from '../src/auth';

// ── Mock the auth module ──────────────────────────────────────────────────────
// resolveActiveAccount uses getAccountById and getAllAccounts from auth.ts.
// We mock them to avoid needing a real DB in unit tests.
vi.mock('../src/auth', () => ({
  getAllAccounts: vi.fn(),
  getAccountById: vi.fn(),
}));

import { getAllAccounts, getAccountById } from '../src/auth';
const mockedGetAll = vi.mocked(getAllAccounts);
const mockedGetById = vi.mocked(getAccountById);

function makeAccount(id: string, email: string): Account {
  return {
    id,
    email,
    accessToken: 'tok',
    refreshToken: 'rtok',
    tokenExpiry: Date.now() + 3_600_000,
    signature: '',
    colorIndex: 0,
    provider: 'gmail',
  };
}

describe('accountContext — localStorage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('getActiveAccountId returns null when nothing is stored', () => {
    expect(getActiveAccountId()).toBeNull();
  });

  it('setActiveAccountId persists to localStorage', () => {
    setActiveAccountId('user-1');
    expect(getActiveAccountId()).toBe('user-1');
  });

  it('setActiveAccountId overwrites a previously stored id', () => {
    setActiveAccountId('user-1');
    setActiveAccountId('user-2');
    expect(getActiveAccountId()).toBe('user-2');
  });

  it('clearActiveAccountId removes the stored id', () => {
    setActiveAccountId('user-3');
    clearActiveAccountId();
    expect(getActiveAccountId()).toBeNull();
  });
});

describe('accountContext — resolveActiveAccount', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns null when no accounts exist and none stored', async () => {
    mockedGetAll.mockResolvedValueOnce([]);
    const result = await resolveActiveAccount();
    expect(result).toBeNull();
  });

  it('returns the stored active account when it exists in DB', async () => {
    const acct = makeAccount('u-abc', 'alice@example.com');
    setActiveAccountId('u-abc');
    mockedGetById.mockResolvedValueOnce(acct);
    const result = await resolveActiveAccount();
    expect(result).toEqual(acct);
    expect(mockedGetById).toHaveBeenCalledWith('u-abc');
  });

  it('falls back to first account and updates localStorage when stored id is stale', async () => {
    const acct = makeAccount('u-fallback', 'bob@example.com');
    setActiveAccountId('stale-id');
    // getAccountById returns null for the stale id
    mockedGetById.mockResolvedValueOnce(null);
    // getAllAccounts returns the fallback account
    mockedGetAll.mockResolvedValueOnce([acct]);
    const result = await resolveActiveAccount();
    expect(result).toEqual(acct);
    // localStorage should now be updated to the fallback account
    expect(getActiveAccountId()).toBe('u-fallback');
  });

  it('falls back to first account when no active id is stored', async () => {
    const acct = makeAccount('u-first', 'charlie@example.com');
    mockedGetAll.mockResolvedValueOnce([acct]);
    const result = await resolveActiveAccount();
    expect(result).toEqual(acct);
    expect(getActiveAccountId()).toBe('u-first');
  });

  it('returns null when stored id is stale and no accounts exist in DB', async () => {
    setActiveAccountId('ghost-id');
    mockedGetById.mockResolvedValueOnce(null);
    mockedGetAll.mockResolvedValueOnce([]);
    const result = await resolveActiveAccount();
    expect(result).toBeNull();
    // Stale id should be cleared
    expect(getActiveAccountId()).toBeNull();
  });
});
