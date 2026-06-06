/**
 * Tests for search operators including date-range (before:, after:, date:)
 * KPT-087: Date/time-range search operators
 */
import { describe, it, expect } from 'vitest';
import { parseDateOperators, filterByDate } from '../src/search';
import type { Thread } from '../src/store';

// ── Helpers ───────────────────────────────────────────────

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    accountId: 'acc-1',
    gmailThreadId: 'gt-1',
    subject: 'Test Subject',
    snippet: 'Preview text...',
    senderName: 'Alice',
    senderEmail: 'alice@example.com',
    receivedAt: new Date('2025-06-15T10:00:00Z').getTime(),
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

// ── Date operator parsing tests ───────────────────────────

describe('parseDateOperators — parse before:/after:/date: from query', () => {
  it('parses before: with YYYY-MM-DD', () => {
    const result = parseDateOperators('before:2025-06-15');
    expect(result.before).toBe(new Date('2025-06-15T23:59:59.999Z').getTime());
    expect(result.after).toBeNull();
    expect(result.textQuery).toBe('');
  });

  it('parses after: with YYYY-MM-DD', () => {
    const result = parseDateOperators('after:2025-06-10');
    expect(result.after).toBe(new Date('2025-06-10T00:00:00.000Z').getTime());
    expect(result.before).toBeNull();
    expect(result.textQuery).toBe('');
  });

  it('parses date: as exact day range', () => {
    const result = parseDateOperators('date:2025-06-15');
    expect(result.after).toBe(new Date('2025-06-15T00:00:00.000Z').getTime());
    expect(result.before).toBe(new Date('2025-06-15T23:59:59.999Z').getTime());
    expect(result.textQuery).toBe('');
  });

  it('combines date operator with text query', () => {
    const result = parseDateOperators('after:2025-06-01 invoice');
    expect(result.after).toBe(new Date('2025-06-01T00:00:00.000Z').getTime());
    expect(result.textQuery).toBe('invoice');
  });

  it('combines before: and after: for a range', () => {
    const result = parseDateOperators('after:2025-06-01 before:2025-06-30');
    expect(result.after).toBe(new Date('2025-06-01T00:00:00.000Z').getTime());
    expect(result.before).toBe(new Date('2025-06-30T23:59:59.999Z').getTime());
    expect(result.textQuery).toBe('');
  });

  it('handles relative dates: yesterday', () => {
    const now = Date.now();
    const result = parseDateOperators('after:yesterday');
    expect(result.after).not.toBeNull();
    // yesterday start should be within 2 days of now
    expect(now - result.after!).toBeLessThan(2 * 86400000);
    expect(now - result.after!).toBeGreaterThanOrEqual(0);
  });

  it('handles YYYY-MM format (first day of month)', () => {
    const result = parseDateOperators('after:2025-03');
    expect(result.after).toBe(new Date('2025-03-01T00:00:00.000Z').getTime());
  });

  it('returns null dates for invalid date strings', () => {
    const result = parseDateOperators('before:notadate');
    expect(result.before).toBeNull();
    expect(result.textQuery).toBe('');
  });

  it('preserves other operators like from: alongside date operators', () => {
    const result = parseDateOperators('after:2025-06-01 from:alice');
    expect(result.after).toBe(new Date('2025-06-01T00:00:00.000Z').getTime());
    expect(result.textQuery).toBe('from:alice');
  });
});

describe('filterByDate — filters thread array by date constraints', () => {
  const threads: Thread[] = [
    makeThread({ id: 't-1', receivedAt: new Date('2025-06-01T08:00:00Z').getTime(), subject: 'June 1st' }),
    makeThread({ id: 't-2', receivedAt: new Date('2025-06-10T12:00:00Z').getTime(), subject: 'June 10th' }),
    makeThread({ id: 't-3', receivedAt: new Date('2025-06-15T10:00:00Z').getTime(), subject: 'June 15th' }),
    makeThread({ id: 't-4', receivedAt: new Date('2025-06-20T18:00:00Z').getTime(), subject: 'June 20th' }),
    makeThread({ id: 't-5', receivedAt: new Date('2025-06-30T23:00:00Z').getTime(), subject: 'June 30th' }),
  ];

  it('filters with before: — returns threads before date', () => {
    const result = filterByDate(threads, { before: new Date('2025-06-15T23:59:59.999Z').getTime(), after: null });
    expect(result.map(t => t.id)).toEqual(['t-1', 't-2', 't-3']);
  });

  it('filters with after: — returns threads after date', () => {
    const result = filterByDate(threads, { before: null, after: new Date('2025-06-15T00:00:00.000Z').getTime() });
    expect(result.map(t => t.id)).toEqual(['t-3', 't-4', 't-5']);
  });

  it('filters with both before: and after: — returns range', () => {
    const result = filterByDate(threads, {
      before: new Date('2025-06-20T23:59:59.999Z').getTime(),
      after: new Date('2025-06-10T00:00:00.000Z').getTime(),
    });
    expect(result.map(t => t.id)).toEqual(['t-2', 't-3', 't-4']);
  });

  it('returns all threads when both are null', () => {
    const result = filterByDate(threads, { before: null, after: null });
    expect(result).toHaveLength(5);
  });

  it('returns empty when range is impossible', () => {
    const result = filterByDate(threads, {
      after: new Date('2025-07-01T00:00:00.000Z').getTime(),
      before: new Date('2025-05-01T23:59:59.999Z').getTime(),
    });
    expect(result).toEqual([]);
  });

  it('date: operator filters to exact day', () => {
    const result = filterByDate(threads, {
      after: new Date('2025-06-10T00:00:00.000Z').getTime(),
      before: new Date('2025-06-10T23:59:59.999Z').getTime(),
    });
    expect(result.map(t => t.id)).toEqual(['t-2']);
  });
});
