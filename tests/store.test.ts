// store.test.ts — Tests for provider-agnostic SQLite store functions
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Thread } from '../src/store';

// Mock the db module
const mockSelect = vi.fn().mockResolvedValue([]);
const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 1 });

vi.mock('../src/db', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: (...args: unknown[]) => mockSelect(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  }),
}));

// Import after mock
import {
  loadThreads,
  loadThreadsUnified,
  groupBySection,
  invalidateSectionCache,
  snoozeThread,
  unsnoozeThread,
  getGroupedSenders,
  addGroupedSender,
  removeGroupedSender,
  getVipSenders,
  addVipSender,
  removeVipSender,
  getSetting,
  setSetting,
  hasSyncedBefore,
  setAsideThread,
  unsetAsideThread,
  loadSetAsideThreads,
  loadSnoozedThreads,
  loadStarredThreads,
} from '../src/store';

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'th_1',
    subject: 'Test Subject',
    snippet: 'Preview text',
    senderName: 'Test Sender',
    senderEmail: 'test@example.com',
    receivedAt: Date.now(),
    isUnread: false,
    isArchived: false,
    isStarred: false,
    hasAttachment: false,
    gmailThreadId: 'gm_1',
    snoozedUntil: null,
    snoozeLabel: null,
    messageCount: 1,
    label: 'INBOX',
    accountId: 'acc_1',
    isMuted: false,
    isSetAside: false,
    category: 'personal',
    userLabels: '',
    ...overrides,
  };
}

// DB row format
function makeDbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'th_1',
    subject: 'Test Subject',
    snippet: 'Preview text',
    sender_name: 'Test Sender',
    sender_email: 'test@example.com',
    received_at: Date.now(),
    is_unread: 0,
    is_archived: 0,
    is_starred: 0,
    has_attachment: 0,
    gmail_thread_id: 'gm_1',
    snoozed_until: null,
    snooze_label: null,
    message_count: 1,
    label: 'INBOX',
    account_id: 'acc_1',
    is_muted: 0,
    is_set_aside: 0,
    is_blocked: 0,
    category: 'personal',
    user_labels: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSectionCache();
});

