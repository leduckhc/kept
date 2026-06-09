// scheduledJobs.ts — Domain types + pure logic for scheduled background jobs
// Service+Repository pattern: this is the pure domain layer (no I/O)

export type JobType = 'send' | 'snooze_wake' | 'reminder_fire';
export type JobStatus = 'pending' | 'fired' | 'failed' | 'cancelled';

export interface ScheduledJob {
  id: string;
  accountId: string;
  jobType: JobType;
  payload: string; // JSON-encoded, see payload types below
  fireAt: number; // unix timestamp in ms
  status: JobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: number;
}

// ── Payload types ──────────────────────────────────────────────

export interface SendPayload {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  threadId?: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: string }>; // base64
}

export interface SnoozePayload {
  threadId: string;
}

export interface ReminderPayload {
  threadId: string;
  message?: string;
}

// ── Pure logic ─────────────────────────────────────────────────

export const MAX_ATTEMPTS = 3;

/** A job is due if it's pending and its fire time has passed */
export function isDue(job: ScheduledJob, now: number): boolean {
  return job.status === 'pending' && job.fireAt <= now;
}

/** Exponential backoff: 30s → 2min → 10min (capped) */
export function getNextRetryDelay(attempts: number): number {
  const delays = [30_000, 120_000, 600_000];
  return delays[Math.min(attempts, delays.length - 1)];
}

/** Whether the job can be retried (pending + under max attempts) */
export function canRetry(job: ScheduledJob): boolean {
  return job.status === 'pending' && job.attempts < MAX_ATTEMPTS;
}

/** Generate a unique job ID */
export function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
