/**
 * keyboard.ts — Keyboard shortcut handler as a Solid onMount effect.
 * Reads store reactively; no DOM queries for state.
 */
import { onMount, onCleanup } from 'solid-js';
import { appState, selectThread, switchView, toggleBulkSelect, clearBulkSelection, openCompose, setSearchQuery } from './store';
import { filteredThreads, selectedThread } from './store';
import { doArchive, doToggleStar, doMarkUnread, doMute, doSetAside, bulkArchive, bulkTrash } from './actions';
import { syncAndRender } from './sync';
import { popUndo } from '../undoStack';
import type { ViewName } from './store';

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

export function useKeyboardShortcuts() {
  let gPending = false;
  let gTimeout: ReturnType<typeof setTimeout> | null = null;

  const handleKeydown = (e: KeyboardEvent) => {
    // Don't intercept when typing in inputs
    if (isInputFocused()) {
      if (e.key === 'Escape') {
        (document.activeElement as HTMLElement)?.blur();
      }
      return;
    }

    const threads = filteredThreads();
    const current = selectedThread();
    const key = e.key;
    const meta = e.metaKey || e.ctrlKey;

    // 'g' prefix shortcuts (gmail-style)
    if (gPending) {
      gPending = false;
      if (gTimeout) { clearTimeout(gTimeout); gTimeout = null; }
      const viewMap: Record<string, ViewName> = {
        i: 'Inbox', s: 'Starred', t: 'Trash', d: 'Drafts', e: 'Sent',
        n: 'Snoozed', a: 'Archive', b: 'SetAside',
      };
      if (viewMap[key]) {
        switchView(viewMap[key]);
        e.preventDefault();
      }
      return;
    }

    if (key === 'g' && !meta) {
      gPending = true;
      gTimeout = setTimeout(() => { gPending = false; }, 1000);
      return;
    }

    // Navigation
    if (key === 'j' || key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1, threads);
      return;
    }
    if (key === 'k' || key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1, threads);
      return;
    }

    // Open thread
    if (key === 'Enter' || key === 'o') {
      if (appState.selectedThreadId && !current) {
        // Already selected as nav highlight, open it
        return;
      }
      if (appState.selectedThreadId) {
        selectThread(appState.selectedThreadId);
      }
      return;
    }

    // Close reader / cancel bulk
    if (key === 'Escape') {
      if (appState.bulkMode) {
        clearBulkSelection();
        return;
      }
      if (current) {
        selectThread(null);
        return;
      }
    }

    // Compose
    if (key === 'c' && !meta) {
      openCompose('new');
      e.preventDefault();
      return;
    }

    // Reply
    if (key === 'r' && !meta && current) {
      openCompose('reply', { to: current.senderEmail, subject: `Re: ${current.subject}`, threadId: current.id });
      e.preventDefault();
      return;
    }

    // Forward
    if (key === 'f' && !meta && current) {
      openCompose('forward', { subject: `Fwd: ${current.subject}`, threadId: current.id });
      e.preventDefault();
      return;
    }

    // Search
    if (key === '/' && !meta) {
      e.preventDefault();
      const searchInput = document.getElementById('search') as HTMLInputElement | null;
      searchInput?.focus();
      return;
    }

    // Archive
    if (key === 'e' && !meta) {
      if (appState.bulkMode) {
        bulkArchive();
      } else if (current) {
        doArchive(current);
        selectThread(null);
      }
      return;
    }

    // Trash
    if (key === '#' || (key === 'Backspace' && !meta)) {
      if (appState.bulkMode) {
        bulkTrash();
      }
      return;
    }

    // Star
    if (key === 's' && !meta) {
      if (current) {
        doToggleStar(current);
      }
      return;
    }

    // Mark unread
    if (key === 'u' && !meta) {
      if (current) {
        doMarkUnread(current);
      }
      return;
    }

    // Mute
    if (key === 'm' && !meta) {
      if (current) {
        doMute(current);
        selectThread(null);
      }
      return;
    }

    // Set aside
    if (key === 'v' && !meta) {
      if (current) {
        doSetAside(current);
        selectThread(null);
      }
      return;
    }

    // Bulk select
    if (key === 'x' && !meta) {
      if (appState.selectedThreadId) {
        toggleBulkSelect(appState.selectedThreadId);
      }
      return;
    }

    // Undo
    if (key === 'z' && meta) {
      popUndo();
      return;
    }

    // Sync
    if (key === 'r' && meta) {
      e.preventDefault();
      syncAndRender();
      return;
    }

    // Clear search
    if (key === 'Escape' && appState.searchQuery) {
      setSearchQuery('');
      return;
    }
  };

  function moveSelection(direction: 1 | -1, _threads: import('../store').Thread[]) {
    // Use DOM-based navigation: only rows with data-id are individual navigable threads
    const rows = Array.from(document.querySelectorAll('.thread-row[data-id]'));
    const ids = rows.map(r => (r as HTMLElement).dataset.id!);
    if (ids.length === 0) return;
    const cur = appState.selectedThreadId ? ids.indexOf(appState.selectedThreadId) : -1;
    let next: number;
    if (direction === 1) {
      next = cur < ids.length - 1 ? cur + 1 : cur === -1 ? 0 : cur;
    } else {
      next = cur > 0 ? cur - 1 : 0;
    }
    selectThread(ids[next]);
  }

  onMount(() => document.addEventListener('keydown', handleKeydown));
  onCleanup(() => document.removeEventListener('keydown', handleKeydown));
}
