// notifications.ts — OS notification + tray badge helpers
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';

const isTauri = () => '__TAURI_INTERNALS__' in window;

/** Ensure permission is granted; returns true if notifications are allowed. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === 'granted';
    }
    return granted;
  } catch {
    return false;
  }
}

/** Fire up to 5 notifications for newly-arrived threads. */
export async function notifyNewThreads(
  newThreads: Array<{ senderName: string; subject: string }>
): Promise<void> {
  if (!isTauri()) return;
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  const toNotify = newThreads.slice(0, 5);
  for (const t of toNotify) {
    try {
      sendNotification({
        title: t.senderName || 'New message',
        body: t.subject || '(no subject)',
      });
    } catch {
      // Non-fatal: silently ignore
    }
  }
}

/** Update the tray tooltip and macOS dock badge with the unread count. */
export async function updateBadge(unreadCount: number): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('update_unread_badge', { count: unreadCount });
  } catch {
    // Non-fatal
  }
}
