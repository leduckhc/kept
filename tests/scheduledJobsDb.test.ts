/**
 * Unit tests for Scheduled Jobs DB operations (CRUD).
 * Tests use an in-memory mock — no real SQLite needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createJob,
  getDueJobs,
  markFired,
  markFailed,
  cancelJob,
  getJobsByAccount,
  getPendingJobCount,
} from '../src/scheduledJobsDb';

// ── Mock DB ───────────────────────────────────────────────────

const rows: Record<string, unknown>[] = [];

const mockDb = {
  execute: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO scheduled_jobs')) {
      const [id, accountId, jobType, payload, fireAt, createdAt] = params as unknown[];
      rows.push({
        id, account_id: accountId, job_type: jobType,
        payload, fire_at: fireAt, status: 'pending',
        attempts: 0, last_error: null, created_at: createdAt,
      });
    } else if (sql.includes('SET status = \'fired\'')) {
      const id = (params as string[])[0];
      const r = rows.find(r => r.id === id);
      if (r) r.status = 'fired';
    } else if (sql.includes('SET attempts = attempts + 1')) {
      const [error, maxAttempts, id] = params as [string, number, string];
      const r = rows.find(r => r.id === id);
      if (r) {
        (r as { attempts: number }).attempts++;
        r.last_error = error;
        if ((r as { attempts: number }).attempts >= maxAttempts) r.status = 'failed';
      }
    } else if (sql.includes('SET status = \'cancelled\'')) {
      const id = (params as string[])[0];
      const r = rows.find(r => r.id === id);
      if (r) r.status = 'cancelled';
    }
    return { rowsAffected: 1 };
  }),
  select: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('WHERE status = \'pending\' AND fire_at <=')) {
      const now = (params as number[])[0];
      return rows.filter(r => r.status === 'pending' && (r.fire_at as number) <= now);
    }
    if (sql.includes('WHERE account_id = ?')) {
      const accountId = (params as string[])[0];
      return rows.filter(r => r.account_id === accountId);
    }
    if (sql.includes('COUNT(*)')) {
      const cnt = rows.filter(r => r.status === 'pending').length;
      return [{ cnt }];
    }
    return [];
  }),
};

vi.mock('../src/db', () => ({
  getDb: () => Promise.resolve(mockDb),
}));

beforeEach(() => {
  rows.length = 0;
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────

describe('scheduledJobsDb', () => {
  describe('createJob', () => {
    it('inserts a job and returns it with generated id', async () => {
      const job = await createJob({
        accountId: 'acc-1',
        jobType: 'send',
        payload: JSON.stringify({ to: 'a@b.com', subject: 'Hi', body: 'Hello' }),
        fireAt: 5000,
      });

      expect(job.id).toMatch(/^job-/);
      expect(job.accountId).toBe('acc-1');
      expect(job.jobType).toBe('send');
      expect(job.status).toBe('pending');
      expect(job.attempts).toBe(0);
      expect(job.fireAt).toBe(5000);
      expect(job.lastError).toBeNull();
      expect(mockDb.execute).toHaveBeenCalledOnce();
    });
  });

  describe('getDueJobs', () => {
    it('returns pending jobs with fireAt <= now', async () => {
      await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 1000 });
      await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 2000 });
      await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 9000 });

      const due = await getDueJobs(2000);
      expect(due).toHaveLength(2);
      expect(due.every(j => j.fireAt <= 2000)).toBe(true);
    });

    it('excludes non-pending jobs', async () => {
      const job = await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 1000 });
      await markFired(job.id);

      const due = await getDueJobs(5000);
      expect(due).toHaveLength(0);
    });
  });

  describe('markFired', () => {
    it('sets status to fired', async () => {
      const job = await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 1000 });
      await markFired(job.id);

      const due = await getDueJobs(9999);
      expect(due.find(j => j.id === job.id)).toBeUndefined();
    });
  });

  describe('markFailed', () => {
    it('increments attempts and records error', async () => {
      const job = await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 1000 });
      await markFailed(job.id, 'Network error');

      const due = await getDueJobs(9999);
      const updated = due.find(j => j.id === job.id);
      expect(updated).toBeDefined();
      expect(updated!.attempts).toBe(1);
      expect(updated!.lastError).toBe('Network error');
    });

    it('sets status to failed after MAX_ATTEMPTS', async () => {
      const job = await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 1000 });
      await markFailed(job.id, 'err');
      await markFailed(job.id, 'err');
      await markFailed(job.id, 'err'); // 3rd = MAX

      const due = await getDueJobs(9999);
      expect(due.find(j => j.id === job.id)).toBeUndefined();
    });
  });

  describe('cancelJob', () => {
    it('sets status to cancelled', async () => {
      const job = await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 5000 });
      await cancelJob(job.id);

      const due = await getDueJobs(9999);
      expect(due.find(j => j.id === job.id)).toBeUndefined();
    });
  });

  describe('getJobsByAccount', () => {
    it('returns all jobs for an account', async () => {
      await createJob({ accountId: 'acc-1', jobType: 'send', payload: '{}', fireAt: 1000 });
      await createJob({ accountId: 'acc-2', jobType: 'send', payload: '{}', fireAt: 1000 });
      await createJob({ accountId: 'acc-1', jobType: 'snooze_wake', payload: '{}', fireAt: 2000 });

      const jobs = await getJobsByAccount('acc-1');
      expect(jobs).toHaveLength(2);
      expect(jobs.every(j => j.accountId === 'acc-1')).toBe(true);
    });
  });

  describe('getPendingJobCount', () => {
    it('returns count of pending jobs', async () => {
      await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 1000 });
      await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 2000 });
      const job = await createJob({ accountId: 'a', jobType: 'send', payload: '{}', fireAt: 3000 });
      await cancelJob(job.id);

      expect(await getPendingJobCount()).toBe(2);
    });
  });
});
