// main.ts — Kept inbox UI
import { getAllAccounts, startOAuth, migrateTokensToKeychain, removeAccount } from './auth';
import { resolveActiveAccount, clearActiveAccountId } from './accountContext';
import { registerProvider } from './providerRegistry';
import { GmailProvider } from './providers/gmail';
import { registerAuthProvider } from './authProviderRegistry';
import { GoogleAuthProvider } from './authProviders/google';
import { type Thread, loadThreads, loadRepliedToSenders, loadAllSenderEmails, groupBySection, rowToThread } from './store';
import { fetchDraftByThread } from './gmail';
import { archiveThread, unarchiveThread, trashThread, untrashThread } from './gmail';
import { pushUndo } from './undoStack';
import { showToast } from './toasts';
import { loadLocalDrafts, type LocalDraft } from './localDrafts';

import { saveReminder, getOverdueReminders, markReminderNotified, dismissReminder } from './followupReminders';
import { getDb } from './db';
import { type Snippet, type SnippetContext, loadSnippets, saveSnippet, deleteSnippet, updateSnippet, bumpUsage, resolveVariables, fillVariables, BUILTIN_VARIABLES } from './snippets';
import { openSettings, initSettings } from './settings';
import { initAutoLabelsSettings } from './autoLabelsSettings';
import { syncAndRender, refreshAll, loadUnifiedThreads, initSync } from './sync';
import { applyTheme, applyLayoutMode, esc } from './helpers';
import { type ViewName, state, setAccount } from './state';
import { openSnoozePicker, setupSnoozeResurface } from './snooze';
import { startScheduledSendDispatch } from './scheduledSend';
import { sendEmail } from './gmail';
import { initSwipeGestures } from './swipe';
import { type ActionDeps, doMarkUnread, doMarkRead, doToggleStar, doArchive, doMute, doSetAside, doUnsetAside, accountFor } from './actions';
import { openInlineReply } from './inlineReply';
import { icon } from './icons';
import { renderUnifiedBar } from './unifiedBar';
import { ACCOUNT_BADGE_COLORS } from './avatar';
import { loadSmartFolders, showCreateSmartFolderDialog, runSmartFolder, deleteSmartFolder, type SmartFolder } from './smartFolders';

// Lazy-loaded modules (not needed on startup — code splitting)
let _composeModule: typeof import('./compose') | null = null;
let _threadReaderModule: typeof import('./threadReader') | null = null;
let _commandPaletteModule: typeof import('./commandPalette') | null = null;

// Toolbar context-actions visibility updater (set after shell renders)
let updateToolbarContextActions: () => void = () => {};

// Unified bar state updater — re-renders the bar based on app context
let _currentReaderSubject: string | null = null;

function updateUnifiedBar(opts?: { subject?: string }) {
  const slot = document.getElementById('unified-bar-slot');
  if (!slot) return;

  if (opts?.subject) _currentReaderSubject = opts.subject;

  const shell = document.getElementById('app-shell');
  const isReaderOpen = shell?.classList.contains('reader-open');
  // On desktop 3-pane (no layout-2pane class), reader is shown alongside inbox
  // so the unified bar should stay in inbox/folder mode. Reader mode only on mobile/tablet.
  const isFullscreenReader = isReaderOpen && (
    shell?.classList.contains('layout-2pane') ||
    window.innerWidth < 1024
  );

  if (isFullscreenReader && _currentReaderSubject) {
    slot.innerHTML = renderUnifiedBar({ mode: 'reader', subject: _currentReaderSubject });
    slot.dataset.mode = 'reader';
    wireUnifiedBarBack();
  } else if (_activeSmartFolder) {
    slot.innerHTML = renderUnifiedBar({
      mode: 'folder',
      folderName: _activeSmartFolder.name,
      folderColor: _activeSmartFolder.color,
      folderCount: state.threads.length,
    });
    slot.dataset.mode = 'folder';
    wireUnifiedBarBack();
  } else if (state.categoryFilter || state.senderFilter || state.domainFilter) {
    const filterLabel = state.categoryFilter
      ? (state.categoryFilter === 'newsletters' ? 'Newsletters'
         : state.categoryFilter === 'updates' ? 'Updates'
         : state.categoryFilter)
      : state.domainFilter
        ? state.domainFilter
        : state.senderFilter!;
    slot.innerHTML = renderUnifiedBar({
      mode: 'folder',
      folderName: filterLabel,
      folderColor: '#888',
      folderCount: state.threads.filter(t => {
        if (state.categoryFilter) return t.category === state.categoryFilter;
        if (state.senderFilter) return t.senderEmail === state.senderFilter;
        if (state.domainFilter) return t.senderEmail.endsWith('@' + state.domainFilter);
        return true;
      }).length,
    });
    slot.dataset.mode = 'filter';
    wireUnifiedBarBack();
  } else if (state.bulkMode && state.selectedIds.size > 0) {
    slot.innerHTML = renderUnifiedBar({ mode: 'bulk', count: state.selectedIds.size });
    slot.dataset.mode = 'bulk';
    wireUnifiedBarBulk();
  } else {
    _currentReaderSubject = null;
    // Skip re-render if already in inbox mode (preserves search focus/value)
    if (slot.dataset.mode === 'inbox') return;
    slot.innerHTML = renderUnifiedBar({ mode: 'inbox' });
    slot.dataset.mode = 'inbox';
    wireUnifiedBarInbox();
  }
}

function wireUnifiedBarBack() {
  document.getElementById('unified-bar-back')?.addEventListener('click', () => {
    const shell = document.getElementById('app-shell');
    if (shell?.classList.contains('reader-open')) {
      // Close reader — trigger same logic as reader-back
      const closeEvt = new CustomEvent('unified-bar:close-reader');
      document.dispatchEvent(closeEvt);
    } else if (_activeSmartFolder) {
      _activeSmartFolder = null;
      renderInbox();
      updateUnifiedBar();
    } else if (state.categoryFilter || state.senderFilter || state.domainFilter) {
      state.categoryFilter = null;
      state.senderFilter = null;
      state.domainFilter = null;
      renderInbox();
      updateUnifiedBar();
    }
  });
  // Wire overflow menu toggle
  const overflowBtn = document.querySelector('.unified-bar-overflow-btn');
  const overflowWrap = document.querySelector('.unified-bar-overflow');
  if (overflowBtn && overflowWrap) {
    overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      overflowWrap.classList.toggle('open');
    });
    document.addEventListener('click', () => overflowWrap.classList.remove('open'), { once: true });
  }
}

