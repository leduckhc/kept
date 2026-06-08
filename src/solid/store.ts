/**
 * Reactive application store using SolidJS signals and stores.
 * This is the SINGLE source of truth for all UI state.
 * Replaces the imperative `state` object from state.ts completely.
 */
import { createMemo, createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { Thread } from '../store';
import type { Account } from '../auth';

// ── Types ───────────────────────────────────────────────────
export type LayoutMode = '3-pane' | '2-pane';
export type ViewName = 'Inbox' | 'Snoozed' | 'Sent' | 'Drafts' | 'Starred' | 'Scheduled' | 'Reminders' | 'Trash' | 'Archive' | 'SetAside' | 'Triage';
export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

// ── Core reactive store ─────────────────────────────────────
export interface AppState {
  // Auth
  account: Account | null;
  accounts: Account[];
  authenticated: boolean;
  // View
  currentView: ViewName;
  layoutMode: LayoutMode;
  // Threads
  threads: Thread[];
  searchQuery: string;
  syncing: boolean;
  statusMessage: string;
  // Selection
  selectedThreadId: string | null;
  focusedThreadId: string | null;
  bulkMode: boolean;
  selectedIds: string[];
  lastBulkSelectedId: string | null;
  // Filters
  categoryFilter: string | null;
  senderFilter: string | null;
  domainFilter: string | null;
  unifiedMode: boolean;
  accountFilter: string | null;
  // Settings
  settingsOpen: boolean;
  // Compose
  composeOpen: boolean;
  composeMode: ComposeMode;
  composeTo: string;
  composeSubject: string;
  composeBody: string;
  composeReplyThreadId: string | null;
  composeCc: string;
  composeBcc: string;
  // Senders
  knownSenders: string[];
  groupedSenders: string[];
  groupedDomains: string[];
  vipSenders: string[];
  // Misc
  lastUsedAccountId: string | null;
  navDrawerOpen: boolean;
  darkMode: boolean;
  smartNotifications: boolean;
  // Server search
  serverSearching: boolean;
}

// Everything in one createRoot so memos can track the store
const root = createRoot(() => {
  const [appState, setAppState] = createStore<AppState>({
    account: null,
    accounts: [],
    authenticated: false,
    currentView: 'Inbox',
    layoutMode: '2-pane',
    threads: [],
    searchQuery: '',
    syncing: false,
    statusMessage: '',
    selectedThreadId: null,
    focusedThreadId: null,
    bulkMode: false,
    selectedIds: [],
    lastBulkSelectedId: null,
    categoryFilter: null,
    senderFilter: null,
    domainFilter: null,
    unifiedMode: true,
    accountFilter: null,
    settingsOpen: false,
    composeOpen: false,
    composeMode: 'new',
    composeTo: '',
    composeSubject: '',
    composeBody: '',
    composeReplyThreadId: null,
    composeCc: '',
    composeBcc: '',
    knownSenders: [],
    groupedSenders: [],
    groupedDomains: [],
    vipSenders: [],
    lastUsedAccountId: null,
    navDrawerOpen: false,
    darkMode: (localStorage.getItem('theme') ?? 'light') === 'dark',
    smartNotifications: localStorage.getItem('smartNotifications') !== 'false',
    serverSearching: false,
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
      threads = threads.filter(t => t.label === 'TRASH');
    } else if (view === 'Snoozed') {
      threads = threads.filter(t => t.snoozedUntil !== null);
    } else if (view === 'SetAside') {
      threads = threads.filter(t => t.isSetAside);
    } else if (view === 'Archive') {
      threads = threads.filter(t => t.isArchived && t.label !== 'TRASH');
    } else if (view === 'Drafts') {
      threads = threads.filter(t => t.label === 'DRAFT');
    } else if (view === 'Triage') {
      threads = threads.filter(t => t.isUnread && !t.isArchived && !t.isMuted);
    } else if (view === 'Scheduled') {
      threads = []; // Scheduled sends come from localStorage, not thread DB
    } else if (view === 'Reminders') {
      threads = []; // Follow-up reminders come from localStorage, not thread DB
    } else if (view === 'Inbox') {
      // Default: show non-archived, non-muted threads in INBOX
      threads = threads.filter(t => !t.isArchived && !t.isMuted && t.label !== 'SENT' && t.label !== 'DRAFT' && t.label !== 'TRASH');
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
  setAppState('focusedThreadId', id);
  // Clear bulk when opening a thread
  if (id) {
    setAppState('bulkMode', false);
    setAppState('selectedIds', []);
  }
}

export function focusThread(id: string | null) {
  setAppState('focusedThreadId', id);
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
  setAppState('searchQuery', '');
  clearBulkSelection();
  // Clear filters on view switch
  setAppState('categoryFilter', null);
  setAppState('senderFilter', null);
  setAppState('domainFilter', null);
}

export function setSearchQuery(query: string) {
  setAppState('searchQuery', query);
  debouncedServerSearch(query);
}

// ── Server-side search with debounce ─────────────────────────
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchAbortController: AbortController | null = null;

function debouncedServerSearch(query: string) {
  if (searchTimer) clearTimeout(searchTimer);
  if (searchAbortController) searchAbortController.abort();

  if (!query.trim()) {
    setAppState('serverSearching', false);
    return;
  }

  searchTimer = setTimeout(() => {
    void performServerSearch(query.trim());
  }, 300);
}

async function performServerSearch(query: string) {
  const account = appState.account;
  if (!account) return;

  setAppState('serverSearching', true);
  searchAbortController = new AbortController();
  const signal = searchAbortController.signal;

  try {
    const { getProviderForAccount } = await import('../providerRegistry');
    const provider = getProviderForAccount(account);
    const { threadIds } = await provider.search(account, query, 30);

    if (signal.aborted) return;

    if (threadIds.length > 0) {
      // Sync matching threads so they appear in local DB
      const { syncThreadById } = await import('../gmail');
      const existing = new Set(appState.threads.map(t => t.id));
      const newIds = threadIds.filter(id => !existing.has(id));

      if (newIds.length > 0) {
        await Promise.all(newIds.slice(0, 20).map(id => syncThreadById(account, id)));
        if (signal.aborted) return;
        // Reload threads so newly synced ones appear in the filtered list
        const { loadThreads, loadThreadsUnified } = await import('../store');
        const threads = appState.unifiedMode
          ? await loadThreadsUnified(appState.accountFilter, 'ALL')
          : await loadThreads(account.id, 'ALL');
        setAppState('threads', threads);
      }
    }
  } catch (err) {
    if (signal.aborted) return;
    console.warn('[server-search] failed:', err);
  } finally {
    if (!signal.aborted) {
      setAppState('serverSearching', false);
    }
  }
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

export function openCompose(mode: ComposeMode = 'new', opts?: { to?: string; subject?: string; body?: string; threadId?: string; cc?: string; bcc?: string }) {
  setAppState('composeOpen', true);
  setAppState('composeMode', mode);
  setAppState('composeTo', opts?.to ?? '');
  setAppState('composeSubject', opts?.subject ?? '');
  setAppState('composeBody', opts?.body ?? '');
  setAppState('composeReplyThreadId', opts?.threadId ?? null);
  setAppState('composeCc', opts?.cc ?? '');
  setAppState('composeBcc', opts?.bcc ?? '');
}

export function closeCompose() {
  setAppState('composeOpen', false);
  setAppState('composeTo', '');
  setAppState('composeSubject', '');
  setAppState('composeBody', '');
  setAppState('composeReplyThreadId', null);
  setAppState('composeCc', '');
  setAppState('composeBcc', '');
}

export function openSettings() {
  setAppState('settingsOpen', true);
}

export function closeSettings() {
  setAppState('settingsOpen', false);
}

export function toggleNavDrawer() {
  setAppState('navDrawerOpen', !appState.navDrawerOpen);
}

export function closeNavDrawer() {
  setAppState('navDrawerOpen', false);
}

export function setStatus(msg: string) {
  setAppState('statusMessage', msg);
}
