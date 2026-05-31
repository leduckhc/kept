// main.ts — Kept inbox UI
import { getAllAccounts, removeAccount, startOAuth } from './auth';
import { resolveActiveAccount, clearActiveAccountId } from './accountContext';
import { type Thread, syncInbox, loadThreads, loadSnoozedThreads, loadStarredThreads, loadRepliedToSenders, groupBySection, hasSyncedBefore } from './gmail';

import { notifyNewThreads, updateBadge, ensureNotificationPermission } from './notifications';
import { type ScheduledEmail, loadScheduled, cancelScheduled } from './scheduledSend';
import { saveReminder, getOverdueReminders, markReminderNotified, getActiveReminderThreadIds, dismissReminder } from './followupReminders';
import { type Snippet, loadSnippets, saveSnippet, deleteSnippet, updateSnippet, bumpUsage } from './snippets';
import { applyTheme, setStatus, esc, formatDate, toDatetimeLocal } from './helpers';
import { avatarHtml, ACCOUNT_BADGE_COLORS } from './avatar';
import { type InboxTab, type ViewName, state, setAccount } from './state';
import { snoozePresets, openSnoozePicker, doSnooze, setupSnoozeResurface } from './snooze';
import { type ActionDeps, doMarkRead, doMarkUnread, doToggleStar, doArchive, doBlock, doUnsnooze, doMute } from './actions';
import { showContextMenu } from './contextMenu';
import { openInlineReply } from './inlineReply';
import { openComposeNew as _openComposeNew } from './compose';
import { openThread as _openThread } from './threadReader';
import { renderCommandPalette as _renderCommandPalette } from './commandPalette';

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

const VIEWS: Array<{ name: ViewName; icon: string }> = [
  { name: 'Inbox',     icon: '✉' },
  { name: 'Snoozed',   icon: '🕐' },
  { name: 'Sent',      icon: '↗' },
  { name: 'Drafts',    icon: '✏' },
  { name: 'Starred',   icon: '★' },
  { name: 'Scheduled', icon: '⏰' },
];

async function refreshKnownSenders() {
  if (!state.accounts.length) return;
  const allEmails = await Promise.all(state.accounts.map(a => loadRepliedToSenders(a.id).catch(() => [] as string[])));
  state.knownSenders = new Set(allEmails.flat().map(e => e.toLowerCase()));
}

function toggleFocusMode() {
  state.focusMode = !state.focusMode;
  localStorage.setItem('state.focusMode', String(state.focusMode));
  const btn = document.getElementById('btn-focus');
  if (btn) btn.classList.toggle('focus-active', state.focusMode);
  renderInbox();
}

