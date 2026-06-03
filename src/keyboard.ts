import { type Thread } from './gmail';
import { type ViewName, state } from './state';
import { type ActionDeps } from './actions';
import { popUndo } from './undoStack';
import { showToast } from './toasts';
import { dismissSearchBar, isSearchActive } from './search';

export interface KeyboardDeps {
  renderInbox: () => void;
  openThread: (t: Thread) => void;
  openSearchBar: () => void;
  openThreadWithReply: (t: Thread) => void;
  openComposeNew: (subject?: string) => void;
  openComposeForward: (subject: string, quotedText?: string) => void;
  switchView: (view: ViewName) => void;
  toggleBulkSelection: (id: string) => void;
  removeBulkBar: () => void;
  exitBulkMode: () => void;
  updateBulkBar: () => void;
  renderCommandPalette: () => void;
  openSnippetPicker: (ta: HTMLElement | null) => void;
  getActionDeps: () => ActionDeps;
  doArchive: (t: Thread, row: HTMLElement, deps: ActionDeps) => Promise<void>;
  doToggleStar: (t: Thread, row: HTMLElement) => Promise<void>;
  doMarkUnread: (t: Thread, row: HTMLElement) => Promise<void>;
  doMute: (t: Thread, row: HTMLElement, deps: ActionDeps) => Promise<void>;
  syncAndRender: () => void;
}

export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

export function getVisibleThreadIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.thread-row'))
    .map(r => r.dataset.id!)
    .filter(Boolean);
}

export function selectThread(id: string | null) {
  document.querySelectorAll<HTMLElement>('.thread-row.is-selected')
    .forEach(r => r.classList.remove('is-selected'));
  state.selectedThreadId = id;
  if (!id) return;
  const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
  if (row) {
    row.classList.add('is-selected');
    row.scrollIntoView({ block: 'nearest' });
  }
}

export function moveSelection(direction: 1 | -1) {
  const ids = getVisibleThreadIds();
  if (ids.length === 0) return;
  const cur = state.selectedThreadId ? ids.indexOf(state.selectedThreadId) : -1;
  let next: number;
  if (direction === 1) {
    next = cur < ids.length - 1 ? cur + 1 : cur === -1 ? 0 : cur;
  } else {
    next = cur > 0 ? cur - 1 : 0;
  }
  selectThread(ids[next]);
}

