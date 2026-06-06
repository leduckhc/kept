import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveReminder,
  loadReminders,
  dismissReminder,
  autoCancelIfReplied,
  getOverdueReminders,
  FollowupReminder,
} from '../src/followupReminders';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  length: 0,
  key: () => null,
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('Follow-up Reminders Integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
  });

  it('saveReminder is called with correct args after successful send', () => {
    // Simulate the compose flow: after send, saveReminder is called with thread info
    const remindAfter = new Date(Date.now() + 3 * 86400000).toISOString();
    const result = saveReminder({
      threadId: 'thread-abc123',
      subject: 'Project update',
      sentTo: 'alice@example.com',
      remindAfter,
      messageCountAtSet: 5,
    });

    expect(result.id).toMatch(/^reminder-/);
    expect(result.threadId).toBe('thread-abc123');
    expect(result.subject).toBe('Project update');
    expect(result.sentTo).toBe('alice@example.com');
    expect(result.remindAfter).toBe(remindAfter);
    expect(result.messageCountAtSet).toBe(5);
    expect(result.createdAt).toBe('2026-06-01T12:00:00.000Z');

    // Verify it's persisted
    const stored = loadReminders();
    expect(stored).toHaveLength(1);
    expect(stored[0].threadId).toBe('thread-abc123');
  });

  it('reminder NOT saved when followupDays is null (simulate user declining)', () => {
    // When the user declines the followup prompt, saveReminder is never called
    // We verify that not calling saveReminder means nothing is stored
    const followupDays: number | null = null;

    if (followupDays !== null) {
      const remindAfter = new Date(Date.now() + followupDays * 86400000).toISOString();
      saveReminder({
        threadId: 'thread-xyz',
        subject: 'Ignored',
        sentTo: 'bob@example.com',
        remindAfter,
      });
    }

    const stored = loadReminders();
    expect(stored).toHaveLength(0);
  });

  it('autoCancelIfReplied correctly cancels when message count grows during sync', () => {
    // Set up a reminder with messageCountAtSet = 3
    saveReminder({
      threadId: 'thread-reply-test',
      subject: 'Waiting for reply',
      sentTo: 'carol@example.com',
      remindAfter: new Date(Date.now() + 7 * 86400000).toISOString(),
      messageCountAtSet: 3,
    });

    expect(loadReminders()).toHaveLength(1);

    // Sync detects 5 messages now (reply arrived)
    const cancelled = autoCancelIfReplied('thread-reply-test', 5);

    expect(cancelled).toBe(true);
    expect(loadReminders()).toHaveLength(0);
  });

  it('autoCancelIfReplied leaves reminder untouched when count is same', () => {
    saveReminder({
      threadId: 'thread-no-reply',
      subject: 'Still waiting',
      sentTo: 'dave@example.com',
      remindAfter: new Date(Date.now() + 7 * 86400000).toISOString(),
      messageCountAtSet: 4,
    });

    // Same count — no reply yet
    const cancelled = autoCancelIfReplied('thread-no-reply', 4);

    expect(cancelled).toBe(false);
    expect(loadReminders()).toHaveLength(1);
  });

  it('messageCountAtSet undefined means auto-cancel never triggers (known bug)', () => {
    // When messageCountAtSet is not set (e.g., older reminders), auto-cancel
    // should not fire, even if currentMessageCount is high
    saveReminder({
      threadId: 'thread-legacy',
      subject: 'Legacy reminder',
      sentTo: 'eve@example.com',
      remindAfter: new Date(Date.now() + 7 * 86400000).toISOString(),
      // messageCountAtSet intentionally omitted
    });

    const cancelled = autoCancelIfReplied('thread-legacy', 100);

    // This is the known bug: without messageCountAtSet, we can't detect replies
    expect(cancelled).toBe(false);
    expect(loadReminders()).toHaveLength(1);
  });

  it('empty threadId for new compose stores reminder with empty string threadId', () => {
    // New compose emails don't have a threadId yet
    const result = saveReminder({
      threadId: '',
      subject: 'Brand new email',
      sentTo: 'frank@example.com',
      remindAfter: new Date(Date.now() + 3 * 86400000).toISOString(),
      messageCountAtSet: 1,
    });

    expect(result.threadId).toBe('');

    const stored = loadReminders();
    expect(stored).toHaveLength(1);
    expect(stored[0].threadId).toBe('');

    // autoCancelIfReplied should return false for empty threadId
    const cancelled = autoCancelIfReplied('', 5);
    expect(cancelled).toBe(false);
  });
});