function wireUnifiedBarBulk() {
  document.getElementById('bulk-cancel')?.addEventListener('click', () => exitBulkMode());
  document.getElementById('bulk-archive')?.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    const threads = ids.map(id => state.threads.find(x => x.id === id)).filter(Boolean) as typeof state.threads;
    const deps = getActionDeps();
    for (const t of threads) {
      const acct = accountFor(t);
      if (!acct) continue;
      await archiveThread(acct, t);
      document.querySelector<HTMLElement>(`.thread-row[data-id="${t.id}"]`)?.remove();
      state.threads = state.threads.filter(x => x.id !== t.id);
    }
    pushUndo(`Archived ${threads.length} thread${threads.length !== 1 ? 's' : ''}`, async () => {
      for (const t of threads) {
        const acct = accountFor(t);
        if (acct) await unarchiveThread(acct, t);
      }
      state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(state.account!.id);
      deps.renderInbox();
    });
    showToast(`Archived ${threads.length} thread${threads.length !== 1 ? 's' : ''}`);
    exitBulkMode();
  });
  document.getElementById('bulk-trash')?.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    const threads = ids.map(id => state.threads.find(x => x.id === id)).filter(Boolean) as typeof state.threads;
    const deps = getActionDeps();
    for (const t of threads) {
      const acct = accountFor(t);
      if (!acct) continue;
      await trashThread(acct, t);
      document.querySelector<HTMLElement>(`.thread-row[data-id="${t.id}"]`)?.remove();
      state.threads = state.threads.filter(x => x.id !== t.id);
    }
    pushUndo(`Trashed ${threads.length} thread${threads.length !== 1 ? 's' : ''}`, async () => {
      for (const t of threads) {
        const acct = accountFor(t);
        if (acct) await untrashThread(acct, t);
      }
      state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(state.account!.id);
      deps.renderInbox();
    });
    showToast(`Moved ${threads.length} thread${threads.length !== 1 ? 's' : ''} to trash`);
    exitBulkMode();
  });
  document.getElementById('bulk-read')?.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    for (const id of ids) {
      const t = state.threads.find(x => x.id === id);
      if (!t) continue;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
      if (row) await doMarkRead(t, row, getActionDeps());
    }
    exitBulkMode();
  });
  document.getElementById('bulk-unread')?.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    for (const id of ids) {
      const t = state.threads.find(x => x.id === id);
      if (!t) continue;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
      if (row) await doMarkUnread(t, row);
    }
    exitBulkMode();
  });
  document.getElementById('bulk-star')?.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    for (const id of ids) {
      const t = state.threads.find(x => x.id === id);
      if (!t) continue;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
      if (row) await doToggleStar(t, row);
    }
    exitBulkMode();
  });
}

function wireUnifiedBarInbox() {
  // Hamburger
  document.getElementById('btn-hamburger')?.addEventListener('click', () => {
    document.getElementById('nav-drawer')?.classList.toggle('open');
    document.getElementById('nav-drawer-backdrop')?.classList.toggle('visible');
  });
  // Search toggle + input wiring
  const searchWrap = document.getElementById('toolbar-search-wrap');
  const searchToggle = document.getElementById('btn-search-toggle');
  const searchEl = document.getElementById('search') as HTMLInputElement | null;

  function expandSearch() {
    if (!searchWrap || !searchEl) return;
    searchWrap.classList.remove('collapsed');
    searchWrap.classList.add('expanded');
    requestAnimationFrame(() => searchEl.focus());
  }
  function collapseSearch() {
    if (!searchWrap || !searchEl) return;
    if (searchEl.value) return; // don't collapse if there's a query
    searchWrap.classList.remove('expanded');
    searchWrap.classList.add('collapsed');
    searchEl.blur();
  }

  if (searchToggle && searchWrap) {
    searchToggle.addEventListener('click', expandSearch);
  }
  if (searchEl) {
    // Restore expanded state if there's an active query
    if (state.searchQuery && searchWrap) {
      searchEl.value = state.searchQuery;
      searchWrap.classList.remove('collapsed');
      searchWrap.classList.add('expanded');
    }
    searchEl.addEventListener('input', () => {
      state.searchQuery = searchEl.value;
      if (searchDebounce !== null) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(async () => {
        if (!state.account) return;
        state.threads = await loadThreads(state.account.id, state.searchQuery || undefined);
        renderInbox();
      }, 200);
    });
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchEl.value = '';
        state.searchQuery = '';
        collapseSearch();
        if (state.account) loadThreads(state.account.id).then(t => { state.threads = t; renderInbox(); });
      }
    });
  }
  // Compose
  document.getElementById('btn-compose')?.addEventListener('click', async () => {
    const compose = await getCompose();
    compose.openCompose({ mode: 'new' });
  });
}

async function getCompose() { return _composeModule ??= await import('./compose'); }
async function getThreadReader() { return _threadReaderModule ??= await import('./threadReader'); }
async function getCommandPalette() { return _commandPaletteModule ??= await import('./commandPalette'); }
import {
  registerKeyboardShortcuts as _registerKeyboardShortcuts,
  showCheatSheet,
  openThreadWithReply as _openThreadWithReply,
} from './keyboard';
import {
  exitBulkMode as _exitBulkMode,
  toggleBulkSelection as _toggleBulkSelection,
  removeBulkBar,
} from './bulk';
import {
  renderInbox as _renderInbox,
  renderSnoozedView as _renderSnoozedView,
  renderStarredView as _renderStarredView,
  renderSetAsideView as _renderSetAsideView,
  renderScheduledView,
  renderRemindersView,
  // renderEmptyState is used internally by threadList
  threadRow,
  wireThreadRows,
} from './threadList';
import './search'; // search module self-registers
import { showSearchBar } from './search';
import { initResizeHandle } from './resizeHandle';
import { startTriage, isTriageActive, renderTriageView, handleTriageKey, type TriageDeps } from './triageMode';

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

const VIEWS: Array<{ name: ViewName; icon: string }> = [
  { name: 'Inbox',     icon: icon.email('18px') },
  { name: 'Triage',    icon: icon.zap('18px') },
  { name: 'Snoozed',   icon: icon.clock('18px') },
  { name: 'SetAside',  icon: icon.bookmark('18px') },
  { name: 'Sent',      icon: icon.send('18px') },
  { name: 'Drafts',    icon: icon.pencil('18px') },
  { name: 'Starred',   icon: icon.star('18px') },
  { name: 'Scheduled', icon: icon.calendar('18px') },
  { name: 'Reminders', icon: icon.bell('18px') },
  { name: 'Trash',     icon: icon.trash('18px') },
  { name: 'Archive',   icon: icon.archive('18px') },
];

async function refreshKnownSenders() {
  if (!state.accounts.length) return;

  const BASELINE_KEY = 'kept-known-senders-seeded';
  const ACCEPTED_KEY = 'kept-accepted-senders';

  // On first run, seed ALL existing senders as known baseline
  if (!localStorage.getItem(BASELINE_KEY)) {
    const allSenders = await Promise.all(
      state.accounts.map(a => loadAllSenderEmails(a.id).catch(() => [] as string[]))
    );
    const baseline = allSenders.flat().map(e => e.toLowerCase());
    // Store as accepted so they persist across sessions
    const existing: string[] = JSON.parse(localStorage.getItem(ACCEPTED_KEY) || '[]');
    const merged = [...new Set([...existing, ...baseline])];
    localStorage.setItem(ACCEPTED_KEY, JSON.stringify(merged));
    localStorage.setItem(BASELINE_KEY, '1');
  }

  // Load replied-to senders from DB
  const allEmails = await Promise.all(state.accounts.map(a => loadRepliedToSenders(a.id).catch(() => [] as string[])));
  state.knownSenders = new Set(allEmails.flat().map(e => e.toLowerCase()));

  // Merge in accepted/baseline senders from localStorage
  const accepted: string[] = JSON.parse(localStorage.getItem(ACCEPTED_KEY) || '[]');
  for (const email of accepted) {
    state.knownSenders.add(email.toLowerCase());
  }
}

