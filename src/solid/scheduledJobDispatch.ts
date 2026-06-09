/**
 * scheduledJobDispatch.ts — In-app dispatch for DB-backed scheduled jobs.
 * Polls every 30s + on window focus. Fires due send jobs when app is open.
 * Catches up snooze/reminder jobs on startup.
 *
 * This runs inside the Tauri app. The kept-dispatch sidecar handles sends
 * when the app is closed (Phase 2 — Rust binary).
 */
import { getDueJobs, markFired, markFailed } from '../scheduledJobsDb';
import { canRetry, type SendPayload, type SnoozePayload, type ReminderPayload } from '../scheduledJobs';
import { showToast } from '../toasts';
import type { Account } from '../auth';

type SendFn = (account: Account, opts: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  threadId?: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: Uint8Array }>;
}) => Promise<void>;

const sendingIds = new Set<string>();

async function dispatchDueJobs(getAccount: () => Account | null, sendFn: SendFn) {
  const now = Date.now();
  const dueJobs = await getDueJobs(now);
  if (dueJobs.length === 0) return;

  const account = getAccount();
  if (!account) return;

  for (const job of dueJobs) {
    if (sendingIds.has(job.id)) continue;

    if (job.jobType === 'send') {
      sendingIds.add(job.id);
      try {
        const payload: SendPayload = JSON.parse(job.payload);
        const attachments = payload.attachments?.map(a => ({
          filename: a.filename,
          mimeType: a.mimeType,
          data: Uint8Array.from(atob(a.data), c => c.charCodeAt(0)),
        }));

        await sendFn(account, {
          to: payload.to,
          cc: payload.cc,
          subject: payload.subject,
          body: payload.body,
          htmlBody: payload.htmlBody,
          threadId: payload.threadId,
          inReplyTo: payload.inReplyTo,
          attachments,
        });

        await markFired(job.id);
        showToast(`Scheduled email to ${payload.to} sent`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await markFailed(job.id, msg);
        if (!canRetry({ ...job, attempts: job.attempts + 1 })) {
          showToast(`Scheduled send failed permanently: ${msg}`, 4000);
        }
      } finally {
        sendingIds.delete(job.id);
      }
    } else if (job.jobType === 'snooze_wake') {
      try {
        const payload: SnoozePayload = JSON.parse(job.payload);
        // Unsnooze directly via DB (avoids needing full Thread object)
        const { getDb } = await import('../db');
        const db = await getDb();
        await db.execute(
          'UPDATE threads SET snoozed_until = NULL, snooze_label = NULL WHERE id = ?',
          [payload.threadId]
        );
        await markFired(job.id);
      } catch (err) {
        await markFailed(job.id, err instanceof Error ? err.message : String(err));
      }
    } else if (job.jobType === 'reminder_fire') {
      try {
        const payload: ReminderPayload = JSON.parse(job.payload);
        showToast(`Reminder: ${payload.message || 'Check thread'}`, 6000);
        await markFired(job.id);
      } catch (err) {
        await markFailed(job.id, err instanceof Error ? err.message : String(err));
      }
    }
  }
}

export function startScheduledJobDispatch(getAccount: () => Account | null, sendFn: SendFn) {
  // Run immediately (catch-up) then every 30s
  dispatchDueJobs(getAccount, sendFn);
  setInterval(() => dispatchDueJobs(getAccount, sendFn), 30_000);

  // Also fire on window focus (Tauri only)
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) dispatchDueJobs(getAccount, sendFn);
      });
    });
  }
}
