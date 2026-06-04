// followupReminders.ts — Follow-up reminder system
// "Remind if no reply" — local-only (localStorage), auto-cancels on reply

export interface FollowupReminder {
  id: string;
  threadId: string;    // Gmail thread ID (empty for new compose emails)
  subject: string;
  sentTo: string;
  remindAfter: string; // ISO timestamp
  createdAt: string;   // ISO timestamp
  messageCountAtSet?: number; // snapshot — used to detect replies
  notified?: boolean;  // true once overdue has been processed
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
  // Replace any existing reminder for the same thread (one reminder per thread)
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
  return new Set(loadReminders().filter(r => r.threadId && !r.notified).map(r => r.threadId));
}

/** Get pending (not yet overdue) reminders for the Reminders view */
export function getPendingReminders(): FollowupReminder[] {
  const now = new Date().toISOString();
  return loadReminders().filter(r => !r.notified && r.remindAfter > now);
}

/** Get all active reminders (pending + overdue-but-not-dismissed) */
export function getAllActiveReminders(): FollowupReminder[] {
  return loadReminders().filter(r => !r.notified);
}

/** Check if a reply arrived: if current messageCount > messageCountAtSet, auto-cancel */
export function autoCancelIfReplied(threadId: string, currentMessageCount: number): boolean {
  if (!threadId) return false;
  const all = loadReminders();
  const reminder = all.find(r => r.threadId === threadId && !r.notified);
  if (!reminder) return false;
  if (reminder.messageCountAtSet !== undefined && currentMessageCount > reminder.messageCountAtSet) {
    saveAll(all.filter(r => r.id !== reminder.id));
    return true;
  }
  return false;
}

/** Reminder presets (reused from snooze pattern) */
export function reminderPresets(): Array<{ label: string; days: number }> {
  return [
    { label: 'Tomorrow', days: 1 },
    { label: 'In 3 days', days: 3 },
    { label: 'In 1 week', days: 7 },
    { label: 'In 2 weeks', days: 14 },
  ];
}