function toggleNavDrawer() {
  const drawer = document.getElementById('nav-drawer');
  const backdrop = document.getElementById('nav-drawer-backdrop');
  if (!drawer || !backdrop) return;
  const open = drawer.classList.toggle('open');
  backdrop.classList.toggle('open', open);
}

function closeNavDrawer() {
  document.getElementById('nav-drawer')?.classList.remove('open');
  document.getElementById('nav-drawer-backdrop')?.classList.remove('open');
}








function getAccountAvatar(): string {
  if (!state.account?.email) return '?';
  const initial = state.account.email.charAt(0).toUpperCase();
  return `<span class="avatar-circle">${initial}</span>`;
}

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  // Register email providers
  registerProvider('gmail', new GmailProvider());
  // Register auth providers
  registerAuthProvider('gmail', new GoogleAuthProvider());

  applyTheme(localStorage.getItem('theme') ?? 'light');
  applyLayoutMode(state.layoutMode);

  // Initialize extracted modules
  initSettings({ renderInbox, refreshAll, showAuth, loadUnifiedThreads });
  initSync({ renderCurrentView, loadUnifiedThreads, refreshKnownSenders });

  // Show auth screen immediately — don't block on DB
  showAuth();

  // E2E mode: skip OAuth and sync, just render from pre-seeded DB
  const isE2E = import.meta.env.VITE_E2E === '1';

  // Check if we're inside a real Tauri window
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (!isTauri && !isE2E) {
    // Browser-only dev: just show the login screen, no DB
    return;
  }

  try {
    // One-time migration: move tokens from SQLite → OS keychain
    await migrateTokensToKeychain();

    state.accounts = await getAllAccounts();
    state.account = await resolveActiveAccount();
    if (state.account) {
      showShell();
      renderAccountFilter();
      refreshKnownSenders().catch(() => {});
      await refreshAll();
      renderSmartFoldersSidebar();
      setupSnoozeResurface(renderInbox);
      startScheduledSendDispatch(() => state.account, sendEmail);

      // Background auto-sync every 60s
      setInterval(() => { syncAndRender().catch(() => {}); }, 60_000);
    }
  } catch (e) {
    console.error('Boot error:', e);
    // Auth screen already shown — user can log in fresh
  }
}

// ── Follow-up Reminders ──────────────────────────────────
function showFollowupPrompt(opts: { threadId: string; subject: string; sentTo: string }) {
  const existing = document.querySelector('.followup-prompt');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'followup-prompt';
  el.innerHTML = `<span>Remind if no reply?</span>
    <a data-days="1">1 day</a> <a data-days="3">3 days</a> <a data-days="7">1 week</a>
    <a class="followup-dismiss">✕</a>`;
  el.querySelectorAll('a[data-days]').forEach(a => {
    a.addEventListener('click', () => {
      const days = parseInt((a as HTMLElement).dataset.days || '3');
      const remindAfter = new Date(Date.now() + days * 86400000).toISOString();
      saveReminder({ threadId: opts.threadId, subject: opts.subject, sentTo: opts.sentTo, remindAfter });
      el.remove();
    });
  });
  el.querySelector('.followup-dismiss')?.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function checkOverdueReminders() {
  const overdue = getOverdueReminders();
  if (overdue.length === 0) return;
  const MAX_TOASTS = 3;
  const toShow = overdue.slice(0, MAX_TOASTS);
  overdue.forEach(r => {
    markReminderNotified(r.id);
    // Mark thread as unread in DB so it resurfaces in inbox
    if (r.threadId) {
      getDb().then(db => {
        db.execute('UPDATE threads SET is_unread = 1, label = ? WHERE id = ? OR gmail_thread_id = ?', ['INBOX', r.threadId, r.threadId]).catch(() => {});
      }).catch(() => {});
    }
  });
  toShow.forEach(r => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `🔔 No reply from <b>${esc(r.sentTo)}</b> — "${esc(r.subject)}" <a class="toast-dismiss">dismiss</a>`;
    toast.querySelector('.toast-dismiss')?.addEventListener('click', () => { dismissReminder(r.id); toast.remove(); });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  });
  // Refresh inbox to show resurfaced threads
  if (state.currentView === 'Inbox' && state.account) {
    loadThreads(state.account.id).then(fresh => {
      state.threads = fresh;
      renderInbox();
    }).catch(() => {});
  }
}

checkOverdueReminders();
setInterval(checkOverdueReminders, 60000);

// ── Reminder row click → open thread ─────────────────────
document.addEventListener('kept:open-thread-by-id', async (e: Event) => {
  const threadId = (e as CustomEvent).detail?.threadId;
  if (!threadId) return;
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    'SELECT * FROM threads WHERE id = ? OR gmail_thread_id = ? LIMIT 1',
    [threadId, threadId]
  );
  if (rows.length > 0) {
    openThread(rowToThread(rows[0]));
  }
});

// ── Auth screen ───────────────────────────────────────────
function showAuth() {
  document.getElementById('app')!.innerHTML = `
    <div id="auth-screen">
      <div class="app-name">Kept</div>
      <div class="app-tagline">A minimal email client</div>
      <button class="btn-google" id="btn-login">
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.1 0 5.5 1.1 7.4 2.9l5.5-5.5C33.5 3.7 29 1.5 24 1.5 14.9 1.5 7.2 7.2 4.2 15.2l6.4 5C12 13.4 17.5 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.9-2.2 5.4-4.6 7l7.1 5.5c4.2-3.8 6.6-9.5 6.6-16.5z"/>
          <path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.7-4.6l-6.4-5A23.5 23.5 0 0 0 .5 24c0 3.8.9 7.4 2.5 10.6l7.6-6z"/>
          <path fill="#34A853" d="M24 46.5c5 0 9.2-1.6 12.3-4.4l-7.1-5.5c-2 1.3-4.4 2.1-5.2 2.1-6.5 0-12-4-14-9.5l-7.6 6C7.2 40.8 14.9 46.5 24 46.5z"/>
        </svg>
        Sign in with Google
      </button>
    </div>
  `;
  document.getElementById('btn-login')!.addEventListener('click', async () => {
    const btn = document.getElementById('btn-login') as HTMLButtonElement;
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.textContent = 'Opening browser…';
    try {
      state.account = await startOAuth();
      state.accounts = await getAllAccounts();
      setAccount(state.account);
      showShell();
      renderAccountFilter();
      await refreshAll();
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      alert(`Login failed: ${e}`);
    }
  });
}