describe('loadThreads', () => {
  it('returns threads from DB for an account', async () => {
    const row = makeDbRow({ id: 'th_abc', subject: 'Hello' });
    mockSelect.mockResolvedValueOnce([row]);

    const result = await loadThreads('acc_1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('th_abc');
    expect(result[0].subject).toBe('Hello');
    expect(mockSelect).toHaveBeenCalledTimes(1);
    // Should query for INBOX by default
    expect(mockSelect.mock.calls[0][0]).toContain('label = ?');
  });

  it('respects label parameter', async () => {
    mockSelect.mockResolvedValueOnce([]);
    await loadThreads('acc_1', 'SENT');
    expect(mockSelect.mock.calls[0][1]).toContain('SENT');
  });
});

describe('loadThreadsUnified', () => {
  it('returns threads from all accounts when no filter', async () => {
    const rows = [
      makeDbRow({ id: 'th_1', account_id: 'acc_1' }),
      makeDbRow({ id: 'th_2', account_id: 'acc_2' }),
    ];
    mockSelect.mockResolvedValueOnce(rows);

    const result = await loadThreadsUnified();
    expect(result).toHaveLength(2);
    // Should NOT have account_id filter
    expect(mockSelect.mock.calls[0][0]).not.toContain('account_id = ?');
  });

  it('filters by account when accountFilter provided', async () => {
    mockSelect.mockResolvedValueOnce([makeDbRow()]);

    await loadThreadsUnified('acc_1');
    expect(mockSelect.mock.calls[0][0]).toContain('account_id = ?');
    expect(mockSelect.mock.calls[0][1]).toContain('acc_1');
  });
});

describe('groupBySection', () => {
  it('groups threads into time-based sections', () => {
    const now = Date.now();
    const threads = [
      makeThread({ id: 'th_today', receivedAt: now, senderEmail: 'a@a.com' }),
      makeThread({ id: 'th_today2', receivedAt: now - 1000, senderEmail: 'b@b.com' }),
    ];

    const sections = groupBySection(threads);
    expect(sections.length).toBeGreaterThan(0);
    // Today section should have the threads
    const todaySection = sections.find(s => s.label === 'Today');
    expect(todaySection).toBeDefined();
    expect(todaySection!.threads.length).toBeGreaterThan(0);
  });

  it('puts VIP senders into Priority section', () => {
    const now = Date.now();
    const threads = [
      makeThread({ id: 'th_vip', receivedAt: now, senderEmail: 'vip@boss.com' }),
      makeThread({ id: 'th_normal', receivedAt: now - 1000, senderEmail: 'normal@person.com' }),
    ];

    const sections = groupBySection(threads, [], [], ['vip@boss.com']);
    const priority = sections.find(s => s.label === 'Priority');
    expect(priority).toBeDefined();
    expect(priority!.threads).toHaveLength(1);
    expect(priority!.threads[0].id).toBe('th_vip');
  });

  it('separates grouped senders from time buckets', () => {
    const now = Date.now();
    const threads = [
      makeThread({ id: 'th_grouped', receivedAt: now, senderEmail: 'news@grouped.com' }),
      makeThread({ id: 'th_normal', receivedAt: now - 1000, senderEmail: 'normal@person.com' }),
    ];

    const sections = groupBySection(threads, ['news@grouped.com']);
    const todaySection = sections.find(s => s.label === 'Today');
    // Normal thread should be in Today
    expect(todaySection!.threads.find(t => t.id === 'th_normal')).toBeDefined();
    // Grouped thread should NOT be in Today's threads list
    expect(todaySection!.threads.find(t => t.id === 'th_grouped')).toBeUndefined();
    // But should be in senderGroups
    expect(todaySection!.senderGroups?.['news@grouped.com']).toBeDefined();
  });

  it('separates newsletters into categoryThreads', () => {
    const now = Date.now();
    const threads = [
      makeThread({ id: 'th_nl', receivedAt: now, senderEmail: 'nl@news.com', category: 'newsletters' }),
      makeThread({ id: 'th_normal', receivedAt: now - 1000, senderEmail: 'normal@person.com' }),
    ];

    const sections = groupBySection(threads);
    const todaySection = sections.find(s => s.label === 'Today');
    expect(todaySection!.categoryThreads!.newsletters).toHaveLength(1);
    expect(todaySection!.categoryThreads!.newsletters[0].id).toBe('th_nl');
  });
});

describe('snoozeThread / unsnoozeThread', () => {
  it('snoozeThread updates snoozed_until in DB', async () => {
    const thread = makeThread({ id: 'th_snz' });
    const untilMs = Date.now() + 3600000;

    await snoozeThread(thread, untilMs);

    expect(mockExecute).toHaveBeenCalledWith(
      'UPDATE threads SET snoozed_until = ?, snooze_label = ? WHERE id = ?',
      [untilMs, 'Snoozed', 'th_snz']
    );
  });

  it('unsnoozeThread clears snoozed_until in DB', async () => {
    const thread = makeThread({ id: 'th_snz' });

    await unsnoozeThread(thread);

    expect(mockExecute).toHaveBeenCalledWith(
      'UPDATE threads SET snoozed_until = NULL, snooze_label = NULL WHERE id = ?',
      ['th_snz']
    );
  });
});

describe('setAsideThread / unsetAsideThread', () => {
  it('setAsideThread sets is_set_aside = 1', async () => {
    const thread = makeThread({ id: 'th_aside' });
    await setAsideThread(thread);
    expect(mockExecute).toHaveBeenCalledWith(
      'UPDATE threads SET is_set_aside = 1 WHERE id = ?',
      ['th_aside']
    );
  });

  it('unsetAsideThread sets is_set_aside = 0', async () => {
    const thread = makeThread({ id: 'th_aside' });
    await unsetAsideThread(thread);
    expect(mockExecute).toHaveBeenCalledWith(
      'UPDATE threads SET is_set_aside = 0 WHERE id = ?',
      ['th_aside']
    );
  });
});

describe('getGroupedSenders / addGroupedSender / removeGroupedSender', () => {
  it('getGroupedSenders returns emails from DB', async () => {
    mockSelect.mockResolvedValueOnce([{ email: 'a@b.com' }, { email: 'c@d.com' }]);
    const result = await getGroupedSenders('acc_1');
    expect(result).toEqual(['a@b.com', 'c@d.com']);
    expect(mockSelect.mock.calls[0][1]).toEqual(['acc_1']);
  });

  it('addGroupedSender inserts into DB', async () => {
    await addGroupedSender('acc_1', 'new@sender.com');
    expect(mockExecute).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO grouped_senders (email, account_id) VALUES (?, ?)',
      ['new@sender.com', 'acc_1']
    );
  });

  it('removeGroupedSender deletes from DB', async () => {
    await removeGroupedSender('acc_1', 'old@sender.com');
    expect(mockExecute).toHaveBeenCalledWith(
      'DELETE FROM grouped_senders WHERE email = ? AND account_id = ?',
      ['old@sender.com', 'acc_1']
    );
  });
});

describe('getVipSenders / addVipSender / removeVipSender', () => {
  it('getVipSenders returns emails from DB', async () => {
    mockSelect.mockResolvedValueOnce([{ email: 'vip@boss.com' }]);
    const result = await getVipSenders('acc_1');
    expect(result).toEqual(['vip@boss.com']);
  });

  it('addVipSender inserts into DB', async () => {
    await addVipSender('acc_1', 'vip@boss.com');
    expect(mockExecute).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO vip_senders (email, account_id) VALUES (?, ?)',
      ['vip@boss.com', 'acc_1']
    );
  });

  it('removeVipSender deletes from DB', async () => {
    await removeVipSender('acc_1', 'vip@boss.com');
    expect(mockExecute).toHaveBeenCalledWith(
      'DELETE FROM vip_senders WHERE email = ? AND account_id = ?',
      ['vip@boss.com', 'acc_1']
    );
  });
});

describe('hasSyncedBefore', () => {
  it('returns true when historyId is set', async () => {
    mockSelect.mockResolvedValueOnce([{ value: '12345' }]);
    const result = await hasSyncedBefore('acc_1');
    expect(result).toBe(true);
  });

  it('returns false when historyId is not set', async () => {
    mockSelect.mockResolvedValueOnce([]);
    const result = await hasSyncedBefore('acc_1');
    expect(result).toBe(false);
  });
});

describe('getSetting / setSetting', () => {
  it('getSetting returns value from DB', async () => {
    mockSelect.mockResolvedValueOnce([{ value: 'myval' }]);
    const result = await getSetting('acc_1', 'mykey');
    expect(result).toBe('myval');
  });

  it('getSetting returns null when not found', async () => {
    mockSelect.mockResolvedValueOnce([]);
    const result = await getSetting('acc_1', 'missing');
    expect(result).toBeNull();
  });

  it('setSetting writes to DB', async () => {
    await setSetting('acc_1', 'mykey', 'myval');
    expect(mockExecute).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, account_id, value) VALUES (?, ?, ?)',
      ['mykey', 'acc_1', 'myval']
    );
  });
});
