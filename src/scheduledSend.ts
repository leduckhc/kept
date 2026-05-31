// scheduledSend.ts — Scheduled send queue backed by localStorage
// Uses localStorage since scheduled sends are created in the frontend
// and need to survive app restarts without a Tauri-side background daemon.

export interface ScheduledEmail {
  id: string;
  accountId: string;
  to: string;
  subject: string;
  body: string;
  scheduledAt: number; // unix ms
  threadId?: string;
  inReplyTo?: string;
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
