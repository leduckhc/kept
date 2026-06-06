/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadReminders,
  saveReminder,
  dismissReminder,
  dismissReminderForThread,
  getOverdueReminders,
  markReminderNotified,
  getActiveReminderThreadIds,
  getPendingReminders,
  getAllActiveReminders,
  autoCancelIfReplied,
  reminderPresets,
} from '../src/followupReminders';

const STORAGE_KEY = 'kept-followup-reminders';

function makeReminder(overrides: Partial<{
  threadId: string;
  subject: string;
  sentTo: string;
  remindAfter: string;
  messageCountAtSet: number;
}> = {}) {
  return {
    threadId: overrides.threadId ?? 'thread-1',
    subject: overrides.subject ?? 'Test subject',
    sentTo: overrides.sentTo ?? 'user@example.com',
    remindAfter: overrides.remindAfter ?? '2026-06-10T00:00:00.000Z',
    ...(overrides.messageCountAtSet !== undefined ? { messageCountAtSet: overrides.messageCountAtSet } : {}),
  };
}

describe('followupReminders', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loadReminders()', () => {
    it('returns empty array when localStorage is empty', () => {
      expect(loadReminders()).toEqual([]);
    });

    it('returns parsed reminders from valid JSON', () => {
      const data = [{ id: 'r1', threadId: 't1', subject: 's', sentTo: 'a', remindAfter: '2026-06-10T00:00:00.000Z', createdAt: '2026-06-06T00:00:00.000Z' }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      expect(loadReminders()).toEqual(data);
    });

    it('returns empty array when localStorage contains corrupted JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not valid json!!!');
      expect(loadReminders()).toEqual([]);
    });
  });

  describe('saveReminder()', () => {
    it('generates a unique ID starting with "reminder-"', () => {
      const result = saveReminder(makeReminder());
      expect(result.id).toMatch(/^reminder-\d+-[a-z0-9]+$/);
    });

    it('stores the reminder in localStorage', () => {
      saveReminder(makeReminder());
      const stored = loadReminders();
      expect(stored).toHaveLength(1);
      expect(stored[0].subject).toBe('Test subject');
    });

    it('sets createdAt to current time', () => {
      const result = saveReminder(makeReminder());
      expect(result.createdAt).toBe('2026-06-06T12:00:00.000Z');
    });

    it('deduplicates by threadId (replaces existing reminder for same thread)', () => {
      saveReminder(makeReminder({ threadId: 'thread-1', subject: 'First' }));
      saveReminder(makeReminder({ threadId: 'thread-1', subject: 'Second' }));
      const stored = loadReminders();
      expect(stored).toHaveLength(1);
      expect(stored[0].subject).toBe('Second');
    });

    it('allows multiple reminders when threadId is empty', () => {
      saveReminder(makeReminder({ threadId: '', subject: 'A' }));
      saveReminder(makeReminder({ threadId: '', subject: 'B' }));
      const stored = loadReminders();
      expect(stored).toHaveLength(2);
    });

    it('generates different IDs for successive calls', () => {
      const r1 = saveReminder(makeReminder({ threadId: '' }));
      vi.advanceTimersByTime(1);
      const r2 = saveReminder(makeReminder({ threadId: '' }));
      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('dismissReminder()', () => {
    it('removes a reminder by ID', () => {
      const r = saveReminder(makeReminder());
      expect(loadReminders()).toHaveLength(1);
      dismissReminder(r.id);
      expect(loadReminders()).toHaveLength(0);
    });

    it('is a no-op for a missing ID', () => {
      saveReminder(makeReminder());
      dismissReminder('nonexistent-id');
      expect(loadReminders()).toHaveLength(1);
    });
  });

  describe('dismissReminderForThread()', () => {
    it('removes reminder by threadId', () => {
      saveReminder(makeReminder({ threadId: 'thread-99' }));
      expect(loadReminders()).toHaveLength(1);
      dismissReminderForThread('thread-99');
      expect(loadReminders()).toHaveLength(0);
    });

    it('is a no-op when threadId is empty string', () => {
      saveReminder(makeReminder({ threadId: '' }));
      dismissReminderForThread('');
      expect(loadReminders()).toHaveLength(1);
    });

    it('does not affect reminders with different threadIds', () => {
      saveReminder(makeReminder({ threadId: 'thread-a' }));
      saveReminder(makeReminder({ threadId: 'thread-b' }));
      dismissReminderForThread('thread-a');
      const remaining = loadReminders();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].threadId).toBe('thread-b');
    });
  });

  describe('getOverdueReminders()', () => {
    it('returns reminder when remindAfter is exactly at current time', () => {
      saveReminder(makeReminder({ remindAfter: '2026-06-06T12:00:00.000Z' }));
      expect(getOverdueReminders()).toHaveLength(1);
    });

    it('returns reminder when remindAfter is in the past', () => {
      saveReminder(makeReminder({ remindAfter: '2026-06-06T11:59:59.999Z' }));
      expect(getOverdueReminders()).toHaveLength(1);
    });

    it('does not return reminder when remindAfter is just after current time', () => {
      saveReminder(makeReminder({ remindAfter: '2026-06-06T12:00:00.001Z' }));
      expect(getOverdueReminders()).toHaveLength(0);
    });

    it('excludes reminders with notified=true', () => {
      const r = saveReminder(makeReminder({ remindAfter: '2026-06-06T11:00:00.000Z' }));
      markReminderNotified(r.id);
      expect(getOverdueReminders()).toHaveLength(0);
    });
  });

  describe('markReminderNotified()', () => {
    it('sets notified flag to true', () => {
      const r = saveReminder(makeReminder());
      markReminderNotified(r.id);
      const stored = loadReminders();
      expect(stored[0].notified).toBe(true);
    });

    it('does not remove the reminder from storage', () => {
      const r = saveReminder(makeReminder());
      markReminderNotified(r.id);
      expect(loadReminders()).toHaveLength(1);
    });

    it('only affects the targeted reminder', () => {
      saveReminder(makeReminder({ threadId: 'a' }));
      const r2 = saveReminder(makeReminder({ threadId: 'b' }));
      markReminderNotified(r2.id);
      const stored = loadReminders();
      const notNotified = stored.filter(r => !r.notified);
      expect(notNotified).toHaveLength(1);
      expect(notNotified[0].threadId).toBe('a');
    });
  });

  describe('autoCancelIfReplied()', () => {
    it('returns true and removes reminder when message count grew', () => {
      saveReminder(makeReminder({ threadId: 'thread-1', messageCountAtSet: 5 }));
      const result = autoCancelIfReplied('thread-1', 6);
      expect(result).toBe(true);
      expect(loadReminders()).toHaveLength(0);
    });

    it('returns false when message count is the same', () => {
      saveReminder(makeReminder({ threadId: 'thread-1', messageCountAtSet: 5 }));
      const result = autoCancelIfReplied('thread-1', 5);
      expect(result).toBe(false);
      expect(loadReminders()).toHaveLength(1);
    });

    it('returns false when no reminder exists for threadId', () => {
      const result = autoCancelIfReplied('nonexistent-thread', 10);
      expect(result).toBe(false);
    });

    it('returns false when threadId is empty', () => {
      saveReminder(makeReminder({ threadId: '', messageCountAtSet: 5 }));
      const result = autoCancelIfReplied('', 10);
      expect(result).toBe(false);
    });

    it('returns false (never cancels) when messageCountAtSet is undefined', () => {
      saveReminder(makeReminder({ threadId: 'thread-1' }));
      const result = autoCancelIfReplied('thread-1', 100);
      expect(result).toBe(false);
      expect(loadReminders()).toHaveLength(1);
    });

    it('ignores notified reminders when looking for match', () => {
      const r = saveReminder(makeReminder({ threadId: 'thread-1', messageCountAtSet: 5 }));
      markReminderNotified(r.id);
      const result = autoCancelIfReplied('thread-1', 10);
      expect(result).toBe(false);
    });
  });

  describe('getPendingReminders()', () => {
    it('returns reminders that are not overdue and not notified', () => {
      saveReminder(makeReminder({ threadId: 'future', remindAfter: '2026-06-10T00:00:00.000Z' }));
      expect(getPendingReminders()).toHaveLength(1);
    });

    it('excludes overdue reminders', () => {
      saveReminder(makeReminder({ threadId: 'past', remindAfter: '2026-06-01T00:00:00.000Z' }));
      expect(getPendingReminders()).toHaveLength(0);
    });

    it('excludes notified reminders', () => {
      const r = saveReminder(makeReminder({ threadId: 'future', remindAfter: '2026-06-10T00:00:00.000Z' }));
      markReminderNotified(r.id);
      expect(getPendingReminders()).toHaveLength(0);
    });
  });

  describe('getAllActiveReminders()', () => {
    it('returns both pending and overdue-unnotified reminders', () => {
      saveReminder(makeReminder({ threadId: 'future', remindAfter: '2026-06-10T00:00:00.000Z' }));
      saveReminder(makeReminder({ threadId: 'past', remindAfter: '2026-06-01T00:00:00.000Z' }));
      expect(getAllActiveReminders()).toHaveLength(2);
    });

    it('excludes notified reminders', () => {
      const r = saveReminder(makeReminder({ threadId: 'future', remindAfter: '2026-06-10T00:00:00.000Z' }));
      saveReminder(makeReminder({ threadId: 'past', remindAfter: '2026-06-01T00:00:00.000Z' }));
      markReminderNotified(r.id);
      expect(getAllActiveReminders()).toHaveLength(1);
    });
  });

  describe('reminderPresets()', () => {
    it('returns exactly 4 presets', () => {
      expect(reminderPresets()).toHaveLength(4);
    });

    it('returns the expected labels and days', () => {
      const presets = reminderPresets();
      expect(presets).toEqual([
        { label: 'Tomorrow', days: 1 },
        { label: 'In 3 days', days: 3 },
        { label: 'In 1 week', days: 7 },
        { label: 'In 2 weeks', days: 14 },
      ]);
    });
  });

  describe('getActiveReminderThreadIds()', () => {
    it('returns set of active threadIds', () => {
      saveReminder(makeReminder({ threadId: 'thread-a' }));
      saveReminder(makeReminder({ threadId: 'thread-b' }));
      const ids = getActiveReminderThreadIds();
      expect(ids).toBeInstanceOf(Set);
      expect(ids.has('thread-a')).toBe(true);
      expect(ids.has('thread-b')).toBe(true);
      expect(ids.size).toBe(2);
    });

    it('excludes notified reminders', () => {
      const r = saveReminder(makeReminder({ threadId: 'thread-a' }));
      saveReminder(makeReminder({ threadId: 'thread-b' }));
      markReminderNotified(r.id);
      const ids = getActiveReminderThreadIds();
      expect(ids.has('thread-a')).toBe(false);
      expect(ids.has('thread-b')).toBe(true);
      expect(ids.size).toBe(1);
    });

    it('excludes empty threadIds', () => {
      saveReminder(makeReminder({ threadId: '' }));
      saveReminder(makeReminder({ threadId: 'thread-x' }));
      const ids = getActiveReminderThreadIds();
      expect(ids.has('')).toBe(false);
      expect(ids.size).toBe(1);
    });
  });
});
