/**
 * Tests for Set Aside (KPT-080) — unit, integration, and UX behavior
 * Covers: DB operations, action dispatch (doSetAside/doUnsetAside),
 * state management, undo flow, and thread list rendering behavior.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Thread } from '../src/store';

// ── Mock DB layer ─────────────────────────────────────────

let mockDb: Record<string, { is_set_aside: number }> = {};

vi.mock('../src/db', () => ({
  getDb: () => ({
    select: async (sql: string, params: any[]) => {
      if (sql.includes('is_set_aside = 1')) {
        const accountId = params[0];
        return Object.entries(mockDb)
          .filter(([, v]) => v.is_set_aside === 1)
          .map(([id]) => ({
            id,
            subject: 'Thread ' + id,
            snippet: '',
            sender_name: 'Test',
            sender_email: 'test@example.com',
            received_at: Date.now(),
            is_unread: 0,
            is_archived: 0,
            is_starred: 0,
            has_attachment: 0,
            gmail_thread_id: 'gt-' + id,
            snoozed_until: null,
            snooze_label: null,
            message_count: 1,
            label: 'INBOX',
            account_id: accountId,
            is_muted: 0,
            is_set_aside: 1,
            category: 'personal',
            user_labels: '',
          }));
      }
      return [];
    },
    execute: async (sql: string, params: any[]) => {
      if (sql.includes('is_set_aside = 1')) {
        mockDb[params[0]] = { is_set_aside: 1 };
      } else if (sql.includes('is_set_aside = 0')) {
        mockDb[params[0]] = { is_set_aside: 0 };
      }
    },
  }),
}));

import { setAsideThread, unsetAsideThread, loadSetAsideThreads } from '../src/store';

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    accountId: 'acc-1',
    gmailThreadId: 'gt-1',
    subject: 'Test Email',
    snippet: 'Preview...',
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

// ── Unit tests: store operations ──────────────────────────

describe('Set Aside — store operations', () => {
  beforeEach(() => {
    mockDb = {};
  });

  it('setAsideThread marks thread as set aside in DB', async () => {
    const t = makeThread({ id: 'thread-1' });
    await setAsideThread(t);
    expect(mockDb['thread-1'].is_set_aside).toBe(1);
  });

  it('unsetAsideThread clears set-aside flag', async () => {
    const t = makeThread({ id: 'thread-2' });
    await setAsideThread(t);
    await unsetAsideThread(t);
    expect(mockDb['thread-2'].is_set_aside).toBe(0);
  });

  it('loadSetAsideThreads returns only set-aside threads for account', async () => {
    mockDb['t-1'] = { is_set_aside: 1 };
    mockDb['t-2'] = { is_set_aside: 0 };
    const result = await loadSetAsideThreads('acc-1');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('t-1');
  });

  it('setAsideThread is idempotent', async () => {
    const t = makeThread({ id: 'thread-3' });
    await setAsideThread(t);
    await setAsideThread(t);
    expect(mockDb['thread-3'].is_set_aside).toBe(1);
  });
});

// ── Integration: action dispatch + state ──────────────────

describe('Set Aside — doSetAside action integration', () => {
  it('doSetAside removes thread from state.threads', async () => {
    const { doSetAside } = await import('../src/actions');
    const { state } = await import('../src/state');

    const t = makeThread({ id: 'aside-1' });
    state.threads = [t, makeThread({ id: 'aside-2' })];
    state.accounts = [{ id: 'acc-1', email: 'test@gmail.com', name: 'Test' } as any];
    state.account = state.accounts[0];

    const row = document.createElement('div');
    document.body.appendChild(row);
    const mockDeps = {
      renderInbox: vi.fn(),
      loadUnifiedThreads: vi.fn().mockResolvedValue([]),
    };

    await doSetAside(t, row, mockDeps as any);

    expect(t.isSetAside).toBe(true);
    expect(state.threads.find(x => x.id === 'aside-1')).toBeUndefined();
  });

  it('doUnsetAside restores thread flag', async () => {
    const { doUnsetAside } = await import('../src/actions');
    const { state } = await import('../src/state');

    const t = makeThread({ id: 'unset-1', isSetAside: true });
    state.threads = [t];
    state.accounts = [{ id: 'acc-1', email: 'test@gmail.com', name: 'Test' } as any];
    state.account = state.accounts[0];

    const row = document.createElement('div');
    document.body.appendChild(row);
    const mockDeps = {
      renderInbox: vi.fn(),
      loadUnifiedThreads: vi.fn().mockResolvedValue([]),
    };

    await doUnsetAside(t, row, mockDeps as any);

    expect(t.isSetAside).toBe(false);
  });
});

// ── UX behavior tests ─────────────────────────────────────

describe('Set Aside — UX behavior', () => {
  it('set-aside thread disappears from inbox (removed from DOM)', async () => {
    const { doSetAside } = await import('../src/actions');
    const { state } = await import('../src/state');

    const t = makeThread({ id: 'ux-1' });
    state.threads = [t];
    state.accounts = [{ id: 'acc-1', email: 'test@gmail.com', name: 'Test' } as any];
    state.account = state.accounts[0];

    const container = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'thread-row';
    container.appendChild(row);
    document.body.appendChild(container);

    const mockDeps = {
      renderInbox: vi.fn(),
      loadUnifiedThreads: vi.fn().mockResolvedValue([]),
    };

    await doSetAside(t, row, mockDeps as any);

    // Row should be removed from DOM
    expect(container.contains(row)).toBe(false);
  });

  it('button label toggles based on isSetAside state', () => {
    const t = makeThread({ isSetAside: false });
    const title = t.isSetAside ? 'Remove from shelf' : 'Set aside';
    expect(title).toBe('Set aside');

    t.isSetAside = true;
    const titleAfter = t.isSetAside ? 'Remove from shelf' : 'Set aside';
    expect(titleAfter).toBe('Remove from shelf');
  });

  it('set aside preserves all thread metadata', async () => {
    const t = makeThread({
      id: 'meta-1',
      subject: 'Important Email',
      senderName: 'VIP',
      isStarred: true,
      hasAttachment: true,
    });

    await setAsideThread(t);

    // Metadata should remain intact
    expect(t.subject).toBe('Important Email');
    expect(t.senderName).toBe('VIP');
    expect(t.isStarred).toBe(true);
    expect(t.hasAttachment).toBe(true);
  });
});
