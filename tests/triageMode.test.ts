// tests/triageMode.test.ts — Unit tests for triage mode logic
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM for triageMode
vi.stubGlobal('document', {
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({
    className: '',
    innerHTML: '',
    remove: vi.fn(),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: vi.fn(),
  }),
  body: { appendChild: vi.fn() },
});

// Mock imports before loading module
vi.mock('../src/store', () => ({}));
vi.mock('../src/snooze', () => ({ openSnoozePicker: vi.fn() }));
vi.mock('../src/avatar', () => ({ avatarHtml: () => '<div class="avatar">A</div>' }));
vi.mock('../src/helpers', () => ({
  esc: (s: string) => s,
  formatDate: () => 'Jan 1',
}));
vi.mock('../src/icons', () => ({
  icon: new Proxy({}, { get: () => () => '<svg></svg>' }),
}));
vi.mock('../src/actions', () => ({
  doArchive: vi.fn().mockResolvedValue(undefined),
  doMarkRead: vi.fn().mockResolvedValue(undefined),
  doToggleStar: vi.fn().mockResolvedValue(undefined),
  doSetAside: vi.fn().mockResolvedValue(undefined),
}));

import { state } from '../src/state';
import {
  buildTriageQueue,
  startTriage,
  exitTriage,
  isTriageActive,
  currentTriageThread,
  triageSkip,
  getTriageState,
} from '../src/triageMode';

function makeThread(overrides: Partial<typeof state.threads[0]> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    subject: 'Test Subject',
    snippet: 'Test snippet',
    senderName: 'Alice',
    senderEmail: 'alice@test.com',
    receivedAt: Date.now(),
    isUnread: true,
    isArchived: false,
    isStarred: false,
    hasAttachment: false,
    gmailThreadId: 'gm-1',
    snoozedUntil: null,
    snoozeLabel: null,
    messageCount: 1,
    label: 'INBOX',
    accountId: 'acc-1',
    isMuted: false,
    isSetAside: false,
    category: 'personal',
    userLabels: '',
    ...overrides,
  };
}

describe('triageMode', () => {
  beforeEach(() => {
    state.threads = [];
    exitTriage();
  });

  describe('buildTriageQueue', () => {
    it('filters to inbox, non-archived, non-muted, non-snoozed threads', () => {
      state.threads = [
        makeThread({ label: 'INBOX' }),
        makeThread({ label: 'SENT' }),
        makeThread({ label: 'INBOX', isArchived: true }),
        makeThread({ label: 'INBOX', isMuted: true }),
        makeThread({ label: 'INBOX', snoozedUntil: Date.now() + 100000 }),
      ];
      const queue = buildTriageQueue();
      expect(queue).toHaveLength(1);
    });

    it('sorts unread before read, then newest first', () => {
      const older = makeThread({ isUnread: false, receivedAt: 1000 });
      const newer = makeThread({ isUnread: false, receivedAt: 2000 });
      const unread = makeThread({ isUnread: true, receivedAt: 500 });
      state.threads = [older, newer, unread];
      const queue = buildTriageQueue();
      expect(queue[0].id).toBe(unread.id);
      expect(queue[1].id).toBe(newer.id);
      expect(queue[2].id).toBe(older.id);
    });
  });

  describe('startTriage / exitTriage', () => {
    it('returns false when inbox is empty', () => {
      state.threads = [];
      expect(startTriage()).toBe(false);
      expect(isTriageActive()).toBe(false);
    });

    it('starts with first thread as current', () => {
      state.threads = [makeThread()];
      expect(startTriage()).toBe(true);
      expect(isTriageActive()).toBe(true);
      expect(currentTriageThread()).not.toBeNull();
    });

    it('exitTriage resets state', () => {
      state.threads = [makeThread()];
      startTriage();
      exitTriage();
      expect(isTriageActive()).toBe(false);
      expect(currentTriageThread()).toBeNull();
    });
  });

  describe('triageSkip', () => {
    it('advances to next thread without removing current', () => {
      const t1 = makeThread({ receivedAt: 2000 });
      const t2 = makeThread({ receivedAt: 1000 });
      state.threads = [t1, t2];
      startTriage();
      const first = currentTriageThread();
      triageSkip();
      const second = currentTriageThread();
      expect(second!.id).not.toBe(first!.id);
    });

    it('returns null when only one thread (ends triage)', () => {
      state.threads = [makeThread()];
      startTriage();
      const result = triageSkip();
      expect(result).toBeNull();
      expect(isTriageActive()).toBe(false);
    });
  });

  describe('getTriageState', () => {
    it('tracks processed count and start count', () => {
      state.threads = [makeThread(), makeThread(), makeThread()];
      startTriage();
      const s = getTriageState();
      expect(s.startCount).toBe(3);
      expect(s.processed).toBe(0);
    });
  });
});
