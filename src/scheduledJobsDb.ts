/**
 * Scheduled Jobs DB persistence (CRUD).
 * Single Responsibility: read/write scheduled jobs to SQLite.
 * Domain logic lives in scheduledJobs.ts.
 */
import { getDb } from './db';
import { generateJobId, MAX_ATTEMPTS, type ScheduledJob, type JobType } from './scheduledJobs';

// ── Input type ────────────────────────────────────────────────

export type CreateJobInput = {
  accountId: string;
  jobType: JobType;
  payload: string; // JSON
  fireAt: number; // unix ms
};

// ── DB row shape ──────────────────────────────────────────────

interface JobRow {
  id: string;
  account_id: string;
  job_type: string;
  payload: string;
  fire_at: number;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: number;
}

function rowToJob(row: JobRow): ScheduledJob {
  return {
    id: row.id,
    accountId: row.account_id,
    jobType: row.job_type as JobType,
    payload: row.payload,
    fireAt: row.fire_at,
    status: row.status as ScheduledJob['status'],
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────

export async function createJob(input: CreateJobInput): Promise<ScheduledJob> {
  const db = await getDb();
  const id = generateJobId();
  const now = Date.now();

  await db.execute(
    `INSERT INTO scheduled_jobs (id, account_id, job_type, payload, fire_at, status, attempts, last_error, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, ?)`,
    [id, input.accountId, input.jobType, input.payload, input.fireAt, now]
  );

  return {
    id,
    accountId: input.accountId,
    jobType: input.jobType,
    payload: input.payload,
    fireAt: input.fireAt,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: now,
  };
}

export async function getDueJobs(now: number): Promise<ScheduledJob[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    `SELECT * FROM scheduled_jobs WHERE status = 'pending' AND fire_at <= ? ORDER BY fire_at ASC`,
    [now]
  );
  return rows.map(rowToJob);
}

export async function markFired(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE scheduled_jobs SET status = 'fired' WHERE id = ?`,
    [id]
  );
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getDb();
  // Increment attempts; if >= MAX_ATTEMPTS, set status to 'failed'
  await db.execute(
    `UPDATE scheduled_jobs
     SET attempts = attempts + 1,
         last_error = ?,
         status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE status END
     WHERE id = ?`,
    [error, MAX_ATTEMPTS, id]
  );
}

export async function cancelJob(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE scheduled_jobs SET status = 'cancelled' WHERE id = ?`,
    [id]
  );
}

export async function getJobsByAccount(accountId: string): Promise<ScheduledJob[]> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    `SELECT * FROM scheduled_jobs WHERE account_id = ? ORDER BY fire_at ASC`,
    [accountId]
  );
  return rows.map(rowToJob);
}

export async function getPendingJobCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<[{ cnt: number }]>(
    `SELECT COUNT(*) as cnt FROM scheduled_jobs WHERE status = 'pending'`
  );
  return rows[0]?.cnt ?? 0;
}
