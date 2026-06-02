// main.ts — Kept inbox UI
import { getAllAccounts, startOAuth, migrateTokensToKeychain, removeAccount } from './auth';
import { resolveActiveAccount, clearActiveAccountId } from './accountContext';
import { type Thread, loadThreads, loadRepliedToSenders, loadAllSenderEmails, groupBySection } from './gmail';

import { saveReminder, getOverdueReminders, markReminderNotified, dismissReminder } from './followupReminders';
import { type Snippet, loadSnippets, saveSnippet, deleteSnippet, updateSnippet, bumpUsage } from './snippets';
import { openSettings, initSettings } from './settings';
import { syncAndRender, refreshAll, loadUnifiedThreads, initSync } from './sync';
import { applyTheme, applyLayoutMode, esc } from './helpers';
import { type ViewName, state, setAccount } from './state';
import { openSnoozePicker, setupSnoozeResurface } from './snooze';
import { initSwipeGestures } from './swipe';
import { type ActionDeps, doMarkUnread, doToggleStar, doArchive, doMute } from './actions';
import { openInlineReply } from './inlineReply';
import { icon } from './icons';

// Lazy-loaded modules (not needed on startup — code splitting)
let _composeModule: typeof import('./compose') | null = null;
let _threadReaderModule: typeof import('./threadReader') | null = null;
let _commandPaletteModule: typeof import('./commandPalette') | null = null;

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
  updateBulkBar as _updateBulkBar,
  openBulkSnoozePicker as _openBulkSnoozePicker,
} from './bulk';
import {
  renderInbox as _renderInbox,
  renderSnoozedView as _renderSnoozedView,
  renderStarredView as _renderStarredView,
  renderScheduledView,
  // renderEmptyState is used internally by threadList
  threadRow,
  wireThreadRows,
} from './threadList';
import './search'; // search module self-registers
import { showSearchBar } from './search';
import { initResizeHandle } from './resizeHandle';

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

const VIEWS: Array<{ name: ViewName; icon: string }> = [
  { name: 'Inbox',     icon: icon.email('18px') },
  { name: 'Snoozed',   icon: icon.clock('18px') },
  { name: 'Sent',      icon: icon.send('18px') },
  { name: 'Drafts',    icon: icon.pencil('18px') },
  { name: 'Starred',   icon: icon.star('18px') },
  { name: 'Scheduled', icon: icon.calendar('18px') },
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
  applyTheme(localStorage.getItem('theme') ?? 'light');
  applyLayoutMode(state.layoutMode);

  // Initialize extracted modules
  initSettings({ renderInbox, refreshAll, showAuth, loadUnifiedThreads });
  initSync({ renderInbox, loadUnifiedThreads, refreshKnownSenders });

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
      refreshKnownSenders().catch(() => {});
      await refreshAll();
      setupSnoozeResurface(renderInbox);

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
  overdue.forEach(r => {
    markReminderNotified(r.id);
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `⏰ No reply from <b>${esc(r.sentTo)}</b> — "${esc(r.subject)}" <a class="toast-dismiss">dismiss</a>`;
    toast.querySelector('.toast-dismiss')?.addEventListener('click', () => { dismissReminder(r.id); toast.remove(); });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  });
}