const NOISE_PREFIXES = ['noreply@', 'no-reply@', 'newsletter@', 'marketing@', 'donotreply@', 'notifications@', 'updates@', 'news@', 'info@', 'hello@', 'support@', 'mailer@'];

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

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  applyTheme(localStorage.getItem('theme') ?? 'light');

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
    toast.innerHTML = `⏰ No reply from <b>${r.sentTo}</b> — "${r.subject}" <a class="toast-dismiss">dismiss</a>`;
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
    <div id="app-shell">
      <div class="toolbar">
        <button class="btn-icon btn-compose" id="btn-compose" title="New message [c]">✏</button>
        ${VIEWS.map(v => `<button class="tab-btn${v.name === state.currentView ? ' active' : ''}" data-view="${v.name}">${v.name}</button>`).join('')}
        <input class="search-input" id="search" placeholder="Search…" type="search" />
        <button class="btn-icon btn-focus${state.focusMode ? ' focus-active' : ''}" id="btn-focus" title="Focus mode — show only known senders [Shift+F]">◎</button>
        <button class="btn-icon state.account-picker-btn" id="btn-state.account" title="Switch state.account" style="font-size:13px">${state.account?.email?.split('@')[0] ?? '…'} ▾</button>
        <button class="btn-icon btn-menu" id="btn-menu" title="More options">⋮</button>
      </div>
      <div class="inbox" id="inbox"></div>
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
            <div id="settings-state.accounts-list"></div>
            <button class="settings-add-state.account" id="settings-add-state.account">
              <span class="settings-add-state.account-icon"></span>
              + Add state.account
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
          <div class="settings-footer">
            <button class="settings-signout" id="settings-signout">Sign out</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-compose')!.addEventListener('click', () => openComposeNew());

  document.getElementById('btn-focus')!.addEventListener('click', () => toggleFocusMode());

  // Tab buttons
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view as ViewName));
  });

  // ⋮ menu
  document.getElementById('btn-menu')!.addEventListener('click', () => showToolbarMenu());

  document.getElementById('btn-state.account')!.addEventListener('click', () => {
    showAccountMenu();
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
}

// ── Settings panel ─────────────────────────────────────────
function openSettings() {
  const shell = document.getElementById('app-shell');
  const panel = document.getElementById('settings-panel');
  if (!shell || !panel) return;

  // Render state.accounts list
  renderSettingsAccounts();

  // Sync dark mode toggle state
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const toggle = document.getElementById('settings-darkmode-toggle') as HTMLButtonElement;
  const sub = document.getElementById('settings-darkmode-sub');
  if (toggle) {
    toggle.setAttribute('aria-checked', String(isDark));
    toggle.classList.toggle('on', isDark);
  }
  if (sub) sub.textContent = isDark ? 'Currently using dark theme' : 'Switch to dark theme';

  // Sync smart notifications toggle state
  const smartNotifToggle = document.getElementById('settings-smartnotif-toggle') as HTMLButtonElement;
  const smartNotifSub = document.getElementById('settings-smartnotif-sub');
  const smartOn = localStorage.getItem('smartNotifications') !== 'false';
  if (smartNotifToggle) {
    smartNotifToggle.setAttribute('aria-checked', String(smartOn));
    smartNotifToggle.classList.toggle('on', smartOn);
  }
  if (smartNotifSub) smartNotifSub.textContent = smartOn ? 'Only notify for known senders' : 'Notify for all new state.threads';

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
    if (subEl) subEl.textContent = next ? 'Only notify for known senders' : 'Notify for all new state.threads';
  }, { once: true });

  // Wire dark mode toggle (once: true prevents listener accumulation on repeated open/close)
  toggle?.addEventListener('click', () => {
    const nowDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = nowDark ? 'light' : 'dark';
    applyTheme(next);
    toggle.setAttribute('aria-checked', String(!nowDark));
    toggle.classList.toggle('on', !nowDark);
    const subEl = document.getElementById('settings-darkmode-sub');
    if (subEl) subEl.textContent = !nowDark ? 'Currently using dark theme' : 'Switch to dark theme';
  }, { once: true });

  // Wire sign out (once: true prevents duplicate confirm dialogs on repeated open/close)
  const signoutBtn = document.getElementById('settings-signout') as HTMLButtonElement;
  signoutBtn?.addEventListener('click', async () => {
    if (!confirm('Sign out of all state.accounts? This will delete all local data.')) return;
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

  // Wire add state.account (once: true prevents duplicate OAuth launches on repeated open/close)
  document.getElementById('settings-add-state.account')!.addEventListener('click', async () => {
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
      setStatus(`Add state.account failed: ${e}`);
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
  const list = document.getElementById('settings-state.accounts-list');
  if (!list) return;
  const avatarColors = ['#7c6fa8', '#5b8dd9', '#7cb9a8', '#d97c5b', '#c47cad'];
  list.innerHTML = state.accounts.map((a, i) => {
    const initial = (a.email[0] ?? '?').toUpperCase();
    const color = avatarColors[i % avatarColors.length];
    const isOnly = state.accounts.length === 1;
    return `
      <div class="settings-state.account-row" data-id="${esc(a.id)}">
        <div class="settings-avatar" style="background:${color}">${initial}</div>
        <div class="settings-state.account-info">
          <div class="settings-state.account-name">${esc(a.email.split('@')[0])}</div>
          <div class="settings-state.account-email">${esc(a.email)}</div>
        </div>
        <button class="settings-state.account-remove" data-id="${esc(a.id)}" title="Remove state.account"
          ${isOnly ? 'disabled' : ''} aria-label="Remove ${esc(a.email)}">×</button>
      </div>`;
  }).join('');

  // Wire remove buttons
  list.querySelectorAll<HTMLButtonElement>('.settings-state.account-remove').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', async () => {
      const removeId = btn.dataset.id!;
      const target = state.accounts.find(a => a.id === removeId);
      if (!target) return;
      if (!confirm(`Remove ${target.email} from Kept?\n\nThis will delete all local data for this state.account.`)) return;
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
        console.error('Remove state.account error:', err);
        setStatus('Failed to remove state.account');
      }
    });
  });
}

