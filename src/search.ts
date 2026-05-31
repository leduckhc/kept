import type { Thread } from './gmail';
import { state } from './state';
import { esc } from './helpers';

let _active = false;
let _query = '';
let _dismissFn: (() => void) | null = null;

export function isSearchActive(): boolean { return _active; }
export function getSearchQuery(): string { return _query; }

export interface SearchDeps {
  renderInbox: () => void;
  openThread: (t: Thread) => void;
}

export function showSearchBar(deps: SearchDeps) {
  if (_active) {
    const input = document.getElementById('search-bar-input') as HTMLInputElement | null;
    if (input) { input.focus(); input.select(); }
    return;
  }

  _active = true;
  _query = '';

  const inbox = document.getElementById('inbox');
  if (!inbox) return;

  const bar = document.createElement('div');
  bar.id = 'search-bar';
  bar.className = 'search-bar';
  bar.innerHTML = `
    <span class="search-icon">🔍</span>
    <input class="search-bar-input" id="search-bar-input" type="text"
           placeholder="Search emails…" autocomplete="off" spellcheck="false" />
    <span class="search-count" id="search-count"></span>
    <button class="search-close" id="search-close" aria-label="Close search">✕</button>
  `;

  inbox.prepend(bar);

  const input = bar.querySelector<HTMLInputElement>('#search-bar-input')!;

  function dismiss() {
    if (!_active) return;
    _active = false;
    _query = '';
    _dismissFn = null;
    bar.remove();
    deps.renderInbox();
  }

  _dismissFn = dismiss;

  function applyFilter() {
    _query = input.value;

    // Save cursor so we can restore after re-render moves the bar
    const selStart = input.selectionStart;
    const selEnd = input.selectionEnd;

    deps.renderInbox();

    // renderInbox wipes #inbox — bar is re-prepended by renderInbox itself (see threadList.ts).
    // Restore focus + cursor if the input is back in DOM.
    const restoredInput = document.getElementById('search-bar-input') as HTMLInputElement | null;
    if (restoredInput) {
      restoredInput.focus();
      if (selStart !== null && selEnd !== null) {
        restoredInput.setSelectionRange(selStart, selEnd);
      }
    }

    // Update result count
    const results = getFilteredThreads(state.threads);
    const countNode = document.getElementById('search-count');
    if (countNode) {
      countNode.textContent = _query.trim()
        ? `${results.length} result${results.length !== 1 ? 's' : ''}`
        : '';
    }
  }

  input.addEventListener('input', applyFilter);

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = document.querySelector<HTMLElement>('.thread-row.is-selected') ??
                  document.querySelector<HTMLElement>('.thread-row');
      if (sel) sel.click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelectionInResults(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelectionInResults(-1);
    }
  });

  bar.querySelector('#search-close')!.addEventListener('click', dismiss);

  input.focus();
}

function moveSelectionInResults(direction: 1 | -1) {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.thread-row'));
  if (!rows.length) return;
  const cur = rows.findIndex(r => r.classList.contains('is-selected'));
  let next: number;
  if (direction === 1) {
    next = cur < rows.length - 1 ? cur + 1 : cur === -1 ? 0 : cur;
  } else {
    next = cur > 0 ? cur - 1 : 0;
  }
  rows.forEach(r => r.classList.remove('is-selected'));
  rows[next]?.classList.add('is-selected');
  rows[next]?.scrollIntoView({ block: 'nearest' });
  const id = rows[next]?.dataset.id;
  if (id) state.selectedThreadId = id;
}

export function dismissSearchBar() {
  if (_dismissFn) _dismissFn();
}

export function getFilteredThreads(threads: Thread[]): Thread[] {
  const q = _query.trim().toLowerCase();
  if (!_active || !q) return threads;

  if (q.startsWith('from:')) {
    const val = q.slice(5).trim();
    return threads.filter(t =>
      t.senderName.toLowerCase().includes(val) ||
      t.senderEmail.toLowerCase().includes(val)
    );
  }

  if (q.startsWith('to:')) {
    const val = q.slice(3).trim();
    return threads.filter(t => t.snippet.toLowerCase().includes(val));
  }

  if (q.startsWith('subject:')) {
    const val = q.slice(8).trim();
    return threads.filter(t => t.subject.toLowerCase().includes(val));
  }

  return threads.filter(t =>
    t.subject.toLowerCase().includes(q) ||
    t.senderName.toLowerCase().includes(q) ||
    t.senderEmail.toLowerCase().includes(q) ||
    t.snippet.toLowerCase().includes(q)
  );
}

export function highlightText(text: string, query: string): string {
  let term = query.trim().toLowerCase();
  if (!term) return esc(text);

  if (term.startsWith('from:')) term = term.slice(5).trim();
  else if (term.startsWith('to:')) term = term.slice(3).trim();
  else if (term.startsWith('subject:')) term = term.slice(8).trim();

  if (!term) return esc(text);

  const idx = text.toLowerCase().indexOf(term);
  if (idx === -1) return esc(text);

  return (
    esc(text.slice(0, idx)) +
    `<mark class="search-highlight">${esc(text.slice(idx, idx + term.length))}</mark>` +
    esc(text.slice(idx + term.length))
  );
}