setInterval(checkOverdueReminders, 60000);

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
      <div class="toolbar">
        <button class="btn-icon btn-hamburger" id="btn-hamburger" title="Menu">☰</button>
        <div class="toolbar-search-wrap collapsed" id="toolbar-search-wrap">
          <button class="btn-icon btn-search-toggle" id="btn-search-toggle" title="Search [⌘F]">${icon.search('16px')}</button>
          <div class="search-pill">
            <span class="toolbar-search-icon">${icon.search('14px')}</span>
            <input class="search-input" id="search" placeholder="Search…" type="search" />
          </div>
        </div>
        <div class="toolbar-actions">
          <button class="btn-icon btn-compose" id="btn-compose" title="Compose [c]">${icon.pencil('18px')}</button>
        </div>
      </div>
      <div class="nav-drawer-backdrop" id="nav-drawer-backdrop"></div>
      <nav class="nav-drawer" id="nav-drawer">
        <div class="nav-drawer-header">Kept</div>
        ${VIEWS.map(v => `<button class="nav-drawer-item${v.name === state.currentView ? ' active' : ''}" data-view="${v.name}">${v.icon}<span>${v.name}</span></button>`).join('')}
      </nav>
      <div class="app-body">
        <nav class="sidebar" id="sidebar">
          ${VIEWS.map(v => `<button class="sidebar-btn${v.name === state.currentView ? ' active' : ''}" data-view="${v.name}" title="${v.name}">${v.icon}</button>`).join('')}
          <div class="sidebar-spacer"></div>
          <button class="sidebar-btn sidebar-avatar" id="btn-account" title="Switch account">${getAccountAvatar()}</button>
        </nav>
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
      <div class="settings-panel" id="settings-panel" aria-hidden="true">
        <div class="settings-topbar">
          <button class="settings-back" id="settings-back">← Inbox</button>
          <span class="settings-title">Settings</span>
        </div>
        <div class="settings-body">
          <div class="settings-section">
            <div class="settings-section-label">Accounts</div>
            <div id="settings-accounts-list"></div>
            <button class="settings-add-account" id="settings-add-account">
              <span class="settings-add-account-icon"></span>
              + Add account
            </button>
          </div>
          <div class="settings-divider"></div>
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
            <div class="settings-row" id="settings-layout-row">
              <div class="settings-row-text">
                <div class="settings-row-label">2-pane layout</div>
                <div class="settings-row-sub" id="settings-layout-sub">Hide email preview pane</div>
              </div>
              <button class="settings-toggle" id="settings-layout-toggle" role="switch" aria-checked="false">
                <span class="settings-toggle-thumb"></span>
              </button>
            </div>
          </div>
          <div class="settings-divider"></div>
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
          <div class="settings-divider"></div>
          <div class="settings-section" id="settings-signature-section">
            <div class="settings-section-label">Email Signature</div>
            <textarea class="settings-signature-ta" id="settings-signature-ta"
              placeholder="Your signature…" rows="4"></textarea>
            <div class="signature-preview" id="settings-signature-preview" style="display:none"></div>
            <div class="settings-signature-actions">
              <button class="btn-primary settings-signature-save" id="settings-signature-save">Save</button>
            </div>
          </div>
          <div class="settings-footer">
            <button class="settings-signout" id="settings-signout">Sign out</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-compose')!.addEventListener('click', () => openComposeNew());


  // Sidebar nav + mobile tab buttons + drawer items
  document.querySelectorAll<HTMLButtonElement>('.sidebar-btn, .nav-drawer-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view as ViewName);
      closeNavDrawer();
    });
  });

  // Hamburger menu
  document.getElementById('btn-hamburger')!.addEventListener('click', () => toggleNavDrawer());
  document.getElementById('nav-drawer-backdrop')!.addEventListener('click', () => closeNavDrawer());

  // Resizable pane handle
  initResizeHandle();

  document.getElementById('btn-account')!.addEventListener('click', () => {
    openSettings();
  });

  const searchEl = document.getElementById('search') as HTMLInputElement;
  const searchWrap = document.getElementById('toolbar-search-wrap')!;
  const searchToggle = document.getElementById('btn-search-toggle')!;

  function expandSearch() {
    searchWrap.classList.remove('collapsed');
    searchWrap.classList.add('expanded');
    setTimeout(() => searchEl.focus(), 50);
  }
  function collapseSearch() {
    if (searchEl.value) return; // don't collapse if there's a query
    searchWrap.classList.remove('expanded');
    searchWrap.classList.add('collapsed');
    searchEl.blur();
  }

  searchToggle.addEventListener('click', expandSearch);

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
  // Collapse on click outside
  document.addEventListener('click', (e) => {
    if (searchWrap.classList.contains('expanded') && !searchWrap.contains(e.target as Node)) {
      collapseSearch();
    }
  });

  // Keyboard shortcuts (skip when focus is in an input/textarea)
  function handleKey(e: KeyboardEvent) {
    // Cmd/Ctrl+F: expand search bar (prevent browser find)
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      expandSearch();
      return;
    }
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
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
function switchView(view: ViewName) {
  state.currentView = view;
  // Update sidebar + mobile tab buttons + drawer items
  document.querySelectorAll<HTMLButtonElement>('.sidebar-btn, .nav-drawer-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  // Render appropriate content
  if (view === 'Inbox') {
    // Reload inbox threads from DB (may have been overwritten by label views)
    reloadInboxThreads();
  } else if (view === 'Snoozed') {
    renderSnoozedView();
  } else if (view === 'Starred') {
    renderStarredView();
  } else if (view === 'Scheduled') {
    renderScheduledView();
  } else {
    renderLabelView(view);
  }
}

/** Reload inbox threads from the local DB and render immediately. */
async function reloadInboxThreads() {
  if (!state.account) return;
  if (state.unifiedMode) {
    state.threads = await loadUnifiedThreads();
  } else {
    state.threads = await loadThreads(state.account.id);
  }
  renderInbox();
}

function renderLabelView(view: ViewName) {
  const container = document.getElementById('inbox');
  if (!container) return;
  const VIEW_TO_LABEL: Record<string, string> = { Sent: 'SENT', Drafts: 'DRAFT', Starred: 'STARRED', Trash: 'TRASH', Archive: 'ARCHIVE' };
  const gmailLabel = VIEW_TO_LABEL[view];
  if (!state.account || !gmailLabel) return;
  loadThreads(state.account.id, gmailLabel).then(ts => {
    // Don't overwrite state.threads — render label view in-place
    if (state.currentView !== view) return; // user already navigated away
    const container = document.getElementById('inbox');
    if (!container) return;
    // Render using the same thread row template but with label-specific data
    const sections = groupBySection(ts);
    const html = sections.map(s => {
      return `
      <div class="section-header">${s.label}</div>
      ${s.threads.map(t => threadRow(t, false)).join('')}`;
    }).join('');
    container.innerHTML = html || `<div class="empty-state"><div class="empty-text">No ${view.toLowerCase()} messages</div></div>`;
    wireThreadRows(container, ts, false, getThreadListDeps());
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
    openSearchBar: () => showSearchBar({ renderInbox, openThread }),
    syncAndRender,
  });
}

function exitBulkMode() { _exitBulkMode(renderInbox); }
function toggleBulkSelection(id: string, shiftKey?: boolean) { _toggleBulkSelection(id, updateBulkBar, shiftKey); }
function updateBulkBar() { _updateBulkBar(getActionDeps, exitBulkMode, openBulkSnoozePicker); }
function openBulkSnoozePicker(ids: string[], anchorRow: HTMLElement) { _openBulkSnoozePicker(ids, anchorRow, exitBulkMode); }

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

function renderInbox() { _renderInbox(getThreadListDeps()); }
function renderSnoozedView() { return _renderSnoozedView(getThreadListDeps()); }
function renderStarredView() { return _renderStarredView(getThreadListDeps()); }

function openComposeNew(prefillSubject = '') {
  return getCompose().then(m => m.openComposeNew(prefillSubject, openSnippetPicker, showFollowupPrompt));
}

function openComposeForward(subject: string, quotedText?: string) {
  return getCompose().then(m => m.openComposeForward({ subject, quotedText }));
}

function openThread(t: Thread) {
  return getThreadReader().then(m => m.openThread(t, renderInbox, openSnippetPicker, showFollowupPrompt));
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

  function insertSnippet(s: Snippet) {
    bumpUsage(s.id);
    close();
    if (!targetTextarea) return;
    if (targetTextarea.tagName === 'TEXTAREA') {
      const ta = targetTextarea as HTMLTextAreaElement;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      ta.value = before + s.body + after;
      const pos = start + s.body.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      targetTextarea.focus();
      document.execCommand('insertText', false, s.body);
      targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
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
      <button class="btn-icon snippet-manager-close" id="snippet-mgr-close">✕</button>
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
          rows="5" placeholder="Snippet text…">${esc(existing?.body ?? '')}</textarea>
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
