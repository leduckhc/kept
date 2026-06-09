/**
 * Unit tests for Smart Folders filter engine.
 * Written BEFORE implementation (TDD red phase).
 *
 * Smart Folders = saved searches with named filter criteria.
 * Pure functions: no DB, no side effects.
 */
import { describe, it, expect } from 'vitest';
import {
  matchesThread,
  matchesAllConditions,
  matchesAnyCondition,
  type SmartFolder,
  type SmartFolderCondition,
  type FilterableThread,
} from '../src/smartFolders';

// ── Test fixtures ─────────────────────────────────────────────
const thread = (overrides: Partial<FilterableThread> = {}): FilterableThread => ({
  id: 't01',
  subject: 'Re: Project kickoff meeting notes',
  senderName: 'David Park',
  senderEmail: 'david.park@company.com',
  snippet: 'Thanks for sending these. I have a few comments on the timeline...',
  isUnread: false,
  isStarred: true,
  hasAttachment: true,
  category: 'personal',
  label: 'INBOX',
  receivedAt: 1748650000000,
  userLabels: 'work,important',
  ...overrides,
});

const folder = (conditions: SmartFolderCondition[], matchMode: 'all' | 'any' = 'all'): SmartFolder => ({
  id: 'sf01',
  name: 'Test Folder',
  accountId: 'test-user-1',
  conditions,
  matchMode,
  createdAt: Date.now(),
});

// ── matchesThread: single condition tests ─────────────────────

