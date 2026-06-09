/**
 * Unit tests for Scheduled Job Actions (service layer).
 * Verifies orchestration between DB, store, and toast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockCreateJob = vi.fn();
const mockCancelJob = vi.fn();
const mockGetDueJobs = vi.fn().mockResolvedValue([]);
const mockMarkFired = vi.fn();
const mockMarkFailed = vi.fn();

vi.mock('../src/scheduledJobsDb', () => ({
  createJob: (...args: unknown[]) => mockCreateJob(...args),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
  getDueJobs: (...args: unknown[]) => mockGetDueJobs(...args),
  markFired: (...args: unknown[]) => mockMarkFired(...args),
  markFailed: (...args: unknown[]) => mockMarkFailed(...args),
}));

const mockShowToast = vi.fn();
vi.mock('../src/toasts', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import {
  scheduleSend,
  cancelScheduledSend,
  catchUpDueJobs,
} from '../src/solid/scheduledJobActions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scheduledJobActions', () => {
  describe('scheduleSend', () => {
    it('creates a send job in DB and shows toast', async () => {
      mockCreateJob.mockResolvedValue({ id: 'job-1', fireAt: 1700000000000 });

      await scheduleSend({
        accountId: 'acc-1',
        to: 'bob@example.com',
        subject: 'Hello',
        body: 'World',
        sendAt: 1700000000000,
      });

      expect(mockCreateJob).toHaveBeenCalledWith({
        accountId: 'acc-1',
        jobType: 'send',
        payload: expect.any(String),
        fireAt: 1700000000000,
      });
      expect(mockShowToast).toHaveBeenCalled();
    });
  });

  describe('cancelScheduledSend', () => {
    it('cancels the job and shows toast', async () => {
      await cancelScheduledSend('job-1');

      expect(mockCancelJob).toHaveBeenCalledWith('job-1');
      expect(mockShowToast).toHaveBeenCalled();
    });
  });

  describe('catchUpDueJobs', () => {
    it('processes due snooze_wake jobs by calling handler', async () => {
      mockGetDueJobs.mockResolvedValue([
        { id: 'j1', jobType: 'snooze_wake', payload: JSON.stringify({ threadId: 't1' }), status: 'pending', attempts: 0 },
      ]);

      const onSnoozeWake = vi.fn().mockResolvedValue(undefined);
      const onReminderFire = vi.fn();

      await catchUpDueJobs({ onSnoozeWake, onReminderFire });

      expect(onSnoozeWake).toHaveBeenCalledWith('t1');
      expect(mockMarkFired).toHaveBeenCalledWith('j1');
    });

    it('processes due reminder_fire jobs', async () => {
      mockGetDueJobs.mockResolvedValue([
        { id: 'j2', jobType: 'reminder_fire', payload: JSON.stringify({ threadId: 't2', message: 'Follow up' }), status: 'pending', attempts: 0 },
      ]);

      const onSnoozeWake = vi.fn();
      const onReminderFire = vi.fn().mockResolvedValue(undefined);

      await catchUpDueJobs({ onSnoozeWake, onReminderFire });

      expect(onReminderFire).toHaveBeenCalledWith('t2', 'Follow up');
      expect(mockMarkFired).toHaveBeenCalledWith('j2');
    });

    it('marks failed if handler throws', async () => {
      mockGetDueJobs.mockResolvedValue([
        { id: 'j3', jobType: 'snooze_wake', payload: JSON.stringify({ threadId: 't3' }), status: 'pending', attempts: 0 },
      ]);

      const onSnoozeWake = vi.fn().mockRejectedValue(new Error('oops'));
      const onReminderFire = vi.fn();

      await catchUpDueJobs({ onSnoozeWake, onReminderFire });

      expect(mockMarkFailed).toHaveBeenCalledWith('j3', 'oops');
    });
  });
});
