/**
 * Tests for Priority Senders — KPT-086
 * Mark senders as priority → their emails surface at top of inbox, highlighted.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isPrioritySender,
  addPrioritySender,
  removePrioritySender,
  getPrioritySenders,
  sortWithPriority,
  type PrioritySender,
} from '../src/prioritySenders';
import type { Thread } from '../src/store';

// ── Mock DB ───────────────────────────────────────────────

vi.mock('../src/db', () => {
  let store: Record<string, PrioritySender[]> = {};
  return {
    getDb: () => ({
      select: async (sql: string, params: any[]) => {
        const accountId = params[1] || params[0];
        const rows = store[accountId] || [];
        return rows.map(r => ({ email: r.email, name: r.name, added_at: r.addedAt }));
      },
      execute: async (sql: string, params: any[]) => {
        if (sql.includes('INSERT')) {
          const accountId = params[0];
          if (!store[accountId]) store[accountId] = [];
          store[accountId].push({ email: params[1], name: params[2], addedAt: params[3] });
        } else if (sql.includes('DELETE')) {
          const accountId = params[0];
          const email = params[1];
          store[accountId] = (store[accountId] || []).filter(r => r.email !== email);
        } else if (sql.includes('ALTER') || sql.includes('CREATE')) {
          // migration — noop
        }
      },
    }),
    __resetStore: () => { store = {}; },
  };
});

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    accountId: 'acc-1',
    gmailThreadId: 'gt-1',
    subject: 'Test Subject',
    snippet: 'Preview text...',
    senderName: 'Alice',
    senderEmail: 'alice@example.com',
    receivedAt: Date.now(),
    isUnread: true,
    isArchived: false,
    isStarred: false,
    hasAttachment: false,
    label: 'INBOX',
    messageCount: 1,
    snoozedUntil: null,
    snoozeLabel: null,
    isMuted: false,
    isSetAside: false,
    category: 'personal',
    userLabels: '',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────

describe('Priority Senders — pure logic', () => {
  beforeEach(async () => {
    const { __resetStore } = await import('../src/db') as any;
    __resetStore();
  });

  it('add and check priority sender', async () => {
    await addPrioritySender('acc-1', 'alice@example.com', 'Alice');
    const result = await isPrioritySender('acc-1', 'alice@example.com');
    expect(result).toBe(true);
  });

  it('non-priority sender returns false', async () => {
    const result = await isPrioritySender('acc-1', 'bob@example.com');
    expect(result).toBe(false);
  });

  it('remove priority sender', async () => {
    await addPrioritySender('acc-1', 'alice@example.com', 'Alice');
    await removePrioritySender('acc-1', 'alice@example.com');
    const result = await isPrioritySender('acc-1', 'alice@example.com');
    expect(result).toBe(false);
  });

  it('list all priority senders for account', async () => {
    await addPrioritySender('acc-1', 'alice@example.com', 'Alice');
    await addPrioritySender('acc-1', 'bob@example.com', 'Bob');
    const senders = await getPrioritySenders('acc-1');
    expect(senders).toHaveLength(2);
    expect(senders.map(s => s.email)).toContain('alice@example.com');
    expect(senders.map(s => s.email)).toContain('bob@example.com');
  });

  it('priority senders are per-account (isolation)', async () => {
    await addPrioritySender('acc-1', 'alice@example.com', 'Alice');
    const acc2 = await getPrioritySenders('acc-2');
    expect(acc2).toHaveLength(0);
  });
});

describe('sortWithPriority — priority threads surface first', () => {
  it('moves priority sender threads to the top', () => {
    const priorityEmails = new Set(['vip@company.com']);
    const threads: Thread[] = [
      makeThread({ id: 't-1', senderEmail: 'normal@example.com', receivedAt: 1000 }),
      makeThread({ id: 't-2', senderEmail: 'vip@company.com', receivedAt: 500 }),
      makeThread({ id: 't-3', senderEmail: 'other@example.com', receivedAt: 2000 }),
    ];

    const sorted = sortWithPriority(threads, priorityEmails);
    expect(sorted[0].id).toBe('t-2'); // VIP first despite oldest
    expect(sorted[1].id).toBe('t-3'); // then by receivedAt desc
    expect(sorted[2].id).toBe('t-1');
  });

  it('maintains receivedAt order within priority group', () => {
    const priorityEmails = new Set(['a@vip.com', 'b@vip.com']);
    const threads: Thread[] = [
      makeThread({ id: 't-1', senderEmail: 'a@vip.com', receivedAt: 1000 }),
      makeThread({ id: 't-2', senderEmail: 'b@vip.com', receivedAt: 2000 }),
      makeThread({ id: 't-3', senderEmail: 'normal@ex.com', receivedAt: 3000 }),
    ];

    const sorted = sortWithPriority(threads, priorityEmails);
    expect(sorted[0].id).toBe('t-2'); // newest VIP first
    expect(sorted[1].id).toBe('t-1'); // older VIP second
    expect(sorted[2].id).toBe('t-3'); // non-VIP last
  });

  it('returns same order when no priority senders', () => {
    const threads: Thread[] = [
      makeThread({ id: 't-1', receivedAt: 3000 }),
      makeThread({ id: 't-2', receivedAt: 2000 }),
      makeThread({ id: 't-3', receivedAt: 1000 }),
    ];

    const sorted = sortWithPriority(threads, new Set());
    expect(sorted.map(t => t.id)).toEqual(['t-1', 't-2', 't-3']);
  });

  it('case-insensitive email matching', () => {
    const priorityEmails = new Set(['vip@company.com']);
    const threads: Thread[] = [
      makeThread({ id: 't-1', senderEmail: 'VIP@Company.COM', receivedAt: 1000 }),
      makeThread({ id: 't-2', senderEmail: 'normal@ex.com', receivedAt: 2000 }),
    ];

    const sorted = sortWithPriority(threads, priorityEmails);
    expect(sorted[0].id).toBe('t-1'); // VIP matched case-insensitively
  });
});