describe('matchesThread — from condition', () => {
  it('matches sender email (case-insensitive)', () => {
    const f = folder([{ field: 'from', operator: 'contains', value: 'david.park' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('matches sender name', () => {
    const f = folder([{ field: 'from', operator: 'contains', value: 'Park' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('does not match when value absent', () => {
    const f = folder([{ field: 'from', operator: 'contains', value: 'sarah' }]);
    expect(matchesThread(thread(), f)).toBe(false);
  });

  it('equals operator matches exact email', () => {
    const f = folder([{ field: 'from', operator: 'equals', value: 'david.park@company.com' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('equals operator is case-insensitive', () => {
    const f = folder([{ field: 'from', operator: 'equals', value: 'David.Park@Company.com' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });
});

describe('matchesThread — subject condition', () => {
  it('contains match on subject', () => {
    const f = folder([{ field: 'subject', operator: 'contains', value: 'kickoff' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('case insensitive', () => {
    const f = folder([{ field: 'subject', operator: 'contains', value: 'KICKOFF' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('no match', () => {
    const f = folder([{ field: 'subject', operator: 'contains', value: 'invoice' }]);
    expect(matchesThread(thread(), f)).toBe(false);
  });
});

describe('matchesThread — has:attachment', () => {
  it('matches when thread has attachment', () => {
    const f = folder([{ field: 'hasAttachment', operator: 'equals', value: 'true' }]);
    expect(matchesThread(thread({ hasAttachment: true }), f)).toBe(true);
  });

  it('does not match when no attachment', () => {
    const f = folder([{ field: 'hasAttachment', operator: 'equals', value: 'true' }]);
    expect(matchesThread(thread({ hasAttachment: false }), f)).toBe(false);
  });
});

describe('matchesThread — isUnread', () => {
  it('matches unread threads', () => {
    const f = folder([{ field: 'isUnread', operator: 'equals', value: 'true' }]);
    expect(matchesThread(thread({ isUnread: true }), f)).toBe(true);
  });

  it('does not match read threads', () => {
    const f = folder([{ field: 'isUnread', operator: 'equals', value: 'true' }]);
    expect(matchesThread(thread({ isUnread: false }), f)).toBe(false);
  });
});

describe('matchesThread — isStarred', () => {
  it('matches starred', () => {
    const f = folder([{ field: 'isStarred', operator: 'equals', value: 'true' }]);
    expect(matchesThread(thread({ isStarred: true }), f)).toBe(true);
  });
});

describe('matchesThread — category', () => {
  it('equals match on category', () => {
    const f = folder([{ field: 'category', operator: 'equals', value: 'personal' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('no match on different category', () => {
    const f = folder([{ field: 'category', operator: 'equals', value: 'updates' }]);
    expect(matchesThread(thread(), f)).toBe(false);
  });
});

describe('matchesThread — label (user_labels)', () => {
  it('contains match on user labels', () => {
    const f = folder([{ field: 'label', operator: 'contains', value: 'work' }]);
    expect(matchesThread(thread({ userLabels: 'work,important' }), f)).toBe(true);
  });

  it('no match when label absent', () => {
    const f = folder([{ field: 'label', operator: 'contains', value: 'finance' }]);
    expect(matchesThread(thread({ userLabels: 'work,important' }), f)).toBe(false);
  });
});

describe('matchesThread — domain condition', () => {
  it('matches sender domain', () => {
    const f = folder([{ field: 'domain', operator: 'equals', value: 'company.com' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('contains on domain', () => {
    const f = folder([{ field: 'domain', operator: 'contains', value: 'company' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('no match', () => {
    const f = folder([{ field: 'domain', operator: 'equals', value: 'gmail.com' }]);
    expect(matchesThread(thread(), f)).toBe(false);
  });
});

// ── Match modes: all vs any ───────────────────────────────────

describe('matchesAllConditions (AND)', () => {
  it('all must match', () => {
    const conditions: SmartFolderCondition[] = [
      { field: 'from', operator: 'contains', value: 'david' },
      { field: 'hasAttachment', operator: 'equals', value: 'true' },
    ];
    expect(matchesAllConditions(thread(), conditions)).toBe(true);
  });

  it('fails if one does not match', () => {
    const conditions: SmartFolderCondition[] = [
      { field: 'from', operator: 'contains', value: 'david' },
      { field: 'category', operator: 'equals', value: 'updates' },
    ];
    expect(matchesAllConditions(thread(), conditions)).toBe(false);
  });
});

describe('matchesAnyCondition (OR)', () => {
  it('passes if at least one matches', () => {
    const conditions: SmartFolderCondition[] = [
      { field: 'from', operator: 'contains', value: 'sarah' },
      { field: 'hasAttachment', operator: 'equals', value: 'true' },
    ];
    expect(matchesAnyCondition(thread(), conditions)).toBe(true);
  });

  it('fails if none match', () => {
    const conditions: SmartFolderCondition[] = [
      { field: 'from', operator: 'contains', value: 'sarah' },
      { field: 'category', operator: 'equals', value: 'updates' },
    ];
    expect(matchesAnyCondition(thread(), conditions)).toBe(false);
  });
});

// ── matchesThread with matchMode ──────────────────────────────

describe('matchesThread respects folder matchMode', () => {
  it('all mode: all conditions must pass', () => {
    const f = folder([
      { field: 'from', operator: 'contains', value: 'david' },
      { field: 'isStarred', operator: 'equals', value: 'true' },
    ], 'all');
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('any mode: one passing is enough', () => {
    const f = folder([
      { field: 'from', operator: 'contains', value: 'nobody' },
      { field: 'isStarred', operator: 'equals', value: 'true' },
    ], 'any');
    expect(matchesThread(thread(), f)).toBe(true);
  });
});

// ── Edge cases ────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty conditions array matches everything', () => {
    const f = folder([]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('empty value in contains always matches (wildcard)', () => {
    const f = folder([{ field: 'subject', operator: 'contains', value: '' }]);
    expect(matchesThread(thread(), f)).toBe(true);
  });

  it('handles thread with empty/null userLabels', () => {
    const f = folder([{ field: 'label', operator: 'contains', value: 'work' }]);
    expect(matchesThread(thread({ userLabels: '' }), f)).toBe(false);
  });
});
