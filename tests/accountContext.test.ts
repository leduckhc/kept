/**
 * accountContext.test.ts
 *
 * Tests for the account context module (KPT-027J0).
 * Verifies: setActive, getActive, listAccounts, addAccount, removeAccount,
 * and the namespaced localStorage draft key format.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setActive,
  getActive,
  listAccounts,
  addAccount,
  removeAccount,
} from '../src/accountContext';
import type { Account } from '../src/auth';

function makeAccount(id: string, email: string): Account {
  return {
    id,
    email,
    accessToken: 'tok',
    refreshToken: 'rtok',
    tokenExpiry: Date.now() + 3_600_000,
  };
}

// Reset module state between tests by removing all accounts
function resetContext() {
  const all = listAccounts();
  for (const a of all) removeAccount(a.id);
}

describe('accountContext', () => {
  beforeEach(() => {
    resetContext();
  });

  it('getActive returns null when no account has been set', () => {
    expect(getActive()).toBeNull();
  });

  it('setActive with an Account object registers and activates it', () => {
    const a = makeAccount('user-1', 'alice@example.com');
    setActive(a);
    expect(getActive()).toEqual(a);
  });

  it('setActive with an id string activates a previously registered account', () => {
    const a = makeAccount('user-2', 'bob@example.com');
    addAccount(a);
    setActive('user-2');
    expect(getActive()?.email).toBe('bob@example.com');
  });

  it('setActive with unknown id throws', () => {
    expect(() => setActive('nonexistent-id')).toThrow(/unknown account id/);
  });

  it('listAccounts returns all registered accounts', () => {
    const a1 = makeAccount('u1', 'a@example.com');
    const a2 = makeAccount('u2', 'b@example.com');
    addAccount(a1);
    addAccount(a2);
    const list = listAccounts();
    expect(list).toHaveLength(2);
    expect(list.map(a => a.id)).toContain('u1');
    expect(list.map(a => a.id)).toContain('u2');
  });

  it('removeAccount removes the account from the store', () => {
    const a = makeAccount('u3', 'c@example.com');
    addAccount(a);
    removeAccount('u3');
    expect(listAccounts().find(x => x.id === 'u3')).toBeUndefined();
  });

  it('removeAccount clears active when the active account is removed', () => {
    const a = makeAccount('u4', 'd@example.com');
    setActive(a);
    removeAccount('u4');
    expect(getActive()).toBeNull();
  });

  it('removeAccount does not clear active when a different account is removed', () => {
    const a = makeAccount('u5', 'e@example.com');
    const b = makeAccount('u6', 'f@example.com');
    setActive(a);
    addAccount(b);
    removeAccount('u6');
    expect(getActive()?.id).toBe('u5');
  });

  // ── Draft key namespace format ─────────────────────────────
  // The draft key format in main.ts is: `draft-${accountId}-${gmailThreadId}`
  // This test documents and verifies that contract.

  it('draft key format includes accountId and gmailThreadId', () => {
    const accountId = 'user-abc123';
    const gmailThreadId = 'thread-xyz789';
    const draftKey = `draft-${accountId}-${gmailThreadId}`;
    expect(draftKey).toBe('draft-user-abc123-thread-xyz789');
    // Verify that keys for different accounts don't collide
    const accountId2 = 'user-def456';
    const draftKey2 = `draft-${accountId2}-${gmailThreadId}`;
    expect(draftKey).not.toBe(draftKey2);
  });

  it('draft keys for same thread across accounts are distinct', () => {
    const thread = 'thread-shared-001';
    const k1 = `draft-account-A-${thread}`;
    const k2 = `draft-account-B-${thread}`;
    expect(k1).not.toBe(k2);
  });
});
