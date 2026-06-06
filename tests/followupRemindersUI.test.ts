/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveReminder,
  loadReminders,
  dismissReminder,
  getOverdueReminders,
  markReminderNotified,
  FollowupReminder,
} from '../src/followupReminders';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  length: 0,
  key: () => null,
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Helper: escape HTML (mirrors esc() in main.ts)
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Simulates the checkOverdueReminders logic from main.ts (lines 214-239)
// Extracted to test DOM behavior without importing the full app
function checkOverdueReminders(maxToasts = 3): void {
  const overdue = getOverdueReminders();
  if (overdue.length === 0) return;

  let toastCount = 0;
  overdue.forEach(r => {
    markReminderNotified(r.id);
    if (toastCount >= maxToasts) return; // Cap at maxToasts (bug fix)
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `🔔 No reply from <b>${esc(r.sentTo)}</b> — "${esc(r.subject)}" <a class="toast-dismiss">dismiss</a>`;
    toast.querySelector('.toast-dismiss')?.addEventListener('click', () => { dismissReminder(r.id); toast.remove(); });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
    toastCount++;
  });
}

// Simulates rendering the reminders view
function renderRemindersView(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'reminders-view';
  const reminders = loadReminders().filter(r => !r.notified);

  if (reminders.length === 0) {
    container.innerHTML = '<div class="empty-state">No follow-up reminders set</div>';
  } else {
    const now = new Date().toISOString();
    reminders.forEach(r => {
      const item = document.createElement('div');
      item.className = 'reminder-item';
      if (r.remindAfter <= now) {
        item.classList.add('reminder-overdue');
      }
      item.dataset.id = r.id;
      item.innerHTML = `
        <span class="reminder-subject">${esc(r.subject)}</span>
        <span class="reminder-sentto">${esc(r.sentTo)}</span>
        <button class="reminder-dismiss-btn">Dismiss</button>
      `;
      item.querySelector('.reminder-dismiss-btn')?.addEventListener('click', () => {
        dismissReminder(r.id);
        item.remove();
      });
      container.appendChild(item);
    });
  }

  document.body.appendChild(container);
  return container;
}

describe('Follow-up Reminders UI', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Reminders view: empty state renders correctly', () => {
    const view = renderRemindersView();

    const emptyState = view.querySelector('.empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState!.textContent).toBe('No follow-up reminders set');
    expect(view.querySelectorAll('.reminder-item')).toHaveLength(0);
  });

  it('Overdue items get .reminder-overdue class', () => {
    // Create a reminder that is already overdue (remindAfter in the past)
    saveReminder({
      threadId: 'thread-overdue',
      subject: 'Overdue task',
      sentTo: 'late@example.com',
      remindAfter: '2026-06-04T10:00:00Z', // yesterday
    });

    // Create a reminder that is NOT overdue (remindAfter in the future)
    saveReminder({
      threadId: 'thread-future',
      subject: 'Future task',
      sentTo: 'patient@example.com',
      remindAfter: '2026-06-10T10:00:00Z', // 5 days from now
    });

    const view = renderRemindersView();
    const items = view.querySelectorAll('.reminder-item');
    expect(items).toHaveLength(2);

    const overdueItem = view.querySelector('.reminder-overdue');
    expect(overdueItem).not.toBeNull();
    expect(overdueItem!.querySelector('.reminder-subject')!.textContent).toBe('Overdue task');

    // Future item should NOT have overdue class
    const futureItem = Array.from(items).find(el => !el.classList.contains('reminder-overdue'));
    expect(futureItem).not.toBeUndefined();
    expect(futureItem!.querySelector('.reminder-subject')!.textContent).toBe('Future task');
  });

  it('Dismiss button removes item from localStorage and DOM', () => {
    saveReminder({
      threadId: 'thread-dismiss',
      subject: 'To be dismissed',
      sentTo: 'dismiss@example.com',
      remindAfter: '2026-06-10T10:00:00Z',
    });

    const view = renderRemindersView();
    expect(view.querySelectorAll('.reminder-item')).toHaveLength(1);

    const dismissBtn = view.querySelector('.reminder-dismiss-btn') as HTMLButtonElement;
    dismissBtn.click();

    // DOM item should be removed
    expect(view.querySelectorAll('.reminder-item')).toHaveLength(0);
    // localStorage should be empty
    expect(loadReminders()).toHaveLength(0);
  });

  it('Toast appears with correct sender + subject text', () => {
    // Set an overdue reminder
    saveReminder({
      threadId: 'thread-toast',
      subject: 'Important question',
      sentTo: 'boss@company.com',
      remindAfter: '2026-06-04T08:00:00Z', // in the past
    });

    checkOverdueReminders();

    const toast = document.body.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast!.innerHTML).toContain('<b>boss@company.com</b>');
    expect(toast!.innerHTML).toContain('Important question');
    expect(toast!.textContent).toContain('No reply from');
  });

  it('Toast auto-dismisses after 8s (fake timers)', () => {
    saveReminder({
      threadId: 'thread-autohide',
      subject: 'Auto-dismiss test',
      sentTo: 'timer@example.com',
      remindAfter: '2026-06-04T08:00:00Z',
    });

    checkOverdueReminders();

    expect(document.body.querySelectorAll('.toast')).toHaveLength(1);

    // Advance 7.9s — toast still present
    vi.advanceTimersByTime(7900);
    expect(document.body.querySelectorAll('.toast')).toHaveLength(1);

    // Advance past 8s — toast removed
    vi.advanceTimersByTime(200);
    expect(document.body.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('Multiple overdue reminders capped at max 3 toasts (bug fix)', () => {
    // Create 5 overdue reminders
    for (let i = 0; i < 5; i++) {
      saveReminder({
        threadId: `thread-cap-${i}`,
        subject: `Subject ${i}`,
        sentTo: `user${i}@example.com`,
        remindAfter: '2026-06-03T08:00:00Z',
      });
    }

    checkOverdueReminders(3);

    const toasts = document.body.querySelectorAll('.toast');
    expect(toasts).toHaveLength(3); // Capped at 3, not 5
  });

  it('checkOverdueReminders marks reminders as notified', () => {
    saveReminder({
      threadId: 'thread-notify',
      subject: 'Mark notified',
      sentTo: 'mark@example.com',
      remindAfter: '2026-06-04T08:00:00Z',
    });

    // Before check — reminder is NOT notified
    const before = loadReminders();
    expect(before[0].notified).toBeFalsy();

    checkOverdueReminders();

    // After check — reminder IS notified
    const after = loadReminders();
    expect(after[0].notified).toBe(true);

    // Calling checkOverdueReminders again should not create new toasts
    checkOverdueReminders();
    const toasts = document.body.querySelectorAll('.toast');
    expect(toasts).toHaveLength(1); // Still only 1 from first call
  });
});
