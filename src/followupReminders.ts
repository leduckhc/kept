// followupReminders.ts — Follow-up reminder queue backed by localStorage

export interface FollowupReminder {
  id: string;
  threadId: string;    // Gmail thread ID (empty for new compose emails)
  subject: string;
  sentTo: string;
  remindAfter: string; // ISO timestamp
  createdAt: string;   // ISO timestamp
  notified?: boolean;  // true once overdue toast has been shown
}

const STORAGE_KEY = 'kept-followup-reminders';

export function loadReminders(): FollowupReminder[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveAll(items: FollowupReminder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function saveReminder(r: Omit<FollowupReminder, 'id' | 'createdAt'>): FollowupReminder {
  const item: FollowupReminder = {
    ...r,
    id: `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const all = loadReminders();
  // Replace any existing reminder for the same thread
  const filtered = r.threadId ? all.filter(x => x.threadId !== r.threadId) : all;
  filtered.push(item);
  saveAll(filtered);
  return item;
}

export function dismissReminder(id: string): void {
  saveAll(loadReminders().filter(r => r.id !== id));
}

export function dismissReminderForThread(threadId: string): void {
  if (!threadId) return;
  saveAll(loadReminders().filter(r => r.threadId !== threadId));
}

export function getOverdueReminders(): FollowupReminder[] {
  const now = new Date().toISOString();
  return loadReminders().filter(r => r.remindAfter <= now && !r.notified);
}

export function markReminderNotified(id: string): void {
  const all = loadReminders().map(r => r.id === id ? { ...r, notified: true } : r);
  saveAll(all);
}

export function getActiveReminderThreadIds(): Set<string> {
  return new Set(loadReminders().filter(r => r.threadId).map(r => r.threadId));
}