// ── View switching ────────────────────────────────────────
function switchView(view: ViewName) {
  state.currentView = view;
  // Update tab buttons
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  // Render appropriate content
  if (view === 'Inbox') {
    renderInbox();
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

function renderLabelView(view: ViewName) {
  const container = document.getElementById('inbox');
  if (!container) return;
  const VIEW_TO_LABEL: Record<string, string> = { Sent: 'SENT', Drafts: 'DRAFT', Starred: 'STARRED' };
  const gmailLabel = VIEW_TO_LABEL[view];
  if (!state.account || !gmailLabel) return;
  loadThreads(state.account.id, gmailLabel).then(ts => {
    state.threads = ts;
    renderInbox();
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
      setStatus(`Synced — ${state.threads.length} state.threads`);
    } else {
      // Capture thread IDs known before sync to detect new arrivals
      const preSync = await loadThreads(state.account.id);
      const knownIds = new Set(preSync.map(t => t.id));
      // Gate: only send notifications on second+ sync (historyId already set)
      const isSubsequentSync = await hasSyncedBefore(state.account.id);

      await syncInbox(state.account, n => setStatus(`Syncing… ${n} state.threads`));
      state.threads = await loadThreads(state.account.id);
      renderInbox();
      setStatus(`Synced — ${state.threads.length} state.threads`);

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
          <div style="font-size:12px; margin-top:4px; max-width:320px; word-break:break-all">${msg}</div>
        </div>`;
    }
  } finally {
    state.syncing = false;
    if (btn) btn.style.opacity = '';
    setTimeout(() => setStatus(''), 5000);
  }
}

// ── Toolbar ⋮ menu ────────────────────────────────────────
function showToolbarMenu() {
  document.getElementById('toolbar-menu-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'toolbar-menu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const menu = document.createElement('div');
  menu.className = 'toolbar-menu';
  menu.innerHTML = `
    <button class="toolbar-menu-item" id="tmenu-sync">Sync</button>
    <button class="toolbar-menu-item" id="tmenu-select">Select mode</button>
    <button class="toolbar-menu-item" id="tmenu-settings">Settings</button>
  `;
  overlay.appendChild(menu);
  document.body.appendChild(overlay);

  document.getElementById('tmenu-sync')!.addEventListener('click', () => { overlay.remove(); syncAndRender(); });
  document.getElementById('tmenu-select')!.addEventListener('click', () => { overlay.remove(); toggleBulkMode(); });
  document.getElementById('tmenu-settings')!.addEventListener('click', () => { overlay.remove(); openSettings(); });
}

// ── Account menu ──────────────────────────────────────────
function showAccountMenu() {
  // Remove any existing menu
  document.getElementById('state.account-menu-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'state.account-menu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const menu = document.createElement('div');
  menu.className = 'state.account-menu';
  menu.innerHTML = `
    <div class="state.account-menu-header">Accounts</div>
    ${state.accounts.length > 1 ? `
      <button class="state.account-menu-item${state.unifiedMode ? ' active' : ''}" id="btn-all-state.accounts">
        <span class="state.account-email">All Accounts</span>
        ${state.unifiedMode ? '<span class="state.account-active-badge">active</span>' : ''}
      </button>` : ''}
    ${state.accounts.map((a, i) => `
      <button class="state.account-menu-item${!state.unifiedMode && a.id === state.account?.id ? ' active' : ''}" data-id="${a.id}">
        <span class="state.account-badge-dot" style="background:${ACCOUNT_BADGE_COLORS[i % ACCOUNT_BADGE_COLORS.length]}"></span>
        <span class="state.account-email">${esc(a.email)}</span>
        ${!state.unifiedMode && a.id === state.account?.id ? '<span class="state.account-active-badge">active</span>' : ''}
        <button class="state.account-remove-btn" data-remove-id="${a.id}" title="Remove state.account">×</button>
      </button>`).join('')}
    <button class="state.account-menu-add" id="btn-add-state.account">+ Add state.account</button>
    <hr style="border:none;border-top:1px solid var(--border);margin:4px 0"/>
    <button class="state.account-menu-signout" id="btn-signout-all">Sign out of all state.accounts</button>
  `;

  overlay.appendChild(menu);
  document.body.appendChild(overlay);

  // All Accounts unified mode
  document.getElementById('btn-all-state.accounts')?.addEventListener('click', async () => {
    overlay.remove();
    state.unifiedMode = true;
    const acctBtn = document.getElementById('btn-state.account');
    if (acctBtn) acctBtn.textContent = 'All Accounts ▾';
    const statusLeft = document.getElementById('status-left');
    if (statusLeft) statusLeft.textContent = 'All Accounts';
    await refreshAll();
  });

  // Switch state.account
  menu.querySelectorAll<HTMLButtonElement>('.account-menu-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if ((e.target as HTMLElement).closest('.account-remove-btn')) return;
      const id = btn.dataset.id!;
      if (!id) return; // "All Accounts" button has no data-id
      const target = state.accounts.find(a => a.id === id);
      if (!target) { overlay.remove(); return; }
      if (!state.unifiedMode && target.id === state.account?.id) { overlay.remove(); return; }
      state.unifiedMode = false;
      setAccount(target);
      state.threads = await loadThreads(target.id);
      renderInbox();
      const statusLeft = document.getElementById('status-left');
      if (statusLeft) statusLeft.textContent = target.email;
      const acctBtn = document.getElementById('btn-state.account');
      if (acctBtn) acctBtn.textContent = `${target.email.split('@')[0]} ▾`;
      overlay.remove();
      syncAndRender();
    });
  });

  // Remove state.account
  menu.querySelectorAll<HTMLButtonElement>('.account-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const removeId = btn.dataset.removeId!;
      const target = state.accounts.find(a => a.id === removeId);
      if (!target) return;
      if (!confirm(`Remove ${target.email} from Kept?\n\nThis will delete all local data for this state.account.`)) return;
      overlay.remove();
      try {
        await removeAccount(target);
        state.accounts = state.accounts.filter(a => a.id !== removeId);
        if (state.account?.id === removeId) {
          // Switch to another state.account or go to auth
          const next = state.accounts[0] ?? null;
          if (next) {
            setAccount(next);
            state.threads = await loadThreads(next.id);
            showShell();
            await refreshAll();
          } else {
            clearActiveAccountId();
            state.account = null;
            state.threads = [];
            state.syncing = false;
            showAuth();
          }
        }
      } catch (err) {
        console.error('Remove state.account error:', err);
        setStatus('Failed to remove state.account');
      }
    });
  });

  // Add state.account
  document.getElementById('btn-add-state.account')!.addEventListener('click', async () => {
    overlay.remove();
    const addBtn = document.getElementById('btn-state.account') as HTMLButtonElement | null;
    if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Connecting…'; }
    try {
      const newAcct = await startOAuth();
      // Check if already in list (duplicate email → update token, already done by saveAccount)
      const existing = state.accounts.find(a => a.id === newAcct.id);
      if (existing) {
        // Update token in-list
        const idx = state.accounts.indexOf(existing);
        state.accounts[idx] = newAcct;
        setStatus(`${newAcct.email} token refreshed`);
      } else {
        state.accounts.push(newAcct);
        setStatus(`${newAcct.email} added`);
      }
    } catch (e) {
      console.error('Add state.account error:', e);
      setStatus(`Add state.account failed: ${e}`);
    } finally {
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = `${state.account?.email?.split('@')[0] ?? '…'} ▾`; }
      setTimeout(() => setStatus(''), 5000);
    }
  });

  // Sign out of all state.accounts
  document.getElementById('btn-signout-all')!.addEventListener('click', async () => {
    if (!confirm('Sign out of all state.accounts? This will delete all local data.')) return;
    overlay.remove();
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
  });
}

// ── Keyboard shortcuts ────────────────────────────────────
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

function getVisibleThreadIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.thread-row'))
    .map(r => r.dataset.id!)
    .filter(Boolean);
}

function selectThread(id: string | null) {
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

function moveSelection(direction: 1 | -1) {
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

function showCheatSheet() {
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
            <tr><td><kbd class="kb-key">j</kbd> <kbd class="kb-key">k</kbd></td><td>Navigate state.threads</td></tr>
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
            <tr><td><kbd class="kb-key">⇧F</kbd></td><td>Toggle Focus mode</td></tr>
            <tr><td><kbd class="kb-key">?</kbd></td><td>This shortcut help</td></tr>
          </table>
        </div>
      </div>
      <div class="kb-dismiss-hint">Press <kbd class="kb-key">Esc</kbd> or <kbd class="kb-key">?</kbd> to close</div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function openThreadWithReply(t: Thread) {
  openThread(t).then(() => {
    setTimeout(() => {
      const btn = document.getElementById('btn-reply') as HTMLButtonElement | null;
      if (btn && btn.style.display !== 'none') btn.click();
    }, 50);
  });
}

function registerKeyboardShortcuts() {
  if (state.kbRegistered) return;
  state.kbRegistered = true;

  // Cmd+K / Ctrl+K opens the command palette from anywhere (even inputs)
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      renderCommandPalette();
    }
  });

  // Cmd+; / Ctrl+; opens snippet picker from anywhere
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === ';' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const ta = document.activeElement as HTMLTextAreaElement | null;
      openSnippetPicker(ta && ta.tagName === 'TEXTAREA' ? ta : null);
    }
  });

  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (isInputFocused()) return;

    // g+key two-step navigation
    if (state.gPending) {
      state.gPending = false;
      if (state.gTimeout !== null) { clearTimeout(state.gTimeout); state.gTimeout = null; }
      switch (e.key) {
        case 'i': e.preventDefault(); switchView('Inbox'); return;
        case 's': e.preventDefault(); switchView('Starred'); return;
        case 'd': e.preventDefault(); switchView('Drafts'); return;
      }
      // unrecognized second key — fall through to normal handling below
    }

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        moveSelection(1);
        break;

      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        moveSelection(-1);
        break;

      case 'Enter':
      case 'o': {
        if (!state.selectedThreadId) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (t) openThread(t);
        break;
      }

      case 'e': {
        // If reader is open, archive the current thread from reader
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
        if (row) await doArchive(t, row, getActionDeps());
        selectThread(nextId);
        break;
      }

      case '#': {
        // Trash = archive (no dedicated trash API yet)
        if (!state.selectedThreadId || !state.account) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (!t) break;
        const ids = getVisibleThreadIds();
        const idx = ids.indexOf(state.selectedThreadId);
        const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) await doArchive(t, row, getActionDeps());
        selectThread(nextId);
        break;
      }

      case 'x': {
        // Toggle bulk selection for the currently focused thread
        if (!state.selectedThreadId) break;
        if (!state.bulkMode) state.bulkMode = true;
        toggleBulkSelection(state.selectedThreadId);
        if (state.selectedIds.size === 0) { state.bulkMode = false; removeBulkBar(); renderInbox(); }
        break;
      }

      case 's': {
        if (!state.selectedThreadId || !state.account) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (!t) break;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) await doToggleStar(t, row);
        break;
      }

      case 'F': {
        // Shift+F — toggle focus mode
        if (!e.shiftKey) break;
        e.preventDefault();
        toggleFocusMode();
        break;
      }

      case 'U': {
        // Shift+U — mark unread
        if (!e.shiftKey) break;
        if (!state.selectedThreadId || !state.account) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (!t) break;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) await doMarkUnread(t, row);
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
        if (row) await doMute(t, row, getActionDeps());
        selectThread(nextId);
        break;
      }

      case 'r': {
        if (!state.selectedThreadId) break;
        const t = state.threads.find(x => x.id === state.selectedThreadId);
        if (t) openThreadWithReply(t);
        break;
      }

      case 'f': {
        // Forward — open compose with Fwd: subject if a thread is selected/open
        const readerSubjectEl = document.querySelector<HTMLElement>('.reader-subject');
        const readerSubject = readerSubjectEl?.textContent ?? '';
        const selectedThread = state.selectedThreadId ? state.threads.find(x => x.id === state.selectedThreadId) : null;
        const baseSubject = readerSubject || selectedThread?.subject || '';
        const fwdSubject = baseSubject.startsWith('Fwd:') ? baseSubject : baseSubject ? `Fwd: ${baseSubject}` : '';
        openComposeNew(fwdSubject);
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

      case 'n': {
        // Next message within open thread
        scrollReaderMessage(1);
        break;
      }

      case 'p': {
        // Previous message within open thread
        scrollReaderMessage(-1);
        break;
      }

      case ' ': {
        // Space / Shift+Space — scroll reader body
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
        switchView(viewOrder[nextIdx]);
        break;
      }

      case '/': {
        e.preventDefault();
        const searchEl = document.getElementById('search') as HTMLInputElement | null;
        if (searchEl) { searchEl.focus(); searchEl.select(); }
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
        renderInbox();
        updateBulkBar();
        break;
      }

      case 'Escape': {
        if (state.bulkMode) { exitBulkMode(); break; }
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

function scrollReaderMessage(direction: 1 | -1) {
  const readerBody = document.querySelector<HTMLElement>('.reader-body');
  if (!readerBody) return;
  const messages = readerBody.querySelectorAll<HTMLElement>('.thread-message');
  if (messages.length === 0) {
    // single-message view — scroll body instead
    readerBody.scrollBy({ top: direction * 300, behavior: 'smooth' });
    return;
  }
  // Find the first message that is fully in view or below viewport
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
    // Expand collapsed message if needed
    targetMsg.classList.remove('thread-message-collapsed');
  }
}

// ── Bulk select ───────────────────────────────────────────
function toggleBulkMode() {
  state.bulkMode = !state.bulkMode;
  if (!state.bulkMode) {
    state.selectedIds.clear();
    removeBulkBar();
  }
  renderInbox();
}

function exitBulkMode() {
  state.bulkMode = false;
  state.selectedIds.clear();
  removeBulkBar();
  renderInbox();
}

function toggleBulkSelection(id: string) {
  if (state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
  } else {
    state.selectedIds.add(id);
  }
  const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
  if (row) {
    row.classList.toggle('bulk-selected', state.selectedIds.has(id));
    const cb = row.querySelector<HTMLInputElement>('.bulk-checkbox');
    if (cb) cb.checked = state.selectedIds.has(id);
  }
  updateBulkBar();
}

function updateBulkBar() {
  removeBulkBar();
  if (state.selectedIds.size === 0) return;

  const bar = document.createElement('div');
  bar.id = 'bulk-bar';
  bar.className = 'bulk-bar';
  bar.innerHTML = `
    <span class="bulk-count">${state.selectedIds.size} selected</span>
    <button class="bulk-action-btn" id="bulk-archive">Archive All</button>
    <button class="bulk-action-btn" id="bulk-read">Mark Read</button>
    <button class="bulk-action-btn" id="bulk-snooze">Snooze All</button>
    <button class="bulk-cancel-btn" id="bulk-cancel">Cancel</button>
  `;
  document.body.appendChild(bar);

  document.getElementById('bulk-archive')!.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    for (const id of ids) {
      const t = state.threads.find(x => x.id === id);
      if (!t) continue;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
      if (row) await doArchive(t, row, getActionDeps());
    }
    exitBulkMode();
  });

  document.getElementById('bulk-read')!.addEventListener('click', async () => {
    const ids = Array.from(state.selectedIds);
    for (const id of ids) {
      const t = state.threads.find(x => x.id === id);
      if (!t) continue;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
      if (row) await doMarkRead(t, row, getActionDeps());
    }
    exitBulkMode();
  });

  document.getElementById('bulk-snooze')!.addEventListener('click', () => {
    const ids = Array.from(state.selectedIds);
    const firstThread = state.threads.find(x => x.id === ids[0]);
    if (!firstThread) return;
    // Use a synthetic row element just for picker positioning
    const fakeRow = document.querySelector<HTMLElement>(`.thread-row[data-id="${ids[0]}"]`) ?? document.body as HTMLElement;
    openBulkSnoozePicker(ids, fakeRow);
  });

  document.getElementById('bulk-cancel')!.addEventListener('click', () => exitBulkMode());
}

function removeBulkBar() {
  document.getElementById('bulk-bar')?.remove();
}

function openBulkSnoozePicker(ids: string[], anchorRow: HTMLElement) {
  document.getElementById('snooze-picker')?.remove();

  const presets = snoozePresets();
  const now = new Date();
  const defaultDt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  const dtLocal = toDatetimeLocal(defaultDt);

  const picker = document.createElement('div');
  picker.id = 'snooze-picker';
  picker.className = 'snooze-picker';
  picker.innerHTML = `
    <div class="snooze-picker-header">
      <span>Snooze ${ids.length} state.threads until…</span>
      <button class="btn-icon snooze-picker-close" aria-label="Close">✕</button>
    </div>
    <div class="snooze-presets">
      ${presets.map((p, i) => `
        <button class="snooze-preset-btn" data-idx="${i}">
          <span class="snooze-preset-label">${p.label}</span>
          <span class="snooze-preset-time">${formatDate(p.untilMs())}</span>
        </button>`).join('')}
    </div>
    <div class="snooze-custom">
      <label class="snooze-custom-label">Custom date &amp; time</label>
      <input type="datetime-local" id="snooze-dt" class="snooze-dt-input" value="${dtLocal}" />
      <div id="snooze-dt-error" class="snooze-dt-error" style="display:none">Pick a future time</div>
      <button class="btn-primary snooze-confirm-btn" id="snooze-confirm" disabled>Snooze</button>
    </div>
  `;

  document.body.appendChild(picker);

  const rowRect = anchorRow.getBoundingClientRect();
  picker.style.top = `${Math.min(rowRect.bottom + 4, window.innerHeight - 320)}px`;
  picker.style.left = `${Math.max(8, Math.min(rowRect.left, window.innerWidth - 280))}px`;

  picker.querySelector('.snooze-picker-close')!.addEventListener('click', () => picker.remove());

  let selectedPresetMs: number | null = null;
  const confirmBtn = document.getElementById('snooze-confirm') as HTMLButtonElement;

  picker.querySelectorAll<HTMLButtonElement>('.snooze-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      picker.querySelectorAll('.snooze-preset-btn').forEach(b => b.classList.remove('snooze-preset-btn--active'));
      btn.classList.add('snooze-preset-btn--active');
      const idx = parseInt(btn.dataset.idx!);
      selectedPresetMs = presets[idx].untilMs();
      confirmBtn.disabled = false;
    });
  });

  async function applyBulkSnooze(untilMs: number) {
    for (const id of ids) {
      const t = state.threads.find(x => x.id === id);
      if (!t) continue;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${id}"]`);
      if (row) await doSnooze(t, row, untilMs);
    }
    picker.remove();
    exitBulkMode();
  }

  confirmBtn.addEventListener('click', async () => {
    const input = document.getElementById('snooze-dt') as HTMLInputElement;
    const errorEl = document.getElementById('snooze-dt-error')!;
    if (selectedPresetMs !== null) {
      await applyBulkSnooze(selectedPresetMs);
      return;
    }
    const val = input.value;
    if (!val) { errorEl.style.display = ''; return; }
    const chosen = new Date(val).getTime();
    if (chosen <= Date.now()) {
      errorEl.style.display = '';
      errorEl.textContent = 'Must be a future time';
      return;
    }
    errorEl.style.display = 'none';
    await applyBulkSnooze(chosen);
  });

  (document.getElementById('snooze-dt') as HTMLInputElement).addEventListener('change', () => {
    const inp = document.getElementById('snooze-dt') as HTMLInputElement;
    const errorEl = document.getElementById('snooze-dt-error')!;
    picker.querySelectorAll('.snooze-preset-btn').forEach(b => b.classList.remove('snooze-preset-btn--active'));
    selectedPresetMs = null;
    const chosen = new Date(inp.value).getTime();
    if (chosen <= Date.now()) {
      errorEl.style.display = '';
      errorEl.textContent = 'Must be a future time';
      confirmBtn.disabled = true;
    } else {
      errorEl.style.display = 'none';
      confirmBtn.disabled = false;
    }
  });

  function dismiss(e: MouseEvent | KeyboardEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e instanceof MouseEvent && picker.contains(e.target as Node)) return;
    picker.remove();
    document.removeEventListener('click', dismiss as EventListener);
    document.removeEventListener('keydown', dismiss as EventListener);
  }
  setTimeout(() => {
    document.addEventListener('click', dismiss as EventListener);
    document.addEventListener('keydown', dismiss as EventListener);
  }, 0);
}

