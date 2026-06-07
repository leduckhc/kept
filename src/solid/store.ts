/**
 * Reactive application store using SolidJS signals and stores.
 * Replaces the imperative `state` object from state.ts.
 *
 * Key difference: mutations via setAppState() automatically trigger
 * fine-grained re-renders — no manual renderInbox()/updateUnifiedBar() needed.
 */
import { createMemo, createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { Thread } from '../store';
import type { Account } from '../auth';
import type { ViewName, LayoutMode } from '../state';

// ── Core reactive store ─────────────────────────────────────
export interface AppState {
  account: Account | null;
  accounts: Account[];
  unifiedMode: boolean;
  accountFilter: string | null;
  threads: Thread[];
  searchQuery: string;
  syncing: boolean;
  knownSenders: string[];
  currentView: ViewName;
  selectedThreadId: string | null;
  bulkMode: boolean;
  selectedIds: string[];  // Array for SolidJS store tracking (not Set)
  lastBulkSelectedId: string | null;
  layoutMode: LayoutMode;
  categoryFilter: string | null;
  senderFilter: string | null;
  domainFilter: string | null;
  groupedSenders: string[];
  groupedDomains: string[];
  vipSenders: string[];
  lastUsedAccountId: string | null;
}

// Everything in one createRoot so memos can track the store
const root = createRoot(() => {
  const [appState, setAppState] = createStore<AppState>({
    account: null,
    accounts: [],
    unifiedMode: true,
    accountFilter: null,
    threads: [],
    searchQuery: '',
    syncing: false,
    knownSenders: [],
    currentView: 'Inbox',
    selectedThreadId: null,
    bulkMode: false,
    selectedIds: [],
    lastBulkSelectedId: null,
    layoutMode: '2-pane',
    categoryFilter: null,
    senderFilter: null,
    domainFilter: null,
    groupedSenders: [],
    groupedDomains: [],
    vipSenders: [],
    lastUsedAccountId: null,
  });

  // ── Derived state (auto-recomputing memos) ──────────────────

  /** Currently selected thread object (or null) */
  const selectedThread = createMemo(() => {
    const id = appState.selectedThreadId;
    if (!id) return null;
    return appState.threads.find(t => t.id === id) ?? null;
  });

  /** Number of bulk-selected threads */
  const bulkCount = createMemo(() => appState.selectedIds.length);

  /** Whether bulk mode is active (any selection) */
  const isBulkMode = createMemo(() => appState.selectedIds.length > 0);

  /** Threads filtered by current view + search query */
  const filteredThreads = createMemo(() => {
    let threads = appState.threads;
    const view = appState.currentView;
    const query = appState.searchQuery.toLowerCase();

    // View filtering
    if (view === 'Starred') {
      threads = threads.filter(t => t.isStarred);
    } else if (view === 'Sent') {
      threads = threads.filter(t => t.label === 'SENT');
    } else if (view === 'Trash') {
      threads = threads.filter(t => t.isArchived);
    } else if (view === 'Snoozed') {
      threads = threads.filter(t => t.snoozedUntil !== null);
    } else if (view === 'SetAside') {
      threads = threads.filter(t => t.isSetAside);
    }

    // Category/sender/domain filter
    if (appState.categoryFilter) {
      threads = threads.filter(t => t.category === appState.categoryFilter);
    }
    if (appState.senderFilter) {
      threads = threads.filter(t => t.senderEmail === appState.senderFilter);
    }
    if (appState.domainFilter) {
      const domain = appState.domainFilter;
      threads = threads.filter(t => t.senderEmail.endsWith(`@${domain}`));
    }

    // Search filtering
    if (query) {
      threads = threads.filter(t =>
        t.subject.toLowerCase().includes(query) ||
        t.senderName.toLowerCase().includes(query) ||
        t.snippet.toLowerCase().includes(query)
      );
    }

    return threads;
  });

  return { appState, setAppState, selectedThread, bulkCount, isBulkMode, filteredThreads };
});

export const appState = root.appState;
export const setAppState = root.setAppState;
export const selectedThread = root.selectedThread;
export const bulkCount = root.bulkCount;
export const isBulkMode = root.isBulkMode;
export const filteredThreads = root.filteredThreads;

// ── Actions ─────────────────────────────────────────────────

export function selectThread(id: string | null) {
  setAppState('selectedThreadId', id);
  // Clear bulk when opening a thread
  if (id) {
    setAppState('bulkMode', false);
    setAppState('selectedIds', []);
  }
}

export function toggleBulkSelect(id: string) {
  const current = appState.selectedIds;
  const idx = current.indexOf(id);
  if (idx >= 0) {
    setAppState('selectedIds', current.filter(x => x !== id));
  } else {
    setAppState('selectedIds', [...current, id]);
  }
  setAppState('bulkMode', appState.selectedIds.length > 0);
  setAppState('lastBulkSelectedId', id);
}

export function clearBulkSelection() {
  setAppState('selectedIds', []);
  setAppState('bulkMode', false);
  setAppState('lastBulkSelectedId', null);
}

export function switchView(view: ViewName) {
  setAppState('currentView', view);
  setAppState('selectedThreadId', null);
  clearBulkSelection();
  // Clear filters on view switch
  setAppState('categoryFilter', null);
  setAppState('senderFilter', null);
  setAppState('domainFilter', null);
}

export function setSearchQuery(query: string) {
  setAppState('searchQuery', query);
}

export function setThreads(threads: Thread[]) {
  setAppState('threads', threads);
}

export function setCategoryFilter(category: string | null) {
  setAppState('categoryFilter', category);
}

export function setSenderFilter(sender: string | null) {
  setAppState('senderFilter', sender);
}

export function setDomainFilter(domain: string | null) {
  setAppState('domainFilter', domain);
}
