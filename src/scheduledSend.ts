// scheduledSend.ts — Scheduled send queue backed by localStorage
// Uses localStorage since scheduled sends are created in the frontend
// and need to survive app restarts without a Tauri-side background daemon.

export interface ScheduledEmail {
  id: string;
  accountId: string;
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  scheduledAt: number; // unix ms
  threadId?: string;
  inReplyTo?: string;
  cc?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: string }>; // base64
  createdAt: number;
}

const STORAGE_KEY = 'kept-scheduled-sends';

export function loadScheduled(): ScheduledEmail[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveAll(items: ScheduledEmail[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function scheduleEmail(email: Omit<ScheduledEmail, 'id' | 'createdAt'>): ScheduledEmail {
  const item: ScheduledEmail = {
    ...email,
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const all = loadScheduled();
  all.push(item);
  saveAll(all);
  return item;
}

export function cancelScheduled(id: string): void {
  const all = loadScheduled().filter(e => e.id !== id);
  saveAll(all);
}

export function removeScheduled(id: string): void {
  cancelScheduled(id);
}

export function getDueEmails(): ScheduledEmail[] {
  const now = Date.now();
  return loadScheduled().filter(e => e.scheduledAt <= now);
}

export function getScheduledCount(): number {
  return loadScheduled().length;
}

// ── Dispatch timer ──────────────────────────────────────────

import { getCurrentWindow } from '@tauri-apps/api/window';
import { showToast } from './toasts';
import type { Account } from './auth';
/** Set of thread IDs currently being sent (prevents duplicate dispatch) */
const sendingIds = new Set<string>();

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

const failedIds = new Set<string>();

async function dispatchDue(getAccount: () => Account | null, sendFn: SendFn) {
  const due = getDueEmails();
  if (due.length === 0) return;

  const account = getAccount();
  if (!account) return;

  for (const item of due) {
    if (sendingIds.has(item.id)) continue;
    sendingIds.add(item.id);

    try {
      const attachments = item.attachments?.map(a => ({
        filename: a.filename,
        mimeType: a.mimeType,
        data: Uint8Array.from(atob(a.data), c => c.charCodeAt(0)),
      }));

      await sendFn(account, {
        to: item.to,
        cc: item.cc,
        subject: item.subject,
        body: item.body,
        htmlBody: item.htmlBody,
        threadId: item.threadId,
        inReplyTo: item.inReplyTo,
        attachments,
      });

      removeScheduled(item.id);
      sendingIds.delete(item.id);
      failedIds.delete(item.id);
      showToast(`Scheduled email to ${item.to} sent`);
    } catch (err) {
      sendingIds.delete(item.id);
      if (!failedIds.has(item.id)) {
        failedIds.add(item.id);
        showToast(`Scheduled send failed: ${err instanceof Error ? err.message : String(err)}`, 4000);
      }
    }
  }
}

export function startScheduledSendDispatch(getAccount: () => Account | null, sendFn: SendFn) {
  // Run immediately then every 30s
  dispatchDue(getAccount, sendFn);
  setInterval(() => dispatchDue(getAccount, sendFn), 30_000);

  // Also fire on window focus (Tauri only)
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) dispatchDue(getAccount, sendFn);
    });
  }
}