// ── Render inbox ──────────────────────────────────────────
function renderInbox() {
  const container = document.getElementById('inbox');
  if (!container) return;

  if (state.threads.length === 0 && state.syncing) {
    container.innerHTML = `<p class="sync-loading">Syncing inbox…</p>`;
    return;
  }

  const { visible: focusedThreads, hiddenCount } = applyFocusFilter(state.threads);

  // Apply inbox tab filter
  let tabFiltered = focusedThreads;
  if (state.activeInboxTab === 'important') {
    tabFiltered = focusedThreads.filter(t => isKnownSender(t.senderEmail));
  } else if (state.activeInboxTab === 'other') {
    tabFiltered = focusedThreads.filter(t => !isKnownSender(t.senderEmail));
  }

  // Count unreads per tab for badges
  const importantCount = focusedThreads.filter(t => isKnownSender(t.senderEmail) && t.isUnread).length;
  const otherCount = focusedThreads.filter(t => !isKnownSender(t.senderEmail) && t.isUnread).length;

  const tabBar = `<div class="inbox-tabs">
    <button class="inbox-tab${state.activeInboxTab === 'all' ? ' active' : ''}" data-tab="all">All</button>
    <button class="inbox-tab${state.activeInboxTab === 'important' ? ' active' : ''}" data-tab="important">Important${importantCount ? ` <span class="tab-badge">${importantCount}</span>` : ''}</button>
    <button class="inbox-tab${state.activeInboxTab === 'other' ? ' active' : ''}" data-tab="other">Other${otherCount ? ` <span class="tab-badge">${otherCount}</span>` : ''}</button>
  </div>`;

  if (tabFiltered.length === 0) {
    container.innerHTML = tabBar + `
      <div class="empty-state">
        <div class="icon" style="color:var(--text-muted)">✉</div>
        <div class="empty-text">${state.searchQuery ? 'No results' : state.focusMode ? 'No messages from known senders' : state.activeInboxTab === 'important' ? 'No important emails' : state.activeInboxTab === 'other' ? 'No other emails' : 'All caught up'}</div>
        ${state.focusMode && hiddenCount > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${hiddenCount} thread${hiddenCount !== 1 ? 's' : ''} hidden by Focus</div>` : ''}
      </div>`;
    wireInboxTabs(container);
    return;
  }

  const focusBanner = state.focusMode && hiddenCount > 0
    ? `<div class="focus-banner">Focus mode — ${hiddenCount} thread${hiddenCount !== 1 ? 's' : ''} hidden</div>`
    : '';

  const sections = groupBySection(tabFiltered);
  const html = tabBar + focusBanner + sections.map(s => {
    const unread = s.threads.filter(t => t.isUnread).length;
    const badge = unread > 0 ? ` <span class="section-badge">${unread}</span>` : '';
    return `
    <div class="section-header">${s.label}${badge}</div>
    ${s.threads.map(t => threadRow(t, false)).join('')}
  `;
  }).join('');

  container.innerHTML = html;
  wireInboxTabs(container);
  wireThreadRows(container, tabFiltered, false);
  if (state.bulkMode) updateBulkBar();
  // Restore keyboard selection highlight after re-render
  if (state.selectedThreadId) {
    const row = container.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
    if (row) row.classList.add('is-selected');
    else state.selectedThreadId = null;
  }
}

function wireInboxTabs(container: HTMLElement) {
  container.querySelectorAll('.inbox-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeInboxTab = (btn as HTMLElement).dataset.tab as InboxTab;
      localStorage.setItem('kept_inbox_tab', state.activeInboxTab);
      renderInbox();
    });
  });
}

async function renderSnoozedView() {
  const container = document.getElementById('inbox');
  if (!container || !state.account) return;

  const snoozed = await loadSnoozedThreads(state.account.id);

  if (snoozed.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--lavender-accent)">🕐</div>
        <div class="empty-text">No snoozed state.threads</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Snoozed mail will appear here</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header">Snoozed <span class="section-badge">${snoozed.length}</span></div>
    ${snoozed.map(t => threadRow(t, true)).join('')}
  `;

  wireThreadRows(container, snoozed, true);
}

