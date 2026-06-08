/**
 * keyboard.ts — Keyboard shortcut handler as a Solid onMount effect.
 * Reads store reactively; no DOM queries for state.
 */
import { onMount, onCleanup } from 'solid-js';
import { appState, selectThread, focusThread, switchView, toggleBulkSelect, clearBulkSelection, openCompose, setSearchQuery, setCategoryFilter, setSenderFilter, setDomainFilter } from './store';
import { filteredThreads, selectedThread } from './store';
import { bulkArchive, bulkTrash } from './actions';
import { getActionsForView } from './viewActions';
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
    // target = thread to act on (focused via keyboard OR opened in reader)
    const focusedId = appState.focusedThreadId;
    const target = current ?? (focusedId ? threads.find(t => t.id === focusedId) ?? null : null);
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
      if (appState.focusedThreadId) {
        selectThread(appState.focusedThreadId);
      }
      return;
    }

    // Close reader / cancel bulk / go back from filter / go back to Inbox from view
    if (key === 'Escape') {
      if (appState.bulkMode) {
        clearBulkSelection();
        return;
      }
      if (current) {
        selectThread(null);
        return;
      }
      if (appState.categoryFilter || appState.senderFilter || appState.domainFilter) {
        setCategoryFilter(null);
        setSenderFilter(null);
        setDomainFilter(null);
        return;
      }
      if (appState.currentView !== 'Inbox') {
        switchView('Inbox');
        return;
      }
      if (appState.focusedThreadId) {
        focusThread(null);
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
    if (key === 'r' && !meta && target) {
      openCompose('reply', { to: target.senderEmail, subject: `Re: ${target.subject}`, threadId: target.id });
      e.preventDefault();
      return;
    }

    // Forward
    if (key === 'f' && !meta && target) {
      openCompose('forward', { subject: `Fwd: ${target.subject}`, threadId: target.id });
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
      } else if (target) {
        // View-aware: only fire if archive is valid for this view
        const actions = getActionsForView(appState.currentView);
        const archiveAction = actions.find(a => a.id === 'archive');
        if (archiveAction) {
          archiveAction.handler(target);
          if (archiveAction.exitsReader) selectThread(null);
        }
      }
      return;
    }

    // Trash
    if (key === '#' || (key === 'Backspace' && !meta)) {
      if (appState.bulkMode) {
        bulkTrash();
      } else if (target) {
        const actions = getActionsForView(appState.currentView);
        const trashAction = actions.find(a => a.id === 'trash');
        if (trashAction) {
          trashAction.handler(target);
          if (trashAction.exitsReader) selectThread(null);
        }
      }
      return;
    }

    // View-aware single-key actions (s, u, v, h, etc.)
    if (!meta && target) {
      const actions = getActionsForView(appState.currentView);
      const matchedAction = actions.find(a => a.key === key);
      if (matchedAction) {
        matchedAction.handler(target);
        if (matchedAction.exitsReader) selectThread(null);
        return;
      }
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
    const cur = appState.focusedThreadId ? ids.indexOf(appState.focusedThreadId) : -1;
    let next: number;
    if (direction === 1) {
      next = cur < ids.length - 1 ? cur + 1 : cur === -1 ? 0 : cur;
    } else {
      next = cur > 0 ? cur - 1 : 0;
    }
    focusThread(ids[next]);
    // Scroll into view and mark keyboard-nav mode
    document.body.classList.add('keyboard-nav');
    const row = rows[next] as HTMLElement;
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    // Remove keyboard-nav mode when mouse moves (restore hover actions)
    const onMouseMove = () => document.body.classList.remove('keyboard-nav');
    document.addEventListener('mousemove', onMouseMove);
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('mousemove', onMouseMove);
    });
  });
}