export function showCheatSheet() {
  if (document.getElementById('kb-cheatsheet')) {
    document.getElementById('kb-cheatsheet')!.remove();
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'kb-cheatsheet';
  overlay.innerHTML = `
    <div class="kb-modal">
      <div class="kb-modal-header">Keyboard Shortcuts</div>
      <div class="kb-grid">
        <div class="kb-category">
          <div class="kb-cat-title">Navigation</div>
          <table class="kb-table">
            <tr><td><kbd class="kb-key">j</kbd> <kbd class="kb-key">k</kbd></td><td>Navigate threads (+ switch in reader)</td></tr>
            <tr><td><kbd class="kb-key">o</kbd> <kbd class="kb-key">Enter</kbd></td><td>Open thread</td></tr>
            <tr><td><kbd class="kb-key">Escape</kbd></td><td>Back to list</td></tr>
            <tr><td><kbd class="kb-key">g</kbd> <kbd class="kb-key">i</kbd></td><td>Go to Inbox</td></tr>
            <tr><td><kbd class="kb-key">g</kbd> <kbd class="kb-key">s</kbd></td><td>Go to Starred</td></tr>
            <tr><td><kbd class="kb-key">g</kbd> <kbd class="kb-key">d</kbd></td><td>Go to Drafts</td></tr>
            <tr><td><kbd class="kb-key">n</kbd> <kbd class="kb-key">p</kbd></td><td>Next/prev message</td></tr>
            <tr><td><kbd class="kb-key">Tab</kbd> <kbd class="kb-key">⇧Tab</kbd></td><td>Cycle views</td></tr>
          </table>
        </div>
        <div class="kb-category">
          <div class="kb-cat-title">Actions</div>
          <table class="kb-table">
            <tr><td><kbd class="kb-key">e</kbd></td><td>Archive</td></tr>
            <tr><td><kbd class="kb-key">#</kbd></td><td>Delete / Trash</td></tr>
            <tr><td><kbd class="kb-key">r</kbd></td><td>Reply</td></tr>
            <tr><td><kbd class="kb-key">f</kbd></td><td>Forward</td></tr>
            <tr><td><kbd class="kb-key">x</kbd></td><td>Select / bulk toggle</td></tr>
            <tr><td><kbd class="kb-key">/</kbd></td><td>Focus search</td></tr>
            <tr><td><kbd class="kb-key">Space</kbd> <kbd class="kb-key">⇧Space</kbd></td><td>Scroll reader</td></tr>
          </table>
        </div>
        <div class="kb-category">
          <div class="kb-cat-title">Commands</div>
          <table class="kb-table">
            <tr><td><kbd class="kb-key">⌘K</kbd></td><td>Command palette</td></tr>
            <tr><td><kbd class="kb-key">⌘⇧N</kbd></td><td>Compose new</td></tr>
            <tr><td><kbd class="kb-key">?</kbd></td><td>This shortcut help</td></tr>
          </table>
        </div>
      </div>
      <div class="kb-dismiss-hint">Press <kbd class="kb-key">Esc</kbd> or <kbd class="kb-key">?</kbd> to close</div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

export async function openThreadWithReply(t: Thread, openThread: (t: Thread) => Promise<void> | void) {
  await openThread(t);
  const btn = document.getElementById('btn-reply') as HTMLButtonElement | null;
  if (btn && btn.style.display !== 'none') btn.click();
}

export function scrollReaderMessage(direction: 1 | -1) {
  const readerBody = document.querySelector<HTMLElement>('.reader-body');
  if (!readerBody) return;
  const messages = readerBody.querySelectorAll<HTMLElement>('.thread-message');
  if (messages.length === 0) {
    readerBody.scrollBy({ top: direction * 300, behavior: 'smooth' });
    return;
  }
  const bodyRect = readerBody.getBoundingClientRect();
  let targetMsg: HTMLElement | null = null;
  if (direction === 1) {
    for (const msg of Array.from(messages)) {
      const r = msg.getBoundingClientRect();
      if (r.top > bodyRect.top + 8) { targetMsg = msg; break; }
    }
  } else {
    const arr = Array.from(messages).reverse();
    for (const msg of arr) {
      const r = msg.getBoundingClientRect();
      if (r.top < bodyRect.top - 8) { targetMsg = msg; break; }
    }
  }
  if (targetMsg) {
    targetMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    targetMsg.classList.remove('thread-message-collapsed');
  }
}

export function registerKeyboardShortcuts(deps: KeyboardDeps) {
  if (state.kbRegistered) return;
  state.kbRegistered = true;

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      deps.renderCommandPalette();
    }
    if (e.key === 'r' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      deps.syncAndRender();
    }
  });

  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !isInputFocused()) {
      e.preventDefault();
      const entry = popUndo();
      if (entry) {
        await entry.undoFn();
        showToast(`Undone: ${entry.label}`);
      }
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === ';' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      const isEditable = active && (active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true');
      deps.openSnippetPicker(isEditable ? active : null);
    }
  });

  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (isInputFocused()) return;

    if (state.gPending) {
      state.gPending = false;
      if (state.gTimeout !== null) { clearTimeout(state.gTimeout); state.gTimeout = null; }
      switch (e.key) {
        case 'i': e.preventDefault(); deps.switchView('Inbox'); return;
        case 's': e.preventDefault(); deps.switchView('Starred'); return;
        case 'd': e.preventDefault(); deps.switchView('Drafts'); return;
      }
    }

    switch (e.key) {
      case 'j':
      case 'ArrowDown': {
        e.preventDefault();
        const readerOpen = !!document.querySelector('.reader-fullpage');
        moveSelection(1);
        if (readerOpen && state.selectedThreadId) {
          const t = state.threads.find(x => x.id === state.selectedThreadId);
          if (t) deps.openThread(t);
        }
        break;
      }

      case 'k':
      case 'ArrowUp': {
        e.preventDefault();
        const readerOpen = !!document.querySelector('.reader-fullpage');
        moveSelection(-1);
        if (readerOpen && state.selectedThreadId) {
          const t = state.threads.find(x => x.id === state.selectedThreadId);
          if (t) deps.openThread(t);
        }
        break;
      }

      case 'Enter':
      case 'o': {
        if (!state.selectedThreadId) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (t) deps.openThread(t);
        break;
      }

      case 'e': {
        const readerEl = document.querySelector<HTMLElement>('.reader-fullpage');
        if (readerEl) {
          document.getElementById('btn-archive-reader')?.click();
          break;
        }
        if (!state.selectedThreadId || !state.account) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (!t) break;
        const ids = getVisibleThreadIds();
        const idx = ids.indexOf(state.selectedThreadId);
        const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) await deps.doArchive(t, row, deps.getActionDeps());
        selectThread(nextId);
        break;
      }

      case '#': {
        if (!state.selectedThreadId || !state.account) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (!t) break;
        const ids = getVisibleThreadIds();
        const idx = ids.indexOf(state.selectedThreadId);
        const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) await deps.doArchive(t, row, deps.getActionDeps());
        selectThread(nextId);
        break;
      }

      case 'x': {
        if (!state.selectedThreadId) break;
        if (!state.bulkMode) state.bulkMode = true;
        deps.toggleBulkSelection(state.selectedThreadId);
        if (state.selectedIds.size === 0) { state.bulkMode = false; deps.removeBulkBar(); deps.renderInbox(); }
        break;
      }

      case 's': {
        if (!state.selectedThreadId || !state.account) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (!t) break;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) await deps.doToggleStar(t, row);
        break;
      }



      case 'U': {
        if (!e.shiftKey) break;
        if (!state.selectedThreadId || !state.account) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (!t) break;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) await deps.doMarkUnread(t, row);
        break;
      }

      case 'm': {
        if (!state.selectedThreadId || !state.account) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (!t) break;
        const ids = getVisibleThreadIds();
        const idx = ids.indexOf(state.selectedThreadId);
        const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) await deps.doMute(t, row, deps.getActionDeps());
        selectThread(nextId);
        break;
      }

      case 'r': {
        if (!state.selectedThreadId) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (t) deps.openThreadWithReply(t);
        break;
      }

      case 'f': {
        const readerSubjectEl = document.querySelector<HTMLElement>('.reader-subject');
        const readerSubject = readerSubjectEl?.textContent ?? '';
        const selectedThread = state.selectedThreadId ? state.threads.find(x => x.id === state.selectedThreadId) : null;
        const baseSubject = readerSubject || selectedThread?.subject || '';
        const fwdSubject = baseSubject.startsWith('Fwd:') ? baseSubject : baseSubject ? `Fwd: ${baseSubject}` : '';
        // Grab last message text from reader if open
        let quotedText = '';
        try {
          const msgs = document.querySelectorAll('.msg-body');
          if (msgs.length > 0) quotedText = (msgs[msgs.length - 1] as HTMLElement).innerText?.slice(0, 2000) ?? '';
        } catch { /* */ }
        deps.openComposeForward(fwdSubject, quotedText);
        break;
      }

      case 'u': {
        const readerEl = document.querySelector<HTMLElement>('.reader-fullpage');
        if (readerEl) {
          readerEl.remove();
          document.getElementById('app-shell')?.classList.remove('reader-open');
        }
        break;
      }

      case 'n':
        scrollReaderMessage(1);
        break;

      case 'p':
        scrollReaderMessage(-1);
        break;

      case ' ': {
        const readerBody = document.querySelector<HTMLElement>('.reader-body');
        if (!readerBody) break;
        e.preventDefault();
        readerBody.scrollBy({ top: e.shiftKey ? -300 : 300, behavior: 'smooth' });
        break;
      }

      case 'Tab': {
        e.preventDefault();
        const viewOrder: ViewName[] = ['Inbox', 'Snoozed', 'Sent', 'Drafts', 'Starred', 'Scheduled'];
        const curIdx = viewOrder.indexOf(state.currentView);
        const nextIdx = e.shiftKey
          ? (curIdx - 1 + viewOrder.length) % viewOrder.length
          : (curIdx + 1) % viewOrder.length;
        deps.switchView(viewOrder[nextIdx]);
        break;
      }

      case '/': {
        e.preventDefault();
        deps.openSearchBar();
        break;
      }

      case 'g': {
        e.preventDefault();
        state.gPending = true;
        if (state.gTimeout !== null) clearTimeout(state.gTimeout);
        state.gTimeout = setTimeout(() => { state.gPending = false; state.gTimeout = null; }, 1000);
        break;
      }

      case '?': {
        e.preventDefault();
        showCheatSheet();
        break;
      }

      case 'a':
      case 'A': {
        if (!(e.ctrlKey || e.metaKey)) break;
        e.preventDefault();
        if (!state.bulkMode) state.bulkMode = true;
        getVisibleThreadIds().forEach(id => state.selectedIds.add(id));
        deps.renderInbox();
        deps.updateBulkBar();
        break;
      }

      case 'Escape': {
        if (isSearchActive()) { dismissSearchBar(); break; }
        if (state.bulkMode) { deps.exitBulkMode(); break; }
        const sheet = document.getElementById('kb-cheatsheet');
        if (sheet) { sheet.remove(); break; }
        const readerEl = document.querySelector<HTMLElement>('.reader-fullpage');
        if (readerEl) {
          readerEl.remove();
          document.getElementById('app-shell')?.classList.remove('reader-open');
        }
        break;
      }
    }
  });
}