async function renderStarredView() {
  const container = document.getElementById('inbox');
  if (!container || !state.account) return;

  const starred = await loadStarredThreads(state.account.id);

  if (starred.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--lavender-accent)">★</div>
        <div class="empty-text">No starred state.threads</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Star a thread with s or ☆ to save it here</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header">Starred <span class="section-badge">${starred.length}</span></div>
    ${starred.map(t => threadRow(t, false)).join('')}
  `;

  wireThreadRows(container, starred, false);
}

async function renderScheduledView() {
  const container = document.getElementById('inbox');
  if (!container) return;

  const scheduled: ScheduledEmail[] = loadScheduled();

  if (scheduled.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--lavender-accent)">⏰</div>
        <div class="empty-text">No scheduled sends</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Emails you schedule will appear here</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header">Scheduled <span class="section-badge">${scheduled.length}</span></div>
    ${scheduled.map(e => `
      <div class="thread-row" data-sched-id="${esc(e.id)}">
        <div class="thread-mid">
          <div class="thread-top">
            <span class="thread-sender">${esc(e.to)}</span>
            <span class="thread-date">${formatDate(e.scheduledAt)}</span>
          </div>
          <div class="thread-subject-line">${esc(e.subject)}</div>
          <div class="thread-preview-line">⏰ Sends ${formatDate(e.scheduledAt)}</div>
        </div>
        <div class="thread-actions">
          <button class="btn-action danger btn-cancel-sched" title="Cancel scheduled send">✕</button>
        </div>
      </div>`).join('')}
  `;

  container.querySelectorAll<HTMLButtonElement>('.btn-cancel-sched').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const row = btn.closest<HTMLElement>('.thread-row')!;
      const id = row.dataset.schedId!;
      cancelScheduled(id);
      renderScheduledView();
    });
  });
}

