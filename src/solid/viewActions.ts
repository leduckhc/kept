/**
 * viewActions.ts — Data-driven action descriptors per view.
 * Returns ordered arrays of actions to render in the reader bar
 * and wire to keyboard shortcuts.
 */
import type { Thread } from '../store';
import type { ViewName } from './store';
import { appState } from './store';
import {
  doArchive, doTrash, doToggleStar, doMarkRead, doMarkUnread,
  doSetAside, doUnsetAside, doUnsnooze,
  doRestoreToInbox, doDeletePermanently, doMoveToInbox,
} from './actions';
import { icon } from '../icons';

// ── Types ───────────────────────────────────────────────────

export interface ActionDescriptor {
  id: string;
  title: string | (() => string);
  icon: string | (() => string);
  handler: (t: Thread) => void;
  /** Keyboard shortcut key (single char). Undefined = button-only. */
  key?: string;
  /** If true, handler is "destructive" — exits reader after action */
  exitsReader?: boolean;
}

// ── Action factory helpers ──────────────────────────────────

function archiveAction(): ActionDescriptor {
  return { id: 'archive', title: 'Archive', icon: icon.archive('16px'), handler: (t) => doArchive(t), key: 'e', exitsReader: true };
}

function trashAction(): ActionDescriptor {
  return { id: 'trash', title: 'Trash', icon: icon.trash('16px'), handler: (t) => doTrash(t), key: '#', exitsReader: true };
}

function starAction(): ActionDescriptor {
  return {
    id: 'star',
    get title() { return isStarred() ? 'Unstar' : 'Star'; },
    get icon() { return isStarred() ? icon.starFilled('16px') : icon.star('16px'); },
    handler: (t) => doToggleStar(t),
    key: 's',
  };
}

function unstarAction(): ActionDescriptor {
  return { id: 'unstar', title: 'Unstar', icon: icon.starFilled('16px'), handler: (t) => doToggleStar(t), key: 's' };
}

function snoozeAction(): ActionDescriptor {
  return { id: 'snooze', title: 'Snooze', icon: icon.snooze('16px'), handler: (_t) => { /* TODO: open snooze picker */ }, key: 'h' };
}

function setAsideAction(): ActionDescriptor {
  return { id: 'set-aside', title: 'Set Aside', icon: icon.bookmark('16px'), handler: (t) => doSetAside(t), key: 'v', exitsReader: true };
}

function markReadUnreadAction(): ActionDescriptor {
  return {
    id: 'mark-read-unread',
    get title() { return isUnread() ? 'Mark read' : 'Mark unread'; },
    get icon() { return isUnread() ? icon.markRead('16px') : icon.email('16px'); },
    handler: (t) => {
      if (t.isUnread) doMarkRead(t);
      else doMarkUnread(t);
    },
    key: 'u',
  };
}

function unsnoozeAction(): ActionDescriptor {
  return { id: 'unsnooze', title: 'Unsnooze', icon: icon.unsnooze('16px'), handler: (t) => doUnsnooze(t), exitsReader: true };
}

function moveToInboxAction(): ActionDescriptor {
  return { id: 'move-to-inbox', title: 'Move to Inbox', icon: icon.inbox('16px'), handler: (t) => doMoveToInbox(t), exitsReader: true };
}

function restoreToInboxAction(): ActionDescriptor {
  return { id: 'restore', title: 'Restore to Inbox', icon: icon.inbox('16px'), handler: (t) => doRestoreToInbox(t), exitsReader: true };
}

function deletePermanentlyAction(): ActionDescriptor {
  return { id: 'delete-permanently', title: 'Delete permanently', icon: icon.trash('16px'), handler: (t) => doDeletePermanently(t), exitsReader: true };
}

function unsetAsideAction(): ActionDescriptor {
  return { id: 'unset-aside', title: 'Move to Inbox', icon: icon.inbox('16px'), handler: (t) => doUnsetAside(t), exitsReader: true };
}

// ── Reactive helpers (read from store for reactive title/icon) ──

function isStarred(): boolean {
  const id = appState.selectedThreadId;
  if (!id) return false;
  const idx = appState.threads.findIndex(t => t.id === id);
  return idx >= 0 ? appState.threads[idx].isStarred : false;
}

function isUnread(): boolean {
  const id = appState.selectedThreadId;
  if (!id) return false;
  const idx = appState.threads.findIndex(t => t.id === id);
  return idx >= 0 ? appState.threads[idx].isUnread : false;
}

// ── Main export ─────────────────────────────────────────────

/**
 * Returns the ordered list of actions for a given view.
 * Call reactively in a createMemo to track view changes.
 */
export function getActionsForView(view: ViewName): ActionDescriptor[] {
  switch (view) {
    case 'Inbox':
      return [archiveAction(), trashAction(), starAction(), snoozeAction(), setAsideAction(), markReadUnreadAction()];

    case 'Snoozed':
      return [unsnoozeAction(), snoozeAction(), archiveAction(), trashAction(), starAction()];

    case 'SetAside':
      return [unsetAsideAction(), archiveAction(), trashAction(), starAction(), snoozeAction()];

    case 'Sent':
      return [archiveAction(), trashAction(), starAction()];

    case 'Drafts':
      return [trashAction()];

    case 'Starred':
      return [unstarAction(), archiveAction(), trashAction(), snoozeAction(), setAsideAction(), markReadUnreadAction()];

    case 'Scheduled':
      // Cancel send / reschedule not yet implemented
      return [];

    case 'Reminders':
      return [archiveAction(), trashAction(), starAction()];

    case 'Trash':
      return [restoreToInboxAction(), deletePermanentlyAction()];

    case 'Archive':
      return [moveToInboxAction(), trashAction(), starAction(), snoozeAction()];

    case 'Triage':
      // Triage has its own card-based UI with keyboard shortcuts
      return [archiveAction(), trashAction(), starAction(), snoozeAction(), setAsideAction()];

    default:
      return [archiveAction(), starAction()];
  }
}