// ── App shell ─────────────────────────────────────────────
function showShell() {
  document.getElementById('app')!.innerHTML = `
    <div id="app-shell" class="${state.layoutMode === '2-pane' ? 'layout-2pane' : ''}">
      <div class="nav-drawer-backdrop" id="nav-drawer-backdrop"></div>
      <nav class="nav-drawer" id="nav-drawer">
        <div class="nav-drawer-header">Kept</div>
        ${VIEWS.map(v => `<button class="nav-drawer-item${v.name === state.currentView ? ' active' : ''}" data-view="${v.name}">${v.icon}<span>${v.name}</span></button>`).join('')}
      </nav>
      <nav class="sidebar" id="sidebar">
        ${VIEWS.map(v => `<button class="sidebar-btn${v.name === state.currentView ? ' active' : ''}" data-view="${v.name}" title="${v.name}">${v.icon}</button>`).join('')}
        <div class="sidebar-smart-folders" id="sidebar-smart-folders"></div>
        <button class="sidebar-btn sidebar-add-folder" id="btn-add-smart-folder" title="New Smart Folder">${icon.plus('18px')}</button>
        <div class="sidebar-spacer"></div>
        <button class="sidebar-btn sidebar-avatar" id="btn-account" title="Switch account">${getAccountAvatar()}</button>
      </nav>
      <div class="main-area">
        <div class="unified-bar-slot" id="unified-bar-slot">
          ${renderUnifiedBar({ mode: 'inbox' })}
        </div>
        <div class="app-body">
          <div class="inbox" id="inbox"></div>
          <div class="reader-pane" id="reader-pane">
            <div class="reader-pane-empty">
              <div class="reader-pane-empty-icon">${icon.email()}</div>
              <div class="reader-pane-empty-text">Select a conversation</div>
            </div>
          </div>
        </div>
        <div class="statusbar">
          <span id="status-right"></span>
        </div>
      </div>
      <div class="settings-panel" id="settings-panel" aria-hidden="true">
        <div class="settings-topbar">
          <button class="settings-back" id="settings-back">← Inbox</button>
          <span class="settings-title">Settings</span>
        </div>
        <div class="settings-body">
          <input type="text" class="settings-search" id="settings-search" placeholder="Search settings…" autocomplete="off" />
          <div class="settings-section">
            <div class="settings-section-label">Accounts</div>
            <div id="settings-accounts-list"></div>
            <button class="settings-action-btn" id="settings-add-account">
              + Add account
            </button>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">Appearance</div>
            <div class="settings-row" id="settings-darkmode-row">
              <div class="settings-row-text">
                <div class="settings-row-label">Dark mode</div>
                <div class="settings-row-sub" id="settings-darkmode-sub">Switch to dark theme</div>
              </div>
              <button class="settings-toggle" id="settings-darkmode-toggle" role="switch" aria-checked="false">
                <span class="settings-toggle-thumb"></span>
              </button>
            </div>

          </div>

          <div class="settings-section">
            <div class="settings-section-label">Notifications</div>
            <div class="settings-row" id="settings-smartnotif-row">
              <div class="settings-row-text">
                <div class="settings-row-label">Smart Notifications</div>
                <div class="settings-row-sub" id="settings-smartnotif-sub">Only notify for known senders</div>
              </div>
              <button class="settings-toggle" id="settings-smartnotif-toggle" role="switch" aria-checked="true">
                <span class="settings-toggle-thumb"></span>
              </button>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">Snippets / Templates</div>
            <div class="settings-row-sub" style="padding:0 16px 8px">Reusable text with {{variables}} — use ⌘; in compose to insert</div>
            <button class="settings-action-btn" id="settings-manage-snippets">
              ✏️ Manage snippets
            </button>
          </div>

          <div class="settings-section" id="settings-auto-labels-section">
            <div class="settings-section-label">Auto Labels</div>
            <div class="settings-section-sub">Automatically label emails based on rules (e.g. from:@github.com → Dev)</div>
            <div id="settings-auto-labels-list" class="settings-auto-labels-list"></div>
            <button class="settings-action-btn" id="settings-add-auto-label">
              + Add rule
            </button>
          </div>

          <div class="settings-section" id="settings-signature-section">
            <div class="settings-section-label">Email Signature</div>
            <textarea class="settings-signature-ta" id="settings-signature-ta"
              placeholder="Your signature…" rows="4"></textarea>
            <div class="signature-preview" id="settings-signature-preview" style="display:none"></div>
            <div class="settings-signature-actions">
              <button class="settings-signature-save" id="settings-signature-save">Save</button>
            </div>
          </div>
          <div class="settings-footer">
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-compose')?.addEventListener('click', () => openComposeNew());

  // Toolbar context actions: show/hide based on selection or bulk mode
  updateToolbarContextActions = () => {
    const ctxActions = document.getElementById('toolbar-context-actions');
    if (!ctxActions) return;
    const show = state.bulkMode || state.selectedThreadId !== null;
    ctxActions.classList.toggle('visible', show);
  };

  // Settings: Manage Snippets button
  document.getElementById('settings-manage-snippets')!.addEventListener('click', () => {
    openSnippetManager(null);
  });

  // Settings: Auto Labels
  initAutoLabelsSettings();

  // Sidebar nav + mobile tab buttons + drawer items
  document.querySelectorAll<HTMLButtonElement>('.sidebar-btn[data-view], .nav-drawer-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view as ViewName);
      closeNavDrawer();
    });
  });

  // Hamburger menu
  document.getElementById('btn-hamburger')?.addEventListener('click', () => toggleNavDrawer());
  document.getElementById('nav-drawer-backdrop')!.addEventListener('click', () => closeNavDrawer());

  // Resizable pane handle
  initResizeHandle();

  // Unified bar: listen for reader close to switch back to inbox mode
  document.addEventListener('unified-bar:reader-closed', () => updateUnifiedBar());

  // Initial unified bar wiring
  wireUnifiedBarInbox();

  document.getElementById('btn-account')!.addEventListener('click', () => {
    openSettings();
  });

  // Smart Folders: add button
  document.getElementById('btn-add-smart-folder')!.addEventListener('click', async () => {
    const folder = await showCreateSmartFolderDialog(state.searchQuery || undefined);
    if (folder) {
      await renderSmartFoldersSidebar();
      switchToSmartFolder(folder.id);
    }
  });

  // Collapse search on click outside (document-level, only needs one registration)
  document.addEventListener('click', (e) => {
    const searchWrap = document.getElementById('toolbar-search-wrap');
    if (searchWrap?.classList.contains('expanded') && !searchWrap.contains(e.target as Node)) {
      const searchEl = document.getElementById('search') as HTMLInputElement | null;
      if (searchEl && !searchEl.value) {
        searchWrap.classList.remove('expanded');
        searchWrap.classList.add('collapsed');
        searchEl.blur();
      }
    }
  });

  // Keyboard shortcuts (skip when focus is in an input/textarea)
  function handleKey(e: KeyboardEvent) {
    // Cmd/Ctrl+F: expand search bar (prevent browser find)
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      const searchWrap = document.getElementById('toolbar-search-wrap');
      const searchEl = document.getElementById('search') as HTMLInputElement | null;
      if (searchWrap && searchEl) {
        searchWrap.classList.remove('collapsed');
        searchWrap.classList.add('expanded');
        requestAnimationFrame(() => searchEl.focus());
      }
      return;
    }
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
    // Triage mode intercepts keys when active
    if (state.currentView === 'Triage' && isTriageActive() && handleTriageKey(e, getTriageDeps())) return;
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey) openComposeNew();
  }
  document.addEventListener('keydown', handleKey);
  registerKeyboardShortcuts();

  initSwipeGestures({ getActionDeps });

  // Expose hooks for native menu events (Tauri)
  (window as unknown as Record<string, unknown>).__kept_sync = () => syncAndRender();
  (window as unknown as Record<string, unknown>).__kept_settings = () => openSettings();
}

// ── View switching ────────────────────────────────────────
async function switchView(view: ViewName) {
  state.currentView = view;
  _activeSmartFolder = null;
  // Clear any active filters from the previous view
  state.categoryFilter = null;
  state.senderFilter = null;
  state.domainFilter = null;
  // Update sidebar + mobile tab buttons + drawer items
  document.querySelectorAll<HTMLButtonElement>('.sidebar-btn[data-view], .nav-drawer-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  // Render appropriate content
  if (view === 'Inbox') {
    // Reload inbox threads from DB (may have been overwritten by label views)
    await reloadInboxThreads();
  } else if (view === 'Triage') {
    renderTriageViewWrapper();
  } else if (view === 'Snoozed') {
    renderSnoozedView();
  } else if (view === 'Starred') {
    renderStarredView();
  } else if (view === 'SetAside') {
    renderSetAsideView();
  } else if (view === 'Scheduled') {
    renderScheduledView();
  } else if (view === 'Reminders') {
    renderRemindersView();
  } else {
    renderLabelView(view);
  }
  updateUnifiedBar();
}

// ── Smart Folders ─────────────────────────────────────────

let _activeSmartFolder: SmartFolder | null = null;

async function renderSmartFoldersSidebar() {
  if (!state.account) return;
  const container = document.getElementById('sidebar-smart-folders');
  if (!container) return;
  const folders = await loadSmartFolders(state.account.id);
  if (!folders.length) { container.innerHTML = ''; return; }
  container.innerHTML = folders.map(f => `
    <button class="sidebar-btn sidebar-sf-btn${_activeSmartFolder?.id === f.id ? ' active' : ''}" data-sf-id="${f.id}" title="${esc(f.name)}">
      <span class="sf-dot" style="background:${f.color}"></span>
    </button>
  `).join('');
  container.querySelectorAll<HTMLButtonElement>('.sidebar-sf-btn').forEach(btn => {
    btn.addEventListener('click', () => switchToSmartFolder(btn.dataset.sfId!));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showSmartFolderContextMenu(e, btn.dataset.sfId!);
    });
  });
}

async function switchToSmartFolder(folderId: string) {
  if (!state.account) return;
  const folders = await loadSmartFolders(state.account.id);
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  _activeSmartFolder = folder;
  // Deactivate normal views
  document.querySelectorAll<HTMLButtonElement>('.sidebar-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll<HTMLButtonElement>(`.sidebar-sf-btn[data-sf-id="${folderId}"]`).forEach(btn => btn.classList.add('active'));
  // Run query
  state.threads = await runSmartFolder(state.account.id, folder);
  const container = document.getElementById('inbox');
  if (!container) return;
  const rows = state.threads.map(t => threadRow(t, false)).join('');
  container.innerHTML = rows || `<div class="empty-state"><div class="empty-text">No matching messages</div></div>`;
  wireThreadRows(container, state.threads, false, getThreadListDeps());
  updateUnifiedBar();
}

function showSmartFolderContextMenu(e: MouseEvent, folderId: string) {
  // Remove existing context menu if any
  document.querySelector('.sf-context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'sf-context-menu';
  menu.innerHTML = `<button class="sf-ctx-item sf-ctx-delete">Delete</button>`;
  menu.style.top = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;
  document.body.appendChild(menu);
  menu.querySelector('.sf-ctx-delete')!.addEventListener('click', async () => {
    if (!state.account) return;
    await deleteSmartFolder(state.account.id, folderId);
    menu.remove();
    if (_activeSmartFolder?.id === folderId) {
      _activeSmartFolder = null;
      switchView('Inbox');
    }
    renderSmartFoldersSidebar();
  });
  const dismiss = (ev: MouseEvent) => { if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('click', dismiss); } };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

/** Reload inbox threads from the local DB and render immediately. */
async function reloadInboxThreads() {
  if (!state.account) return;
  // Clear container to force full rebuild (bypass incremental patchThreadList
  // which fails when container still has stale content from a different view)
  const container = document.getElementById('inbox');
  if (container) container.innerHTML = '';
  if (state.unifiedMode) {
    state.threads = await loadUnifiedThreads();
  } else {
    state.threads = await loadThreads(state.account.id);
  }
  renderInbox();
}

function renderAccountFilter() {
  const container = document.getElementById('account-filter');
  if (!container) return;
  if (state.accounts.length <= 1) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const current = state.accountFilter
    ? state.accounts.find(a => a.id === state.accountFilter)?.email ?? 'Account'
    : 'All Accounts';
  const acctIdx = state.accounts.findIndex(a => a.id === state.accountFilter);
  const dot = state.accountFilter && acctIdx >= 0
    ? `<span class="account-filter-dot" style="background:${ACCOUNT_BADGE_COLORS[acctIdx % ACCOUNT_BADGE_COLORS.length]}"></span>`
    : `<span class="account-filter-dot account-filter-dot-all"></span>`;
  container.innerHTML = `${dot}<span class="account-filter-label">${esc(current)}</span><span class="account-filter-chevron">▾</span>`;
  container.onclick = showAccountFilterMenu;
}

function showAccountFilterMenu(e: Event) {
  e.stopPropagation();
  const existing = document.getElementById('account-filter-menu');
  if (existing) { existing.remove(); return; }
  const menu = document.createElement('div');
  menu.id = 'account-filter-menu';
  menu.className = 'account-filter-menu';
  let html = `<div class="account-filter-item${!state.accountFilter ? ' active' : ''}" data-filter="" tabindex="0">All Accounts</div>`;
  state.accounts.forEach((a, i) => {
    const color = ACCOUNT_BADGE_COLORS[i % ACCOUNT_BADGE_COLORS.length];
    const active = state.accountFilter === a.id ? ' active' : '';
    html += `<div class="account-filter-item${active}" data-filter="${a.id}" tabindex="0"><span class="account-filter-dot" style="background:${color}"></span>${esc(a.email)}</div>`;
  });
  menu.innerHTML = html;
  menu.addEventListener('click', async (ev) => {
    const target = (ev.target as HTMLElement).closest('.account-filter-item') as HTMLElement | null;
    if (!target) return;
    const filter = target.dataset.filter || null;
    state.accountFilter = filter;
    state.unifiedMode = filter === null;
    menu.remove();
    renderAccountFilter();
    await reloadInboxThreads();
  });
  const container = document.getElementById('account-filter')!;
  container.appendChild(menu);
  // Keyboard navigation
  const items = menu.querySelectorAll('.account-filter-item') as NodeListOf<HTMLElement>;
  let focusIdx = -1;
  menu.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusIdx = Math.min(focusIdx + 1, items.length - 1);
      items[focusIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusIdx = Math.max(focusIdx - 1, 0);
      items[focusIdx]?.focus();
    } else if (e.key === 'Escape') {
      menu.remove();
    } else if (e.key === 'Enter' && focusIdx >= 0) {
      (items[focusIdx] as HTMLElement)?.click();
    }
  });
  menu.setAttribute('tabindex', '-1');
  menu.focus();
  const dismiss = () => { menu.remove(); document.removeEventListener('click', dismiss); };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

/** Convert a LocalDraft into a Thread object for rendering in the Drafts view. */
function localDraftToThread(d: LocalDraft): Thread {
  return {
    id: d.id,
    subject: d.subject || '(no subject)',
    snippet: d.body.slice(0, 100),
    senderName: 'Draft',
    senderEmail: d.to || '',
    receivedAt: d.updatedAt,
    isUnread: false,
    isArchived: false,
    isStarred: false,
    hasAttachment: false,
    gmailThreadId: d.gmailDraftId ?? d.id,
    snoozedUntil: null,
    snoozeLabel: null,
    messageCount: 1,
    label: 'DRAFT',
    accountId: d.accountId,
    isMuted: false,
    isSetAside: false,
    category: 'personal',
    userLabels: '',
  };
}

function renderLabelView(view: ViewName) {
  const container = document.getElementById('inbox');
  if (!container) return;
  const VIEW_TO_LABEL: Record<string, string> = { Sent: 'SENT', Drafts: 'DRAFT', Starred: 'STARRED', Trash: 'TRASH', Archive: 'ARCHIVE' };
  const gmailLabel = VIEW_TO_LABEL[view];
  if (!state.account || !gmailLabel) return;

  const accountId = state.account.id;
  const threadsPromise = loadThreads(accountId, gmailLabel);
  // For Drafts view, also load local drafts and merge
  const localDraftsPromise = gmailLabel === 'DRAFT' ? loadLocalDrafts(accountId) : Promise.resolve([] as LocalDraft[]);

  Promise.all([threadsPromise, localDraftsPromise]).then(([ts, localDrafts]) => {
    if (state.currentView !== view) return;
    const container = document.getElementById('inbox');
    if (!container) return;

    // Convert local drafts to Thread objects (dedup by gmailDraftId)
    const existingGmailIds = new Set(ts.map(t => t.gmailThreadId));
    const localAsThreads: Thread[] = localDrafts
      .filter(d => !d.gmailDraftId || !existingGmailIds.has(d.gmailDraftId))
      .map(localDraftToThread);
    const merged = [...localAsThreads, ...ts];

    const sections = groupBySection(merged, state.groupedSenders, state.groupedDomains, state.vipSenders);
    const html = sections.map(s => {
      return `
      <div class="section-header">${s.label}</div>
      ${s.threads.map(t => threadRow(t, false)).join('')}`;
    }).join('');
    container.innerHTML = html || `<div class="empty-state"><div class="empty-text">No ${view.toLowerCase()} messages</div></div>`;
    wireThreadRows(container, merged, false, getThreadListDeps());
  });
}

// ── Sync is in sync.ts — refreshAll, syncAndRender, loadUnifiedThreads imported at top

function getActionDeps(): ActionDeps {
  return { renderInbox, loadUnifiedThreads };
}




function openThreadWithReply(t: Thread) {
  _openThreadWithReply(t, openThread);
}

function registerKeyboardShortcuts() {
  _registerKeyboardShortcuts({
    renderInbox,
    openThread,
    openThreadWithReply,
    openComposeNew,
    openComposeForward,
    switchView,
    toggleBulkSelection,
    removeBulkBar,
    exitBulkMode,
    updateBulkBar,
    renderCommandPalette,
    openSnippetPicker,
    getActionDeps,
    doArchive,
    doToggleStar,
    doMarkUnread,
    doMute,
    doSetAside,
    doUnsetAside,
    openSearchBar: () => showSearchBar({ renderInbox, openThread }),
    syncAndRender,
  });
}

function exitBulkMode() { _exitBulkMode(renderInbox); }
function toggleBulkSelection(id: string, shiftKey?: boolean) { _toggleBulkSelection(id, updateBulkBar, shiftKey); }
function updateBulkBar() { updateUnifiedBar(); updateToolbarContextActions(); }

function getThreadListDeps() {
  return {
    openThread,
    openInlineReply,
    toggleBulkSelection,
    removeBulkBar,
    updateBulkBar,
    getActionDeps,
    renderInbox,
    renderScheduledView,
  };
}

function renderInbox() { _renderInbox(getThreadListDeps()); updateToolbarContextActions(); updateUnifiedBar(); }
function renderSnoozedView() { return _renderSnoozedView(getThreadListDeps()); }
function renderStarredView() { return _renderStarredView(getThreadListDeps()); }
function renderSetAsideView() { return _renderSetAsideView(getThreadListDeps()); }

// ── Triage Mode ───────────────────────────────────────────
function getTriageDeps(): TriageDeps {
  return {
    getActionDeps: () => ({ renderInbox, loadUnifiedThreads }),
    openThread,
    openInlineReply: (t: Thread, row: HTMLElement) => openInlineReply(t, row),
  };
}

function renderTriageViewWrapper() {
  if (!isTriageActive()) {
    startTriage();
  }
  renderTriageView(getTriageDeps());
}

/** Re-render whatever view is currently active (used after sync). */
function renderCurrentView() {
  switchView(state.currentView);
}

function openComposeNew(prefillSubject = '') {
  const accountId = state.lastUsedAccountId ?? state.account?.id;
  return getCompose().then(m => m.openComposeNew(prefillSubject, openSnippetPicker, showFollowupPrompt, accountId));
}

function openComposeForward(subject: string, quotedText?: string) {
  return getCompose().then(m => m.openComposeForward({ subject, quotedText }));
}

function openThread(t: Thread) {
  // If it's a draft, open in compose panel instead of thread reader
  if (t.label === 'DRAFT') {
    return openDraftInCompose(t);
  }
  return getThreadReader().then(m => {
    m.openThread(t, renderInbox, openSnippetPicker, showFollowupPrompt);
    updateToolbarContextActions();
    updateUnifiedBar({ subject: t.subject || '(no subject)' });
  });
}

async function openDraftInCompose(t: Thread) {
  if (!state.account) return;

  // Local draft — open directly from local_drafts table
  if (t.id.startsWith('local_')) {
    const drafts = await loadLocalDrafts(state.account.id);
    const local = drafts.find(d => d.id === t.id);
    if (local) {
      const compose = await getCompose();
      await compose.openCompose({
        mode: (local.mode as 'new' | 'reply' | 'replyAll' | 'forward') ?? 'new',
        prefillTo: local.to,
        prefillCc: local.cc,
        prefillBcc: local.bcc,
        prefillSubject: local.subject,
        prefillBody: local.htmlBody || local.body,
        draftId: local.gmailDraftId ?? undefined,
        threadId: local.threadId ?? undefined,
        inReplyTo: local.inReplyTo ?? undefined,
      });
      return;
    }
  }

  try {
    const draft = await fetchDraftByThread(state.account, t.gmailThreadId);
    if (!draft) {
      // Fallback: open in thread reader if draft not found via API
      return getThreadReader().then(m => m.openThread(t, renderInbox, openSnippetPicker, showFollowupPrompt));
    }
    const compose = await getCompose();
    // TODO: attachments in drafts are not yet prefilled
    await compose.openCompose({
      mode: 'new',
      prefillTo: draft.to,
      prefillCc: draft.cc,
      prefillSubject: draft.subject,
      prefillBody: draft.body,
      draftId: draft.draftId,
      threadId: t.gmailThreadId,
    });
  } catch {
    // On error, fall back to thread reader
    return getThreadReader().then(m => m.openThread(t, renderInbox, openSnippetPicker, showFollowupPrompt));
  }
}

function renderCommandPalette() {
  getCommandPalette().then(m => m.renderCommandPalette({
    openThread,
    openThreadWithReply,
    openComposeNew,
    switchView,
    showCheatSheet,
    showAuth,
    doArchive: (t, row) => doArchive(t, row, getActionDeps()),
    doToggleStar,
    doMute: (t, row) => doMute(t, row, getActionDeps()),
    doMarkUnread,
    openSnoozePicker,
    removeAccount,
    clearActiveAccountId,
    applyTheme,
    syncAndRender,
    openSettings,
  }));
}

// ── Snippet picker ────────────────────────────────────────
function openSnippetPicker(targetTextarea: HTMLElement | null) {
  document.getElementById('snippet-picker-backdrop')?.remove();

  const snippets = loadSnippets().sort((a, b) => b.usageCount - a.usageCount);

  const backdrop = document.createElement('div');
  backdrop.id = 'snippet-picker-backdrop';

  const picker = document.createElement('div');
  picker.id = 'snippet-picker';

  // Position near compose area or center if none
  if (targetTextarea) {
    const rect = targetTextarea.getBoundingClientRect();
    picker.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`;
    picker.classList.add('snippet-picker--anchored');
  }

  picker.innerHTML = `
    <div class="snippet-picker-search-wrap">
      <span class="snippet-picker-icon">☰</span>
      <input class="snippet-picker-input" id="snippet-picker-input" type="text"
        placeholder="Search snippets…" autocomplete="off" spellcheck="false" />
    </div>
    <div class="snippet-picker-list" id="snippet-picker-list"></div>
    <div class="snippet-picker-footer">
      <button class="snippet-picker-manage-btn" id="snippet-manage-btn">Manage snippets</button>
    </div>`;

  backdrop.appendChild(picker);
  document.body.appendChild(backdrop);

  const input = picker.querySelector<HTMLInputElement>('#snippet-picker-input')!;
  const list = picker.querySelector<HTMLElement>('#snippet-picker-list')!;
  let activeIdx = 0;

  /** Build context from current thread + account for variable auto-resolve */
  function buildSnippetContext(): SnippetContext {
    const thread = state.selectedThreadId
      ? state.threads.find(t => t.id === state.selectedThreadId)
      : null;
    return {
      senderName: thread?.senderName || undefined,
      senderEmail: thread?.senderEmail || undefined,
      myEmail: state.account?.email || undefined,
      myName: undefined, // we don't store display name — derived from email
      subject: thread?.subject || undefined,
    };
  }

  function insertSnippet(s: Snippet) {
    bumpUsage(s.id);

    const ctx = buildSnippetContext();
    const { text: bodyText, unresolved: bodyUnresolved } = resolveVariables(s.body, ctx);
    const { text: titleText, unresolved: titleUnresolved } = resolveVariables(s.title, ctx);

    // Merge unresolved from both title and body (deduplicated)
    const allUnresolved = [...new Set([...titleUnresolved, ...bodyUnresolved])];

    if (allUnresolved.length > 0) {
      showVariableFillDialog(bodyText, titleText, allUnresolved, (finalBody, finalTitle) => {
        close();
        doInsert(finalBody, finalTitle);
      });
    } else {
      close();
      doInsert(bodyText, titleText);
    }
  }

  function doInsert(text: string, title: string) {
    if (!targetTextarea) return;

    // Fill subject line if title has content and subject field exists
    const composePanel = targetTextarea.closest('.compose-panel-new');
    const subjectEl = composePanel?.querySelector<HTMLInputElement>('.compose-subject');
    if (subjectEl && title) {
      // Only fill if subject is empty or user hasn't typed anything
      if (!subjectEl.value.trim()) {
        subjectEl.value = title;
        subjectEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    if (targetTextarea.tagName === 'TEXTAREA') {
      const ta = targetTextarea as HTMLTextAreaElement;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      ta.value = before + text + after;
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      targetTextarea.focus();
      document.execCommand('insertText', false, text);
      targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function showVariableFillDialog(
    partialBody: string,
    partialTitle: string,
    unresolved: string[],
    onComplete: (finalBody: string, finalTitle: string) => void
  ) {
    // Remove picker UI temporarily
    backdrop.style.display = 'none';

    const dialog = document.createElement('div');
    dialog.id = 'snippet-var-dialog';
    dialog.className = 'snippet-var-dialog';
    dialog.innerHTML = `
      <div class="snippet-var-panel">
        <div class="snippet-var-header">Fill in variables</div>
        <div class="snippet-var-fields" id="snippet-var-fields">
          ${unresolved.map(v => `
            <div class="snippet-var-field">
              <label class="snippet-var-label">{{${esc(v)}}}</label>
              <input class="snippet-var-input" data-var="${esc(v)}" type="text"
                placeholder="${esc(v.replace(/_/g, ' '))}" autocomplete="off" />
            </div>
          `).join('')}
        </div>
        <div class="snippet-var-actions">
          <button class="btn-primary snippet-var-insert" id="snippet-var-insert">Insert</button>
          <button class="btn-secondary snippet-var-cancel" id="snippet-var-cancel">Cancel</button>
        </div>
      </div>`;

    document.body.appendChild(dialog);

    const firstInput = dialog.querySelector<HTMLInputElement>('.snippet-var-input');
    firstInput?.focus();

    function submit() {
      const values: Record<string, string> = {};
      dialog.querySelectorAll<HTMLInputElement>('.snippet-var-input').forEach(inp => {
        const varName = inp.dataset.var!;
        values[varName] = inp.value || inp.placeholder;
      });
      dialog.remove();
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      const finalBody = fillVariables(partialBody, values);
      const finalTitle = fillVariables(partialTitle, values);
      onComplete(finalBody, finalTitle);
    }

    function cancel() {
      dialog.remove();
      backdrop.style.display = '';
    }

    dialog.querySelector('#snippet-var-insert')!.addEventListener('click', submit);
    dialog.querySelector('#snippet-var-cancel')!.addEventListener('click', cancel);

    // Enter to submit, Escape to cancel
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
  }

  function renderList(q: string) {
    list.innerHTML = '';
    activeIdx = 0;
    const filtered = q
      ? snippets.filter(s => s.title.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()))
      : snippets;

    if (filtered.length === 0) {
      list.innerHTML = '<div class="snippet-picker-empty">No snippets found</div>';
      return;
    }

    filtered.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'snippet-picker-item' + (i === 0 ? ' active' : '');
      item.dataset.idx = String(i);
      item.innerHTML = `
        <div class="snippet-picker-item-title">${esc(s.title)}</div>
        <div class="snippet-picker-item-body">${esc(s.body)}</div>`;
      item.addEventListener('mouseenter', () => setActive(i));
      item.addEventListener('click', () => insertSnippet(filtered[i]));
      list.appendChild(item);
    });
  }

  function setActive(idx: number) {
    activeIdx = idx;
    list.querySelectorAll<HTMLElement>('.snippet-picker-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      if (i === idx) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function getFiltered(): Snippet[] {
    const q = input.value.trim();
    return q
      ? snippets.filter(s => s.title.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()))
      : snippets;
  }

  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    const items = list.querySelectorAll<HTMLElement>('.snippet-picker-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, items.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const filtered = getFiltered();
      if (filtered[activeIdx]) insertSnippet(filtered[activeIdx]);
      return;
    }
  }
  document.addEventListener('keydown', onKey);

  input.addEventListener('input', () => renderList(input.value.trim()));

  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  document.getElementById('snippet-manage-btn')!.addEventListener('click', () => {
    close();
    openSnippetManager(targetTextarea);
  });

  renderList('');
  input.focus();
}