// ── Wire row events ───────────────────────────────────────
function wireThreadRows(container: HTMLElement, list: Thread[], isSnoozed: boolean) {
  container.querySelectorAll<HTMLElement>('.thread-row').forEach(row => {
    const id = row.dataset.id!;
    const t = list.find(x => x.id === id);
    if (!t) return;
    row.querySelector<HTMLElement>('.avatar-wrap')?.addEventListener('click', e => {
      e.stopPropagation();
      if (!state.bulkMode) state.bulkMode = true;
      toggleBulkSelection(t.id);
      if (state.selectedIds.size === 0) {
        state.bulkMode = false;
        removeBulkBar();
        renderInbox();
      }
    });
    row.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.thread-actions')) return;
      if ((e.target as HTMLElement).closest('.avatar-wrap')) return;
      if (state.bulkMode) {
        toggleBulkSelection(t.id);
        return;
      }
      openThread(t);
    });
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, t, row, isSnoozed, getActionDeps());
    });
    row.querySelector('.btn-read')?.addEventListener('click', e => { e.stopPropagation(); doMarkRead(t, row, getActionDeps()); });
    row.querySelector('.btn-mark-unread')?.addEventListener('click', e => { e.stopPropagation(); doMarkUnread(t, row); });
    row.querySelector('.btn-star')?.addEventListener('click', e => { e.stopPropagation(); doToggleStar(t, row); });
    row.querySelector('.btn-archive')?.addEventListener('click', e => { e.stopPropagation(); doArchive(t, row, getActionDeps()); });
    row.querySelector('.btn-block')?.addEventListener('click', e => { e.stopPropagation(); doBlock(t, row, getActionDeps()); });
    row.querySelector('.btn-reply')?.addEventListener('click', e => { e.stopPropagation(); openInlineReply(t, row); });
    if (isSnoozed) {
      row.querySelector('.btn-unsnooze')?.addEventListener('click', e => { e.stopPropagation(); doUnsnooze(t, row, getActionDeps()); });
    } else {
      row.querySelector('.btn-snooze')?.addEventListener('click', e => { e.stopPropagation(); openSnoozePicker(t, row); });
    }

    // ── Touch swipe gestures ──────────────────────────────
    const archiveBg = document.createElement('div');
    archiveBg.className = 'swipe-bg swipe-bg-archive';
    archiveBg.innerHTML = '<span class="swipe-bg-icon">📥</span>';
    const snoozeBg = document.createElement('div');
    snoozeBg.className = 'swipe-bg swipe-bg-snooze';
    snoozeBg.innerHTML = '<span class="swipe-bg-icon">🕐</span>';
    row.prepend(archiveBg, snoozeBg);

    let touchStartX = 0;
    let touchStartY = 0;
    let swipeActive = false;
    let rafId = 0;

    const THRESHOLD = 100;
    const ICON_SHOW = 60;

    row.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      swipeActive = false;
    }, { passive: true });

    row.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;

      if (!swipeActive && Math.abs(dy) > Math.abs(dx)) return;
      swipeActive = true;

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const absDx = Math.abs(dx);
        const isRight = dx > 0;

        row.style.transform = `translateX(${dx}px)`;
        row.classList.add('swiping');

        archiveBg.style.opacity = isRight ? String(Math.min(absDx / THRESHOLD, 1)) : '0';
        snoozeBg.style.opacity = !isRight ? String(Math.min(absDx / THRESHOLD, 1)) : '0';

        const archiveIcon = archiveBg.querySelector<HTMLElement>('.swipe-bg-icon')!;
        const snoozeIcon = snoozeBg.querySelector<HTMLElement>('.swipe-bg-icon')!;
        archiveIcon.classList.toggle('visible', isRight && absDx >= ICON_SHOW);
        snoozeIcon.classList.toggle('visible', !isRight && absDx >= ICON_SHOW);
      });
    }, { passive: true });

    row.addEventListener('touchend', e => {
      cancelAnimationFrame(rafId);
      if (!swipeActive) return;

      const dx = e.changedTouches[0].clientX - touchStartX;
      const absDx = Math.abs(dx);

      row.classList.remove('swiping');
      archiveBg.style.opacity = '0';
      snoozeBg.style.opacity = '0';
      archiveBg.querySelector<HTMLElement>('.swipe-bg-icon')!.classList.remove('visible');
      snoozeBg.querySelector<HTMLElement>('.swipe-bg-icon')!.classList.remove('visible');

      if (absDx >= THRESHOLD) {
        if (dx > 0) {
          row.style.transform = '';
          doArchive(t, row, getActionDeps());
        } else {
          row.style.transform = '';
          openSnoozePicker(t, row);
        }
      } else {
        row.style.transition = 'transform 0.2s ease';
        row.style.transform = '';
        row.addEventListener('transitionend', () => { row.style.transition = ''; }, { once: true });
      }

      swipeActive = false;
    }, { passive: true });
  });
}

