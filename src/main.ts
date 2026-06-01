// main.ts — Kept inbox UI
import { getAllAccounts, removeAccount, saveAccount, startOAuth } from './auth';
import { resolveActiveAccount, clearActiveAccountId } from './accountContext';
import { type Thread, syncInbox, loadThreads, loadRepliedToSenders, loadAllSenderEmails, hasSyncedBefore, groupBySection, invalidateSectionCache } from './gmail';

import { notifyNewThreads, updateBadge, ensureNotificationPermission } from './notifications';
import { saveReminder, getOverdueReminders, markReminderNotified, dismissReminder } from './followupReminders';
import { type Snippet, loadSnippets, saveSnippet, deleteSnippet, updateSnippet, bumpUsage } from './snippets';
import { applyTheme, applyLayoutMode, toggleLayoutMode, setStatus, esc } from './helpers';
import { type ViewName, state, setAccount } from './state';
import { openSnoozePicker, setupSnoozeResurface } from './snooze';
import { initSwipeGestures } from './swipe';
import { type ActionDeps, doMarkUnread, doToggleStar, doArchive, doMute } from './actions';
import { openInlineReply } from './inlineReply';
import { icon } from './icons';
import { NOISE_PREFIXES } from './newSenders';

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

function toggleFocusMode() {
  state.focusMode = !state.focusMode;
  localStorage.setItem('focusMode', String(state.focusMode));
  const btn = document.getElementById('btn-focus');
  if (btn) btn.classList.toggle('focus-active', state.focusMode);
  renderInbox();
}


function isKnownSender(email: string): boolean {
  const lower = email.toLowerCase();
  if (state.knownSenders.has(lower)) return true;
  // Fallback: filter out obvious noise patterns
  return !NOISE_PREFIXES.some(p => lower.startsWith(p));
}

function applyFocusFilter(list: Thread[]): { visible: Thread[]; hiddenCount: number } {
  if (!state.focusMode) return { visible: list, hiddenCount: 0 };
  const visible = list.filter(t => isKnownSender(t.senderEmail));
  return { visible, hiddenCount: list.length - visible.length };
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

  // Show auth screen immediately — don't block on DB
  showAuth();

  // Check if we're inside a real Tauri window
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    // Browser-only dev: just show the login screen, no DB
    return;
  }

  try {
    state.accounts = await getAllAccounts();
    state.account = await resolveActiveAccount();
    if (state.account) {
      showShell();
      refreshKnownSenders().catch(() => {});
      await refreshAll();
      setupSnoozeResurface(renderInbox);
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
        <button class="btn-icon btn-compose" id="btn-compose" title="New message [c]">${icon.pencil('18px')}</button>
        ${VIEWS.map(v => `<button class="tab-btn mobile-tab-btn${v.name === state.currentView ? ' active' : ''}" data-view="${v.name}">${v.name}</button>`).join('')}
        <input class="search-input" id="search" placeholder="Search…" type="search" />
        <button class="btn-icon btn-focus${state.focusMode ? ' focus-active' : ''}" id="btn-focus" title="Focus mode — show only known senders [Shift+F]">◎</button>
      </div>
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
        <span id="status-left">${state.account?.email ?? ''}</span>
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

  document.getElementById('btn-focus')!.addEventListener('click', () => toggleFocusMode());

  // Sidebar nav + mobile tab buttons
  document.querySelectorAll<HTMLButtonElement>('.sidebar-btn, .mobile-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view as ViewName));
  });

  // Resizable pane handle
  initResizeHandle();

  document.getElementById('btn-account')!.addEventListener('click', () => {
    openSettings();
  });

  const searchEl = document.getElementById('search') as HTMLInputElement;
  searchEl.addEventListener('input', () => {
    state.searchQuery = searchEl.value;
    if (searchDebounce !== null) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      if (!state.account) return;
      state.threads = await loadThreads(state.account.id, state.searchQuery || undefined);
      renderInbox();
    }, 200);
  });
  searchEl.addEventListener('focus', () => searchEl.classList.add('expanded'));
  searchEl.addEventListener('blur', () => { if (!searchEl.value) searchEl.classList.remove('expanded'); });

  // Keyboard shortcuts (skip when focus is in an input/textarea)
  function handleKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey) openComposeNew();
  }
  document.addEventListener('keydown', handleKey);
  registerKeyboardShortcuts();

  initSwipeGestures({ getActionDeps });

  // Expose hooks for native menu events (Tauri)
  (window as any).__kept_sync = () => syncAndRender();
  (window as any).__kept_settings = () => openSettings();
}