// ── Snippet manager ───────────────────────────────────────
function openSnippetManager(returnTarget: HTMLElement | null) {
  document.getElementById('snippet-manager-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'snippet-manager-overlay';
  overlay.className = 'snippet-manager-overlay';

  const panel = document.createElement('div');
  panel.className = 'snippet-manager-panel';
  panel.innerHTML = `
    <div class="snippet-manager-header">
      <span class="snippet-manager-title">Manage Snippets</span>
      <button class="btn-icon snippet-manager-close" id="snippet-mgr-close" title="Close">✕</button>
    </div>
    <div class="snippet-manager-body" id="snippet-mgr-body"></div>
    <div class="snippet-manager-footer">
      <button class="snippet-manager-add-btn" id="snippet-mgr-add">+ New Snippet</button>
    </div>`;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  function renderSnippets() {
    const body = document.getElementById('snippet-mgr-body')!;
    const snippets = loadSnippets();
    if (snippets.length === 0) {
      body.innerHTML = '<div class="snippet-mgr-empty">No snippets yet. Add one below.</div>';
      return;
    }
    body.innerHTML = snippets.map(s => `
      <div class="snippet-mgr-row" data-id="${esc(s.id)}">
        <div class="snippet-mgr-info">
          <div class="snippet-mgr-title">${esc(s.title)}</div>
          <div class="snippet-mgr-body-preview">${esc(s.body)}</div>
        </div>
        <div class="snippet-mgr-actions">
          <button class="snippet-mgr-edit-btn" data-id="${esc(s.id)}" title="Edit">✏</button>
          <button class="snippet-mgr-delete-btn" data-id="${esc(s.id)}" title="Delete">🗑</button>
        </div>
      </div>`).join('');

    body.querySelectorAll<HTMLButtonElement>('.snippet-mgr-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => showEditForm(btn.dataset.id!));
    });
    body.querySelectorAll<HTMLButtonElement>('.snippet-mgr-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteSnippet(btn.dataset.id!);
        renderSnippets();
      });
    });
  }

  function showEditForm(id: string | null) {
    const snippets = loadSnippets();
    const existing = id ? snippets.find(s => s.id === id) : null;

    const body = document.getElementById('snippet-mgr-body')!;
    body.innerHTML = `
      <div class="snippet-edit-form">
        <label class="snippet-edit-label">Title</label>
        <input class="snippet-edit-title" id="snippet-edit-title" type="text"
          value="${esc(existing?.title ?? '')}" placeholder="e.g. Thank you" />
        <label class="snippet-edit-label">Body</label>
        <textarea class="snippet-edit-body" id="snippet-edit-body"
          rows="5" placeholder="Snippet text… Use {{variable}} for dynamic values">${esc(existing?.body ?? '')}</textarea>
        <div class="snippet-edit-var-hint" id="snippet-edit-var-hint">
          <span class="snippet-edit-var-hint-label">Available variables:</span>
          ${BUILTIN_VARIABLES.map(v => `<code class="snippet-var-chip">{{${v}}}</code>`).join(' ')}
        </div>
        <div class="snippet-edit-actions">
          <button class="btn-primary snippet-edit-save" id="snippet-edit-save">Save</button>
          <button class="btn-secondary snippet-edit-cancel" id="snippet-edit-cancel">Cancel</button>
        </div>
        <div class="snippet-edit-error" id="snippet-edit-error" style="display:none"></div>
      </div>`;

    const titleInput = document.getElementById('snippet-edit-title') as HTMLInputElement;
    const bodyInput = document.getElementById('snippet-edit-body') as HTMLTextAreaElement;
    const errorEl = document.getElementById('snippet-edit-error')!;

    titleInput.focus();

    document.getElementById('snippet-edit-save')!.addEventListener('click', () => {
      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();
      if (!title) { errorEl.textContent = 'Title is required.'; errorEl.style.display = ''; return; }
      if (!body) { errorEl.textContent = 'Body is required.'; errorEl.style.display = ''; return; }
      if (id) {
        updateSnippet(id, title, body);
      } else {
        saveSnippet(title, body);
      }
      renderSnippets();
    });

    document.getElementById('snippet-edit-cancel')!.addEventListener('click', () => renderSnippets());
  }

  document.getElementById('snippet-mgr-close')!.addEventListener('click', () => {
    close();
    if (returnTarget) openSnippetPicker(returnTarget);
  });

  document.getElementById('snippet-mgr-add')!.addEventListener('click', () => showEditForm(null));

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.addEventListener('keydown', function onEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });

  renderSnippets();
}

// ── Start ─────────────────────────────────────────────────
boot();
