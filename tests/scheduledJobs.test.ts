// tests/scheduledJobs.test.ts — Domain logic for scheduled jobs
import { describe, it, expect } from 'vitest';
import {
  isDue,
  getNextRetryDelay,
  canRetry,
  MAX_ATTEMPTS,
  type ScheduledJob,
  type SendPayload,
} from '../src/scheduledJobs';

function makeJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: 'job-1',
    accountId: 'acc-1',
    jobType: 'send',
    payload: JSON.stringify({ to: 'a@b.com', subject: 'Hi', body: 'Hello' } satisfies SendPayload),
    fireAt: 1000,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: 900,
    ...overrides,
  };
}

describe('scheduledJobs domain', () => {
  describe('isDue', () => {
    it('returns true when fire_at <= now and status is pending', () => {
      const job = makeJob({ fireAt: 1000, status: 'pending' });
      expect(isDue(job, 1000)).toBe(true);
      expect(isDue(job, 1500)).toBe(true);
    });

    it('returns false when fire_at > now', () => {
      const job = makeJob({ fireAt: 2000, status: 'pending' });
      expect(isDue(job, 1000)).toBe(false);
    });

    it('returns false for non-pending statuses', () => {
      expect(isDue(makeJob({ status: 'fired' }), 9999)).toBe(false);
      expect(isDue(makeJob({ status: 'failed' }), 9999)).toBe(false);
      expect(isDue(makeJob({ status: 'cancelled' }), 9999)).toBe(false);
    });
  });

  describe('getNextRetryDelay', () => {
    it('returns 30s for first retry', () => {
      expect(getNextRetryDelay(0)).toBe(30_000);
    });

    it('returns 2min for second retry', () => {
      expect(getNextRetryDelay(1)).toBe(120_000);
    });

    it('returns 10min for third retry', () => {
      expect(getNextRetryDelay(2)).toBe(600_000);
    });

    it('caps at 10min for higher attempts', () => {
      expect(getNextRetryDelay(5)).toBe(600_000);
    });
  });

  describe('canRetry', () => {
    it('returns true when attempts < MAX_ATTEMPTS', () => {
      expect(canRetry(makeJob({ attempts: 0 }))).toBe(true);
      expect(canRetry(makeJob({ attempts: 1 }))).toBe(true);
      expect(canRetry(makeJob({ attempts: 2 }))).toBe(true);
    });

    it('returns false when attempts >= MAX_ATTEMPTS', () => {
      expect(canRetry(makeJob({ attempts: MAX_ATTEMPTS }))).toBe(false);
      expect(canRetry(makeJob({ attempts: MAX_ATTEMPTS + 1 }))).toBe(false);
    });

    it('returns false for non-pending job', () => {
      expect(canRetry(makeJob({ attempts: 0, status: 'cancelled' }))).toBe(false);
    });
  });

  describe('MAX_ATTEMPTS', () => {
    it('is 3', () => {
      expect(MAX_ATTEMPTS).toBe(3);
    });
  });
});