// ── Settings panel ─────────────────────────────────────────
function openSettings() {
  const shell = document.getElementById('app-shell');
  const panel = document.getElementById('settings-panel');
  if (!shell || !panel) return;

  // Render state.accounts list
  renderSettingsAccounts();

  // Sync dark mode toggle state
  const currentTheme = localStorage.getItem('theme') ?? 'light';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const toggle = document.getElementById('settings-darkmode-toggle') as HTMLButtonElement;
  const sub = document.getElementById('settings-darkmode-sub');
  if (toggle) {
    toggle.setAttribute('aria-checked', String(isDark));
    toggle.classList.toggle('on', isDark);
  }
  const themeLabel = currentTheme === 'system' ? 'Following system preference' : isDark ? 'Currently using dark theme' : 'Switch to dark theme';
  if (sub) sub.textContent = themeLabel;

  // Sync smart notifications toggle state
  const smartNotifToggle = document.getElementById('settings-smartnotif-toggle') as HTMLButtonElement;
  const smartNotifSub = document.getElementById('settings-smartnotif-sub');
  const smartOn = localStorage.getItem('smartNotifications') !== 'false';
  if (smartNotifToggle) {
    smartNotifToggle.setAttribute('aria-checked', String(smartOn));
    smartNotifToggle.classList.toggle('on', smartOn);
  }
  if (smartNotifSub) smartNotifSub.textContent = smartOn ? 'Only notify for known senders' : 'Notify for all new threads';

  // Wire back button
  document.getElementById('settings-back')!.addEventListener('click', closeSettings, { once: true });

  // Wire smart notifications toggle
  smartNotifToggle?.addEventListener('click', () => {
    const nowOn = localStorage.getItem('smartNotifications') !== 'false';
    const next = !nowOn;
    localStorage.setItem('smartNotifications', String(next));
    smartNotifToggle.setAttribute('aria-checked', String(next));
    smartNotifToggle.classList.toggle('on', next);
    const subEl = document.getElementById('settings-smartnotif-sub');
    if (subEl) subEl.textContent = next ? 'Only notify for known senders' : 'Notify for all new threads';
  }, { once: true });

  // Wire dark mode toggle (once: true prevents listener accumulation on repeated open/close)
  toggle?.addEventListener('click', () => {
    const cur = localStorage.getItem('theme') ?? 'light';
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
    applyTheme(next);
    const nowDark = document.documentElement.getAttribute('data-theme') === 'dark';
    toggle.setAttribute('aria-checked', String(nowDark));
    toggle.classList.toggle('on', nowDark);
    const subEl = document.getElementById('settings-darkmode-sub');
    const label = next === 'system' ? 'Following system preference' : nowDark ? 'Currently using dark theme' : 'Switch to dark theme';
    if (subEl) subEl.textContent = label;
  }, { once: true });

  // Sync layout toggle state
  const layoutToggle = document.getElementById('settings-layout-toggle') as HTMLButtonElement;
  const layoutSub = document.getElementById('settings-layout-sub');
  const is2Pane = state.layoutMode === '2-pane';
  if (layoutToggle) {
    layoutToggle.setAttribute('aria-checked', String(is2Pane));
    layoutToggle.classList.toggle('on', is2Pane);
  }
  if (layoutSub) layoutSub.textContent = is2Pane ? 'Showing list only, click to read' : 'Hide email preview pane';

  // Wire layout toggle
  layoutToggle?.addEventListener('click', () => {
    toggleLayoutMode();
    const nowIs2 = state.layoutMode === '2-pane';
    layoutToggle.setAttribute('aria-checked', String(nowIs2));
    layoutToggle.classList.toggle('on', nowIs2);
    const subEl = document.getElementById('settings-layout-sub');
    if (subEl) subEl.textContent = nowIs2 ? 'Showing list only, click to read' : 'Hide email preview pane';
  }, { once: true });

  // Wire sign out (once: true prevents duplicate confirm dialogs on repeated open/close)
  const signoutBtn = document.getElementById('settings-signout') as HTMLButtonElement;
  signoutBtn?.addEventListener('click', async () => {
    if (!confirm('Sign out of all accounts? This will delete all local data.')) return;
    signoutBtn.disabled = true;
    signoutBtn.textContent = 'Signing out…';
    try {
      for (const a of state.accounts) {
        await removeAccount(a).catch(e => console.error('Remove error:', e));
      }
    } finally {
      clearActiveAccountId();
      state.account = null;
      state.accounts = [];
      state.threads = [];
      state.syncing = false;
      showAuth();
    }
  }, { once: true });

  // Load and wire signature editor
  const sigTa = document.getElementById('settings-signature-ta') as HTMLTextAreaElement;
  const sigPreview = document.getElementById('settings-signature-preview') as HTMLElement;
  const sigSaveBtn = document.getElementById('settings-signature-save') as HTMLButtonElement;
  if (sigTa && state.account) {
    sigTa.value = state.account.signature ?? '';
    if (sigTa.value) {
      sigPreview.textContent = sigTa.value;
      sigPreview.style.display = 'block';
    }
    sigTa.addEventListener('input', () => {
      if (sigTa.value.trim()) {
        sigPreview.textContent = sigTa.value;
        sigPreview.style.display = 'block';
      } else {
        sigPreview.style.display = 'none';
      }
    });
    sigSaveBtn.addEventListener('click', async () => {
      if (!state.account) return;
      const updated = { ...state.account, signature: sigTa.value };
      await saveAccount(updated);
      state.account = updated;
      const idx = state.accounts.findIndex(a => a.id === updated.id);
      if (idx >= 0) state.accounts[idx] = updated;
      sigSaveBtn.textContent = 'Saved';
      setTimeout(() => { sigSaveBtn.textContent = 'Save'; }, 1500);
    });
  }

  // Wire add state.account (once: true prevents duplicate OAuth launches on repeated open/close)
  document.getElementById('settings-add-account')!.addEventListener('click', async () => {
    try {
      const newAcct = await startOAuth();
      const existing = state.accounts.find(a => a.id === newAcct.id);
      if (existing) {
        const idx = state.accounts.indexOf(existing);
        state.accounts[idx] = newAcct;
        setStatus(`${newAcct.email} token refreshed`);
      } else {
        state.accounts.push(newAcct);
        setStatus(`${newAcct.email} added`);
      }
      renderSettingsAccounts();
    } catch (e) {
      setStatus(`Add account failed: ${e}`);
    }
    setTimeout(() => setStatus(''), 5000);
  });

  // Animate in
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  shell.classList.add('settings-open');
}

