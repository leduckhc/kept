import type { Thread } from './store';
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
    <button class="search-close" id="search-close" title="Close search" aria-label="Close search">✕</button>
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

// ── Date operator parsing (KPT-087) ──────────────────────

export interface DateConstraints {
  before: number | null; // unix ms (inclusive upper bound — end of day)
  after: number | null;  // unix ms (inclusive lower bound — start of day)
}

export interface ParsedDateQuery extends DateConstraints {
  textQuery: string; // remaining query after date operators are stripped
}

/**
 * Parse before:, after:, date: operators from a search query string.
 * Returns the date constraints and any remaining text query.
 */
export function parseDateOperators(query: string): ParsedDateQuery {
  let before: number | null = null;
  let after: number | null = null;
  let remaining = query;

  // Extract date: operator (exact day)
  const dateMatch = remaining.match(/\bdate:(\S+)/i);
  if (dateMatch) {
    remaining = remaining.replace(dateMatch[0], '').trim();
    const parsed = parseDateValue(dateMatch[1]);
    if (parsed) {
      after = startOfDay(parsed).getTime();
      before = endOfDay(parsed).getTime();
    }
  }

  // Extract before: operator
  const beforeMatch = remaining.match(/\bbefore:(\S+)/i);
  if (beforeMatch) {
    remaining = remaining.replace(beforeMatch[0], '').trim();
    const parsed = parseDateValue(beforeMatch[1]);
    if (parsed) {
      before = endOfDay(parsed).getTime();
    }
  }

  // Extract after: operator
  const afterMatch = remaining.match(/\bafter:(\S+)/i);
  if (afterMatch) {
    remaining = remaining.replace(afterMatch[0], '').trim();
    const parsed = parseDateValue(afterMatch[1]);
    if (parsed) {
      after = startOfDay(parsed).getTime();
    }
  }

  return { before, after, textQuery: remaining.trim() };
}

/**
 * Filter threads by date constraints (inclusive on both ends).
 */
export function filterByDate(threads: Thread[], constraints: DateConstraints): Thread[] {
  const { before: b, after: a } = constraints;
  if (b === null && a === null) return threads;
  return threads.filter(t => {
    if (a !== null && t.receivedAt < a) return false;
    if (b !== null && t.receivedAt > b) return false;
    return true;
  });
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function parseDateValue(val: string): Date | null {
  // Relative keywords
  const now = new Date();
  const lower = val.toLowerCase();

  if (lower === 'today') return now;
  if (lower === 'yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (lower === 'lastweek' || lower === 'last-week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }

  // YYYY-MM-DD
  const fullMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fullMatch) {
    const d = new Date(`${val}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM (treat as first day of month)
  const monthMatch = val.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const d = new Date(`${val}-01T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback: try Date.parse
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ── Main filter function ──────────────────────────────────

export function getFilteredThreads(threads: Thread[]): Thread[] {
  const q = _query.trim().toLowerCase();
  if (!_active || !q) return threads;

  // Parse date operators first
  const { before, after, textQuery } = parseDateOperators(q);
  const filtered = filterByDate(threads, { before, after });

  // If no remaining text query after date extraction, return date-filtered results
  const remaining = textQuery.trim();
  if (!remaining) return filtered;

  if (remaining.startsWith('from:')) {
    const val = remaining.slice(5).trim();
    return filtered.filter(t =>
      t.senderName.toLowerCase().includes(val) ||
      t.senderEmail.toLowerCase().includes(val)
    );
  }

  if (remaining.startsWith('to:')) {
    const val = remaining.slice(3).trim();
    return filtered.filter(t => t.snippet.toLowerCase().includes(val));
  }

  if (remaining.startsWith('subject:')) {
    const val = remaining.slice(8).trim();
    return filtered.filter(t => t.subject.toLowerCase().includes(val));
  }

  return filtered.filter(t =>
    t.subject.toLowerCase().includes(remaining) ||
    t.senderName.toLowerCase().includes(remaining) ||
    t.senderEmail.toLowerCase().includes(remaining) ||
    t.snippet.toLowerCase().includes(remaining)
  );
}

export function highlightText(text: string, query: string): string {
  let term = query.trim().toLowerCase();
  if (!term) return esc(text);

  // Strip date operators — they don't produce text highlights
  const { textQuery } = parseDateOperators(term);
  term = textQuery;

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