// avatar functions imported above

function threadRow(t: Thread, isSnoozed: boolean): string {
  const date = formatDate(t.receivedAt);
  const sender = t.senderName || t.senderEmail;
  const attachment = t.hasAttachment ? `<span class="attachment-icon" title="Has attachment">📎</span>` : '';
  const dot = `<span class="unread-dot${t.isUnread ? ' filled' : ''}"></span>`;

  // KPT-037: state.account badge shown in unified mode
  const acctIdx = state.unifiedMode ? state.accounts.findIndex(a => a.id === t.accountId) : -1;
  const acctBadge = acctIdx >= 0
    ? `<span class="state.account-badge" style="background:${ACCOUNT_BADGE_COLORS[acctIdx % ACCOUNT_BADGE_COLORS.length]}" title="${esc(state.accounts[acctIdx]?.email ?? '')}">${(state.accounts[acctIdx]?.email[0] ?? '?').toUpperCase()}</span>`
    : '';

  // Clock indicator for snoozed state.threads
  const clockIndicator = t.snoozedUntil
    ? `<span class="snooze-badge" title="Snoozed until ${formatDate(t.snoozedUntil)}">🕐 ${formatDate(t.snoozedUntil)}</span>`
    : '';

  const hasReminder = getActiveReminderThreadIds().has(t.id);

  const starIcon = t.isStarred ? '★' : '☆';
  const starClass = t.isStarred ? 'btn-star starred' : 'btn-star';

  const actionsHtml = isSnoozed
    ? `<div class="thread-actions">
         <button class="btn-action btn-unsnooze" title="Wake up now">↑</button>
         <button class="btn-action btn-archive" title="Archive">⬇</button>
       </div>`
    : `<div class="thread-actions">
         <button class="btn-action btn-reply" title="Quick reply">↩</button>
         <button class="btn-action ${starClass}" title="${t.isStarred ? 'Unstar' : 'Star'}">${starIcon}</button>
         <button class="btn-action btn-snooze" title="Snooze">🕐</button>
         <button class="btn-action btn-read" title="Mark read">✓</button>
         <button class="btn-action btn-mark-unread" title="Mark unread">✉</button>
         <button class="btn-action btn-archive" title="Archive">⬇</button>
         <button class="btn-action danger btn-block" title="Block sender">⊘</button>
       </div>`;

  const bulkCheckbox = state.bulkMode
    ? `<input type="checkbox" class="bulk-checkbox" ${state.selectedIds.has(t.id) ? 'checked' : ''} aria-label="Select thread" />`
    : '';

  return `
    <div class="thread-row${t.isUnread ? ' unread' : ''}${isSnoozed ? ' snoozed-row' : ''}${t.isStarred ? ' is-starred' : ''}${hasReminder ? ' awaiting-reply' : ''}${state.bulkMode && state.selectedIds.has(t.id) ? ' bulk-selected' : ''}${state.bulkMode ? ' bulk-mode' : ''}" data-id="${t.id}">
      ${bulkCheckbox}
      ${dot}
      <div class="avatar-wrap">
        ${avatarHtml(t)}
        ${acctBadge}
      </div>
      <div class="thread-mid${attachment ? ' has-attachment' : ''}">
        <div class="thread-top">
          <span class="thread-sender">${esc(sender)}</span>
          <span class="thread-date">${date}</span>
        </div>
        <div class="thread-subject-line">${esc(t.subject)}${t.messageCount && t.messageCount > 1 ? `<span class="thread-count">${t.messageCount}</span>` : ''}</div>
        <div class="thread-preview-line">${clockIndicator || esc(t.snippet)}</div>
      </div>
      ${actionsHtml}
    </div>`;
}

function openComposeNew(prefillSubject = '') {
  return _openComposeNew(prefillSubject, openSnippetPicker, showFollowupPrompt);
}

function openThread(t: Thread) {
  return _openThread(t, renderInbox, openSnippetPicker, showFollowupPrompt);
}

function renderCommandPalette() {
  _renderCommandPalette({
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
  });
}

// ── Snippet picker ────────────────────────────────────────
function openSnippetPicker(targetTextarea: HTMLTextAreaElement | null) {
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
    const start = targetTextarea.selectionStart ?? 0;
    const end = targetTextarea.selectionEnd ?? 0;
    const before = targetTextarea.value.slice(0, start);
    const after = targetTextarea.value.slice(end);
    targetTextarea.value = before + s.body + after;
    const pos = start + s.body.length;
    targetTextarea.setSelectionRange(pos, pos);
    targetTextarea.focus();
    targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
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
function openSnippetManager(returnTarget: HTMLTextAreaElement | null) {
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