function closeSettings() {
  const shell = document.getElementById('app-shell');
  const panel = document.getElementById('settings-panel');
  if (!shell || !panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  shell.classList.remove('settings-open');
}

function renderSettingsAccounts() {
  const list = document.getElementById('settings-accounts-list');
  if (!list) return;
  const avatarColors = ['#7c6fa8', '#5b8dd9', '#7cb9a8', '#d97c5b', '#c47cad'];
  list.innerHTML = state.accounts.map((a, i) => {
    const initial = (a.email[0] ?? '?').toUpperCase();
    const color = avatarColors[i % avatarColors.length];
    const isOnly = state.accounts.length === 1;
    return `
      <div class="settings-account-row" data-id="${esc(a.id)}">
        <div class="settings-avatar" style="background:${color}">${initial}</div>
        <div class="settings-account-info">
          <div class="settings-account-name">${esc(a.email.split('@')[0])}</div>
          <div class="settings-account-email">${esc(a.email)}</div>
        </div>
        <button class="settings-account-remove" data-id="${esc(a.id)}" title="Remove account"
          ${isOnly ? 'disabled' : ''} aria-label="Remove ${esc(a.email)}">×</button>
      </div>`;
  }).join('');

  // Wire remove buttons
  list.querySelectorAll<HTMLButtonElement>('.settings-account-remove').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', async () => {
      const removeId = btn.dataset.id!;
      const target = state.accounts.find(a => a.id === removeId);
      if (!target) return;
      if (!confirm(`Remove ${target.email} from Kept?\n\nThis will delete all local data for this account.`)) return;
      try {
        await removeAccount(target);
        state.accounts = state.accounts.filter(a => a.id !== removeId);
        if (state.account?.id === removeId) {
          const next = state.accounts[0] ?? null;
          if (next) {
            setAccount(next);
            state.threads = await loadThreads(next.id);
            closeSettings();
            renderInbox();
            await refreshAll();
          } else {
            clearActiveAccountId();
            state.account = null;
            state.threads = [];
            state.syncing = false;
            showAuth();
          }
        } else {
          renderSettingsAccounts();
        }
      } catch (err) {
        console.error('Remove account error:', err);
        setStatus('Failed to remove account');
      }
    });
  });
}

