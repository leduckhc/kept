/**
 * Scheduled Job Actions (service layer).
 * Orchestrates between DB, domain logic, and UI (toasts).
 * Single Responsibility: coordinate job lifecycle operations.
 */
import { createJob, cancelJob, getDueJobs, markFired, markFailed } from '../scheduledJobsDb';
import { showToast } from '../toasts';
import type { SendPayload, SnoozePayload, ReminderPayload } from '../scheduledJobs';

// ── Schedule Send ─────────────────────────────────────────────

export interface ScheduleSendInput {
  accountId: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  threadId?: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: string }>;
  sendAt: number; // unix ms
}

export async function scheduleSend(input: ScheduleSendInput): Promise<string> {
  const payload: SendPayload = {
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    body: input.body,
    htmlBody: input.htmlBody,
    threadId: input.threadId,
    inReplyTo: input.inReplyTo,
    attachments: input.attachments,
  };

  const job = await createJob({
    accountId: input.accountId,
    jobType: 'send',
    payload: JSON.stringify(payload),
    fireAt: input.sendAt,
  });

  const when = new Date(input.sendAt);
  showToast(`Scheduled send for ${when.toLocaleString()}`);
  return job.id;
}

// ── Cancel ────────────────────────────────────────────────────

export async function cancelScheduledSend(jobId: string): Promise<void> {
  await cancelJob(jobId);
  showToast('Scheduled send cancelled');
}

// ── Catch-Up on Open ──────────────────────────────────────────

export interface CatchUpHandlers {
  onSnoozeWake: (threadId: string) => Promise<void>;
  onReminderFire: (threadId: string, message?: string) => Promise<void>;
}

/**
 * Process all past-due non-send jobs (snooze wake, reminders).
 * Called on app startup to catch up on anything that fired while app was closed.
 * Send jobs are NOT processed here — they're handled by kept-dispatch sidecar.
 */
export async function catchUpDueJobs(handlers: CatchUpHandlers): Promise<void> {
  const now = Date.now();
  const dueJobs = await getDueJobs(now);

  for (const job of dueJobs) {
    // Skip send jobs — handled by sidecar
    if (job.jobType === 'send') continue;

    try {
      if (job.jobType === 'snooze_wake') {
        const payload: SnoozePayload = JSON.parse(job.payload);
        await handlers.onSnoozeWake(payload.threadId);
      } else if (job.jobType === 'reminder_fire') {
        const payload: ReminderPayload = JSON.parse(job.payload);
        await handlers.onReminderFire(payload.threadId, payload.message);
      }
      await markFired(job.id);
    } catch (err) {
      await markFailed(job.id, err instanceof Error ? err.message : String(err));
    }
  }
}