// ── View switching ────────────────────────────────────────
function switchView(view: ViewName) {
  state.currentView = view;
  // Update sidebar + mobile tab buttons
  document.querySelectorAll<HTMLButtonElement>('.sidebar-btn, .mobile-tab-btn').forEach(btn => {
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
  const VIEW_TO_LABEL: Record<string, string> = { Sent: 'SENT', Drafts: 'DRAFT', Starred: 'STARRED' };
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

// ── Sync ──────────────────────────────────────────────────
/** On boot: load active state.account state.threads, then kick off parallel sync for all state.accounts. */
async function refreshAll() {
  if (!state.account) return;

  if (state.unifiedMode) {
    state.threads = await loadUnifiedThreads();
  } else {
    state.threads = await loadThreads(state.account.id);
  }
  renderInbox();

  // Request notification permission early (non-blocking)
  ensureNotificationPermission().catch(() => {});

  // Parallel sync — one per state.account, errors are non-fatal per state.account
  const allAccts = await getAllAccounts();
  const syncPromises = allAccts.map(acct =>
    syncInbox(acct, acct.id === state.account!.id ? n => setStatus(`Syncing… ${n} state.threads`) : undefined)
      .catch(err => console.error(`Sync error for ${acct.email}:`, err))
  );
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  setStatus('Syncing…');
  await Promise.all(syncPromises);
  if (btn) btn.style.opacity = '';
  invalidateSectionCache();
  if (state.unifiedMode) {
    state.threads = await loadUnifiedThreads();
  } else {
    state.threads = await loadThreads(state.account.id);
  }
  renderInbox();
  setStatus(`Synced — ${state.threads.length} state.threads`);
  setTimeout(() => setStatus(''), 5000);
}

/** KPT-037: Load and merge inbox state.threads from all state.accounts, sorted by receivedAt desc. */
async function loadUnifiedThreads(): Promise<Thread[]> {
  const allAccts = await getAllAccounts();
  const perAccount = await Promise.all(allAccts.map(a => loadThreads(a.id).catch(() => [] as Thread[])));
  const merged = perAccount.flat();
  merged.sort((a, b) => b.receivedAt - a.receivedAt);
  return merged;
}

function getActionDeps(): ActionDeps {
  return { renderInbox, loadUnifiedThreads };
}

async function syncAndRender() {
  if (state.syncing || !state.account) return;
  state.syncing = true;
  setStatus('Syncing…');
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  try {
    if (state.unifiedMode) {
      // Sync all state.accounts in parallel
      const allAccts = await getAllAccounts();
      await Promise.all(allAccts.map(a =>
        syncInbox(a, a.id === state.account!.id ? n => setStatus(`Syncing… ${n} state.threads`) : undefined)
          .catch(err => console.error(`Sync error for ${a.email}:`, err))
      ));
      state.threads = await loadUnifiedThreads();
      renderInbox();
      setStatus(`Synced — ${state.threads.length} threads`);
    } else {
      // Capture thread IDs known before sync to detect new arrivals
      const preSync = await loadThreads(state.account.id);
      const knownIds = new Set(preSync.map(t => t.id));
      // Gate: only send notifications on second+ sync (historyId already set)
      const isSubsequentSync = await hasSyncedBefore(state.account.id);

      await syncInbox(state.account, n => setStatus(`Syncing… ${n} threads`));
      state.threads = await loadThreads(state.account.id);
      renderInbox();
      setStatus(`Synced — ${state.threads.length} threads`);

      // Refresh known-senders after sync (SENT folder may have grown)
      refreshKnownSenders().catch(() => {});

      // Fire notifications for newly-arrived state.threads (not first sync)
      if (isSubsequentSync) {
        const newThreads = state.threads.filter(t => !knownIds.has(t.id));
        if (newThreads.length > 0) {
          const smartNotifs = localStorage.getItem('smartNotifications') !== 'false';
          const toNotify = smartNotifs
            ? newThreads.filter(t => state.knownSenders.has(t.senderEmail.toLowerCase()))
            : newThreads;
          if (toNotify.length > 0) {
            notifyNewThreads(toNotify.map(t => ({ senderName: t.senderName, subject: t.subject }))).catch(() => {});
          }
        }
      }
    }

    // Update tray badge / dock badge with total unread count
    const unreadCount = state.threads.filter(t => t.isUnread).length;
    updateBadge(unreadCount).catch(() => {});
  } catch (e) {
    console.error('Sync error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(`Sync error: ${msg}`);
    // Show error in inbox if it's empty so user sees it
    if (state.threads.length === 0) {
      const container = document.getElementById('inbox');
      if (container) container.innerHTML = `
        <div class="empty-state" style="color:var(--text-muted)">
          <div style="font-size:24px">⚠</div>
          <div>Sync failed</div>
          <div style="font-size:12px; margin-top:4px; max-width:320px; word-break:break-all">${esc(msg)}</div>
        </div>`;
    }
  } finally {
    state.syncing = false;
    if (btn) btn.style.opacity = '';
    setTimeout(() => setStatus(''), 5000);
  }
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
    switchView,
    toggleFocusMode,
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
function toggleBulkSelection(id: string) { _toggleBulkSelection(id, updateBulkBar); }
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
    applyFocusFilter,
  };
}

function renderInbox() { _renderInbox(getThreadListDeps()); }
function renderSnoozedView() { return _renderSnoozedView(getThreadListDeps()); }
function renderStarredView() { return _renderStarredView(getThreadListDeps()); }

function openComposeNew(prefillSubject = '') {
  return getCompose().then(m => m.openComposeNew(prefillSubject, openSnippetPicker, showFollowupPrompt));
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
