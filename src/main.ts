// main.ts — Kept inbox UI
import { type Account, getAllAccounts, getAccountById, removeAccount, startOAuth } from './auth';
import { resolveActiveAccount, setActiveAccountId, clearActiveAccountId } from './accountContext';
import { type Thread, syncInbox, loadThreads, loadSnoozedThreads, loadStarredThreads, loadSenderEmails, loadRepliedToSenders, markRead, markUnread, archiveThread, unarchiveThread, blockSender, fetchMessageBody, sendEmail, groupBySection, snoozeThread, unsnoozeThread, toggleStar, hasSyncedBefore, muteThread, unmuteThread } from './gmail';
import { sanitizeEmailHtml } from './sanitize';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { notifyNewThreads, updateBadge, ensureNotificationPermission } from './notifications';

// ── State ─────────────────────────────────────────────────
let account: Account | null = null;      // active account
let accounts: Account[] = [];            // all accounts
let unifiedMode = false;                 // KPT-037: show all accounts merged
let threads: Thread[] = [];
let searchQuery = '';
let syncing = false;
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let knownSenders = new Set<string>();   // KPT-038: replied-to sender cache
type ViewName = 'Inbox' | 'Snoozed' | 'Sent' | 'Drafts' | 'Starred';
let currentView: ViewName = 'Inbox';
let selectedThreadId: string | null = null;
let kbRegistered = false;
let currentInlineReply: HTMLElement | null = null;

const VIEWS: Array<{ name: ViewName; icon: string }> = [
  { name: 'Inbox',   icon: '✉' },
  { name: 'Snoozed', icon: '🕐' },
  { name: 'Sent',    icon: '↗' },
  { name: 'Drafts',  icon: '✏' },
  { name: 'Starred', icon: '★' },
];
function setAccount(a: Account) {
  account = a;
  setActiveAccountId(a.id);
}

async function refreshKnownSenders() {
  if (!accounts.length) return;
  const allEmails = await Promise.all(accounts.map(a => loadRepliedToSenders(a.id).catch(() => [] as string[])));
  knownSenders = new Set(allEmails.flat().map(e => e.toLowerCase()));
}

// KPT-037: resolve the Account for a thread action (unified mode uses t.accountId)
function accountFor(t: Thread): Account | null {
  if (unifiedMode && t.accountId) {
    return accounts.find(a => a.id === t.accountId) ?? account;
  }
  return account;
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
    accounts = await getAllAccounts();
    account = await resolveActiveAccount();
    if (account) {
      showShell();
      refreshKnownSenders().catch(() => {});
      await refreshAll();
      setupSnoozeResurface();
    }
  } catch (e) {
    console.error('Boot error:', e);
    // Auth screen already shown — user can log in fresh
  }
}

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
      account = await startOAuth();
      accounts = await getAllAccounts();
      setAccount(account);
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
        <button class="title-nav" id="title-nav" aria-haspopup="listbox" aria-expanded="false">
          <span class="title-nav-label">${currentView}</span>
          <span class="title-nav-chevron">&#x25BE;</span>
        </button>
        <input class="search-input" id="search" placeholder="Search…" type="search" />
        <button class="btn-icon" id="btn-sync" title="Sync inbox">↻</button>
        <button class="btn-icon account-picker-btn" id="btn-account" title="Switch account" style="font-size:13px">${account?.email?.split('@')[0] ?? '…'} ▾</button>
        <button class="btn-icon btn-settings" id="btn-settings" title="Settings">⚙</button>
      </div>
      <div class="nav-tray-wrapper">
        <div class="nav-tray" id="nav-tray" role="listbox">
          ${VIEWS.map(v => `
            <button class="nav-tray-item${v.name === currentView ? ' active' : ''}" data-view="${v.name}" role="option" aria-selected="${v.name === currentView}">
              <span class="nav-tray-icon">${v.icon}</span>
              <span class="nav-tray-label">${v.name}</span>
            </button>`).join('')}
        </div>
      </div>
      <nav class="label-nav" id="label-nav">
        <button class="label-nav-btn active" data-label="INBOX">Inbox</button>
        <button class="label-nav-btn" data-label="SENT">Sent</button>
        <button class="label-nav-btn" data-label="DRAFT">Drafts</button>
        <button class="label-nav-btn" data-label="STARRED">Starred</button>
      </nav>
      <div class="inbox" id="inbox"></div>
      <div class="statusbar">
        <span id="status-left">${account?.email ?? ''}</span>
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

  // Title-nav toggle
  const titleNavBtn = document.getElementById('title-nav') as HTMLButtonElement;
  const navTray = document.getElementById('nav-tray') as HTMLElement;

  function openTray() {
    titleNavBtn.classList.add('open');
    navTray.classList.add('open');
    titleNavBtn.setAttribute('aria-expanded', 'true');
    // backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'nav-tray-backdrop';
    backdrop.id = 'nav-tray-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', closeTray);
  }

  function closeTray() {
    titleNavBtn.classList.remove('open');
    navTray.classList.remove('open');
    titleNavBtn.setAttribute('aria-expanded', 'false');
    document.getElementById('nav-tray-backdrop')?.remove();
  }

  titleNavBtn.addEventListener('click', () => {
    if (navTray.classList.contains('open')) closeTray();
    else openTray();
  });

  // Tray item selection
  navTray.querySelectorAll<HTMLButtonElement>('.nav-tray-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view as ViewName;
      closeTray();
      switchView(view);
    });
  });

  // Swipe-up to dismiss tray
  let touchStartY = 0;
  navTray.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  navTray.addEventListener('touchmove', e => {
    if (e.touches[0].clientY - touchStartY < -30) closeTray();
  }, { passive: true });

  document.getElementById('btn-compose')!.addEventListener('click', () => openComposeNew());

  document.getElementById('btn-sync')!.addEventListener('click', () => syncAndRender());
  document.getElementById('btn-settings')!.addEventListener('click', () => openSettings());
  document.getElementById('btn-account')!.addEventListener('click', () => {
    showAccountMenu();
  });

  const searchEl = document.getElementById('search') as HTMLInputElement;
  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value;
    if (searchDebounce !== null) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      if (!account) return;
      threads = await loadThreads(account.id, searchQuery || undefined);
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

  // Render accounts list
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
    if (!confirm('Sign out of all accounts? This will delete all local data.')) return;
    signoutBtn.disabled = true;
    signoutBtn.textContent = 'Signing out…';
    try {
      for (const a of accounts) {
        await removeAccount(a).catch(e => console.error('Remove error:', e));
      }
    } finally {
      clearActiveAccountId();
      account = null;
      accounts = [];
      threads = [];
      syncing = false;
      showAuth();
    }
  }, { once: true });

  // Wire add account (once: true prevents duplicate OAuth launches on repeated open/close)
  document.getElementById('settings-add-account')!.addEventListener('click', async () => {
    try {
      const newAcct = await startOAuth();
      const existing = accounts.find(a => a.id === newAcct.id);
      if (existing) {
        const idx = accounts.indexOf(existing);
        accounts[idx] = newAcct;
        setStatus(`${newAcct.email} token refreshed`);
      } else {
        accounts.push(newAcct);
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
  list.innerHTML = accounts.map((a, i) => {
    const initial = (a.email[0] ?? '?').toUpperCase();
    const color = avatarColors[i % avatarColors.length];
    const isOnly = accounts.length === 1;
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
      const target = accounts.find(a => a.id === removeId);
      if (!target) return;
      if (!confirm(`Remove ${target.email} from Kept?\n\nThis will delete all local data for this account.`)) return;
      try {
        await removeAccount(target);
        accounts = accounts.filter(a => a.id !== removeId);
        if (account?.id === removeId) {
          const next = accounts[0] ?? null;
          if (next) {
            setAccount(next);
            threads = await loadThreads(next.id);
            closeSettings();
            renderInbox();
            await refreshAll();
          } else {
            clearActiveAccountId();
            account = null;
            threads = [];
            syncing = false;
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
  currentView = view;
  // Update title label
  const label = document.querySelector('.title-nav-label');
  if (label) label.textContent = view;
  // Update tray items
  document.querySelectorAll<HTMLButtonElement>('.nav-tray-item').forEach(item => {
    const isActive = item.dataset.view === view;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-selected', String(isActive));
  });
  // Render appropriate content
  if (view === 'Inbox') {
    renderInbox();
  } else if (view === 'Snoozed') {
    renderSnoozedView();
  } else if (view === 'Starred') {
    renderStarredView();
  } else {
    renderLabelView(view);
  }
}

function renderLabelView(view: ViewName) {
  const container = document.getElementById('inbox');
  if (!container) return;
  const VIEW_TO_LABEL: Record<string, string> = { Sent: 'SENT', Drafts: 'DRAFT', Starred: 'STARRED' };
  const gmailLabel = VIEW_TO_LABEL[view];
  if (!account || !gmailLabel) return;
  loadThreads(account.id, gmailLabel).then(ts => {
    threads = ts;
    renderInbox();
  });
}

// ── Sync ──────────────────────────────────────────────────
/** On boot: load active account threads, then kick off parallel sync for all accounts. */
async function refreshAll() {
  if (!account) return;

  if (unifiedMode) {
    threads = await loadUnifiedThreads();
  } else {
    threads = await loadThreads(account.id);
  }
  renderInbox();

  // Request notification permission early (non-blocking)
  ensureNotificationPermission().catch(() => {});

  // Parallel sync — one per account, errors are non-fatal per account
  const allAccts = await getAllAccounts();
  const syncPromises = allAccts.map(acct =>
    syncInbox(acct, acct.id === account!.id ? n => setStatus(`Syncing… ${n} threads`) : undefined)
      .catch(err => console.error(`Sync error for ${acct.email}:`, err))
  );
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  setStatus('Syncing…');
  await Promise.all(syncPromises);
  if (btn) btn.style.opacity = '';
  if (unifiedMode) {
    threads = await loadUnifiedThreads();
  } else {
    threads = await loadThreads(account.id);
  }
  renderInbox();
  setStatus(`Synced — ${threads.length} threads`);
  setTimeout(() => setStatus(''), 5000);
}

/** KPT-037: Load and merge inbox threads from all accounts, sorted by receivedAt desc. */
async function loadUnifiedThreads(): Promise<Thread[]> {
  const allAccts = await getAllAccounts();
  const perAccount = await Promise.all(allAccts.map(a => loadThreads(a.id).catch(() => [] as Thread[])));
  const merged = perAccount.flat();
  merged.sort((a, b) => b.receivedAt - a.receivedAt);
  return merged;
}

async function syncAndRender() {
  if (syncing || !account) return;
  syncing = true;
  setStatus('Syncing…');
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  try {
    if (unifiedMode) {
      // Sync all accounts in parallel
      const allAccts = await getAllAccounts();
      await Promise.all(allAccts.map(a =>
        syncInbox(a, a.id === account!.id ? n => setStatus(`Syncing… ${n} threads`) : undefined)
          .catch(err => console.error(`Sync error for ${a.email}:`, err))
      ));
      threads = await loadUnifiedThreads();
      renderInbox();
      setStatus(`Synced — ${threads.length} threads`);
    } else {
      // Capture thread IDs known before sync to detect new arrivals
      const preSync = await loadThreads(account.id);
      const knownIds = new Set(preSync.map(t => t.id));
      // Gate: only send notifications on second+ sync (historyId already set)
      const isSubsequentSync = await hasSyncedBefore(account.id);

      await syncInbox(account, n => setStatus(`Syncing… ${n} threads`));
      threads = await loadThreads(account.id);
      renderInbox();
      setStatus(`Synced — ${threads.length} threads`);

      // Refresh known-senders after sync (SENT folder may have grown)
      refreshKnownSenders().catch(() => {});

      // Fire notifications for newly-arrived threads (not first sync)
      if (isSubsequentSync) {
        const newThreads = threads.filter(t => !knownIds.has(t.id));
        if (newThreads.length > 0) {
          const smartNotifs = localStorage.getItem('smartNotifications') !== 'false';
          const toNotify = smartNotifs
            ? newThreads.filter(t => knownSenders.has(t.senderEmail.toLowerCase()))
            : newThreads;
          if (toNotify.length > 0) {
            notifyNewThreads(toNotify.map(t => ({ senderName: t.senderName, subject: t.subject }))).catch(() => {});
          }
        }
      }
    }

    // Update tray badge / dock badge with total unread count
    const unreadCount = threads.filter(t => t.isUnread).length;
    updateBadge(unreadCount).catch(() => {});
  } catch (e) {
    console.error('Sync error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(`Sync error: ${msg}`);
    // Show error in inbox if it's empty so user sees it
    if (threads.length === 0) {
      const container = document.getElementById('inbox');
      if (container) container.innerHTML = `
        <div class="empty-state" style="color:var(--text-muted)">
          <div style="font-size:24px">⚠</div>
          <div>Sync failed</div>
          <div style="font-size:12px; margin-top:4px; max-width:320px; word-break:break-all">${msg}</div>
        </div>`;
    }
  } finally {
    syncing = false;
    if (btn) btn.style.opacity = '';
    setTimeout(() => setStatus(''), 5000);
  }
}

// ── Account menu ──────────────────────────────────────────
function showAccountMenu() {
  // Remove any existing menu
  document.getElementById('account-menu-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'account-menu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.innerHTML = `
    <div class="account-menu-header">Accounts</div>
    ${accounts.length > 1 ? `
      <button class="account-menu-item${unifiedMode ? ' active' : ''}" id="btn-all-accounts">
        <span class="account-email">All Accounts</span>
        ${unifiedMode ? '<span class="account-active-badge">active</span>' : ''}
      </button>` : ''}
    ${accounts.map((a, i) => `
      <button class="account-menu-item${!unifiedMode && a.id === account?.id ? ' active' : ''}" data-id="${a.id}">
        <span class="account-badge-dot" style="background:${ACCOUNT_BADGE_COLORS[i % ACCOUNT_BADGE_COLORS.length]}"></span>
        <span class="account-email">${esc(a.email)}</span>
        ${!unifiedMode && a.id === account?.id ? '<span class="account-active-badge">active</span>' : ''}
        <button class="account-remove-btn" data-remove-id="${a.id}" title="Remove account">×</button>
      </button>`).join('')}
    <button class="account-menu-add" id="btn-add-account">+ Add account</button>
    <hr style="border:none;border-top:1px solid var(--border);margin:4px 0"/>
    <button class="account-menu-signout" id="btn-signout-all">Sign out of all accounts</button>
  `;

  overlay.appendChild(menu);
  document.body.appendChild(overlay);

  // All Accounts unified mode
  document.getElementById('btn-all-accounts')?.addEventListener('click', async () => {
    overlay.remove();
    unifiedMode = true;
    const acctBtn = document.getElementById('btn-account');
    if (acctBtn) acctBtn.textContent = 'All Accounts ▾';
    const statusLeft = document.getElementById('status-left');
    if (statusLeft) statusLeft.textContent = 'All Accounts';
    await refreshAll();
  });

  // Switch account
  menu.querySelectorAll<HTMLButtonElement>('.account-menu-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if ((e.target as HTMLElement).closest('.account-remove-btn')) return;
      const id = btn.dataset.id!;
      if (!id) return; // "All Accounts" button has no data-id
      const target = accounts.find(a => a.id === id);
      if (!target) { overlay.remove(); return; }
      if (!unifiedMode && target.id === account?.id) { overlay.remove(); return; }
      unifiedMode = false;
      setAccount(target);
      threads = await loadThreads(target.id);
      renderInbox();
      const statusLeft = document.getElementById('status-left');
      if (statusLeft) statusLeft.textContent = target.email;
      const acctBtn = document.getElementById('btn-account');
      if (acctBtn) acctBtn.textContent = `${target.email.split('@')[0]} ▾`;
      overlay.remove();
      syncAndRender();
    });
  });

  // Remove account
  menu.querySelectorAll<HTMLButtonElement>('.account-remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const removeId = btn.dataset.removeId!;
      const target = accounts.find(a => a.id === removeId);
      if (!target) return;
      if (!confirm(`Remove ${target.email} from Kept?\n\nThis will delete all local data for this account.`)) return;
      overlay.remove();
      try {
        await removeAccount(target);
        accounts = accounts.filter(a => a.id !== removeId);
        if (account?.id === removeId) {
          // Switch to another account or go to auth
          const next = accounts[0] ?? null;
          if (next) {
            setAccount(next);
            threads = await loadThreads(next.id);
            showShell();
            await refreshAll();
          } else {
            clearActiveAccountId();
            account = null;
            threads = [];
            syncing = false;
            showAuth();
          }
        }
      } catch (err) {
        console.error('Remove account error:', err);
        setStatus('Failed to remove account');
      }
    });
  });

  // Add account
  document.getElementById('btn-add-account')!.addEventListener('click', async () => {
    overlay.remove();
    const addBtn = document.getElementById('btn-account') as HTMLButtonElement | null;
    if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Connecting…'; }
    try {
      const newAcct = await startOAuth();
      // Check if already in list (duplicate email → update token, already done by saveAccount)
      const existing = accounts.find(a => a.id === newAcct.id);
      if (existing) {
        // Update token in-list
        const idx = accounts.indexOf(existing);
        accounts[idx] = newAcct;
        setStatus(`${newAcct.email} token refreshed`);
      } else {
        accounts.push(newAcct);
        setStatus(`${newAcct.email} added`);
      }
    } catch (e) {
      console.error('Add account error:', e);
      setStatus(`Add account failed: ${e}`);
    } finally {
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = `${account?.email?.split('@')[0] ?? '…'} ▾`; }
      setTimeout(() => setStatus(''), 5000);
    }
  });

  // Sign out of all accounts
  document.getElementById('btn-signout-all')!.addEventListener('click', async () => {
    if (!confirm('Sign out of all accounts? This will delete all local data.')) return;
    overlay.remove();
    try {
      for (const a of accounts) {
        await removeAccount(a).catch(e => console.error('Remove error:', e));
      }
    } finally {
      clearActiveAccountId();
      account = null;
      accounts = [];
      threads = [];
      syncing = false;
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
  selectedThreadId = id;
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
  const cur = selectedThreadId ? ids.indexOf(selectedThreadId) : -1;
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
  const modal = document.createElement('div');
  modal.id = 'kb-cheatsheet';
  modal.innerHTML = `
    <div class="kb-modal">
      <div class="kb-modal-header">Keyboard shortcuts</div>
      <table class="kb-table">
        <tr><td class="kb-key">j / ↓</td><td>Next thread</td></tr>
        <tr><td class="kb-key">k / ↑</td><td>Previous thread</td></tr>
        <tr><td class="kb-key">Enter / o</td><td>Open thread</td></tr>
        <tr><td class="kb-key">e</td><td>Archive thread</td></tr>
        <tr><td class="kb-key">s</td><td>Star / unstar thread</td></tr>
        <tr><td class="kb-key">Shift+U</td><td>Mark as unread</td></tr>
        <tr><td class="kb-key">m</td><td>Mute thread</td></tr>
        <tr><td class="kb-key">r</td><td>Reply</td></tr>
        <tr><td class="kb-key">u</td><td>Back to inbox</td></tr>
        <tr><td class="kb-key">?</td><td>Show/hide shortcuts</td></tr>
        <tr><td class="kb-key">Esc</td><td>Dismiss</td></tr>
      </table>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
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
  if (kbRegistered) return;
  kbRegistered = true;

  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (isInputFocused()) return;

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
        if (!selectedThreadId) break;
        const t = threads.find(x => x.id === selectedThreadId);
        if (t) openThread(t);
        break;
      }

      case 'e': {
        if (!selectedThreadId || !account) break;
        const t = threads.find(x => x.id === selectedThreadId);
        if (!t) break;
        const ids = getVisibleThreadIds();
        const idx = ids.indexOf(selectedThreadId);
        const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${selectedThreadId}"]`);
        if (row) await doArchive(t, row);
        selectThread(nextId);
        break;
      }

      case 's': {
        if (!selectedThreadId || !account) break;
        const t = threads.find(x => x.id === selectedThreadId);
        if (!t) break;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${selectedThreadId}"]`);
        if (row) await doToggleStar(t, row);
        break;
      }

      case 'U': {
        // Shift+U — mark unread
        if (!e.shiftKey) break;
        if (!selectedThreadId || !account) break;
        const t = threads.find(x => x.id === selectedThreadId);
        if (!t) break;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${selectedThreadId}"]`);
        if (row) await doMarkUnread(t, row);
        break;
      }

      case 'm': {
        if (!selectedThreadId || !account) break;
        const t = threads.find(x => x.id === selectedThreadId);
        if (!t) break;
        const ids = getVisibleThreadIds();
        const idx = ids.indexOf(selectedThreadId);
        const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
        const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${selectedThreadId}"]`);
        if (row) await doMute(t, row);
        selectThread(nextId);
        break;
      }

      case 'r': {
        if (!selectedThreadId) break;
        const t = threads.find(x => x.id === selectedThreadId);
        if (t) openThreadWithReply(t);
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

      case '?': {
        e.preventDefault();
        showCheatSheet();
        break;
      }

      case 'Escape': {
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

// ── Render inbox ──────────────────────────────────────────
function renderInbox() {
  const container = document.getElementById('inbox');
  if (!container) return;

  if (threads.length === 0 && syncing) {
    container.innerHTML = `<p class="sync-loading">Syncing inbox…</p>`;
    return;
  }

  if (threads.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--text-muted)">✉</div>
        <div class="empty-text">${searchQuery ? 'No results' : 'All caught up'}</div>
      </div>`;
    return;
  }

  const sections = groupBySection(threads);
  const html = sections.map(s => {
    const unread = s.threads.filter(t => t.isUnread).length;
    const badge = unread > 0 ? ` <span class="section-badge">${unread}</span>` : '';
    return `
    <div class="section-header">${s.label}${badge}</div>
    ${s.threads.map(t => threadRow(t, false)).join('')}
  `;
  }).join('');

  container.innerHTML = html;
  wireThreadRows(container, threads, false);
  // Restore keyboard selection highlight after re-render
  if (selectedThreadId) {
    const row = container.querySelector<HTMLElement>(`.thread-row[data-id="${selectedThreadId}"]`);
    if (row) row.classList.add('is-selected');
    else selectedThreadId = null;
  }
}

async function renderSnoozedView() {
  const container = document.getElementById('inbox');
  if (!container || !account) return;

  const snoozed = await loadSnoozedThreads(account.id);

  if (snoozed.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--lavender-accent)">🕐</div>
        <div class="empty-text">No snoozed threads</div>
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
  if (!container || !account) return;

  const starred = await loadStarredThreads(account.id);

  if (starred.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--lavender-accent)">★</div>
        <div class="empty-text">No starred threads</div>
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

// ── Wire row events ───────────────────────────────────────
function wireThreadRows(container: HTMLElement, list: Thread[], isSnoozed: boolean) {
  container.querySelectorAll<HTMLElement>('.thread-row').forEach(row => {
    const id = row.dataset.id!;
    const t = list.find(x => x.id === id);
    if (!t) return;
    row.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.thread-actions')) return;
      openThread(t);
    });
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, t, row, isSnoozed);
    });
    row.querySelector('.btn-read')?.addEventListener('click', e => { e.stopPropagation(); doMarkRead(t, row); });
    row.querySelector('.btn-mark-unread')?.addEventListener('click', e => { e.stopPropagation(); doMarkUnread(t, row); });
    row.querySelector('.btn-star')?.addEventListener('click', e => { e.stopPropagation(); doToggleStar(t, row); });
    row.querySelector('.btn-archive')?.addEventListener('click', e => { e.stopPropagation(); doArchive(t, row); });
    row.querySelector('.btn-block')?.addEventListener('click', e => { e.stopPropagation(); doBlock(t, row); });
    row.querySelector('.btn-reply')?.addEventListener('click', e => { e.stopPropagation(); openInlineReply(t, row); });
    if (isSnoozed) {
      row.querySelector('.btn-unsnooze')?.addEventListener('click', e => { e.stopPropagation(); doUnsnooze(t, row); });
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
          doArchive(t, row);
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

// ── Avatar ────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#d97706', '#7c3aed', '#0891b2', '#16a34a',
  '#dc2626', '#db2777', '#2563eb', '#65a30d',
];

// KPT-037: stable per-account badge colors (index into accounts array)
const ACCOUNT_BADGE_COLORS = ['#7c6fa8', '#5b8dd9', '#7cb9a8', '#d97c5b', '#c47cad'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Lightweight MD5 for Gravatar URLs (not security-sensitive).
function md5(str: string): string {
  const add32 = (a: number, b: number) => (a + b) & 0xffffffff;
  const cmn = (q: number, a: number, b: number, x: number, s: number, t: number) => {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  };
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) => cmn(c ^ (b | ~d), a, b, x, s, t);
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = Array.from(utf8, c => c.charCodeAt(0));
  const len = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = len * 8;
  bytes.push(bitLen & 0xff, (bitLen >> 8) & 0xff, (bitLen >> 16) & 0xff, (bitLen >> 24) & 0xff, 0, 0, 0, 0);
  let [a, b, c, d] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let i = 0; i < bytes.length; i += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) M[j] = bytes[i+j*4] | (bytes[i+j*4+1] << 8) | (bytes[i+j*4+2] << 16) | (bytes[i+j*4+3] << 24);
    let [aa, bb, cc, dd] = [a, b, c, d];
    [a,b,c,d] = [ff(a,b,c,d,M[0],7,-680876936),ff(d,a,b,c,M[1],12,-389564586),ff(c,d,a,b,M[2],17,606105819),ff(b,c,d,a,M[3],22,-1044525330),ff(a,b,c,d,M[4],7,-176418897),ff(d,a,b,c,M[5],12,1200080426),ff(c,d,a,b,M[6],17,-1473231341),ff(b,c,d,a,M[7],22,-45705983),ff(a,b,c,d,M[8],7,1770035416),ff(d,a,b,c,M[9],12,-1958414417),ff(c,d,a,b,M[10],17,-42063),ff(b,c,d,a,M[11],22,-1990404162),ff(a,b,c,d,M[12],7,1804603682),ff(d,a,b,c,M[13],12,-40341101),ff(c,d,a,b,M[14],17,-1502002290),ff(b,c,d,a,M[15],22,1236535329)];
    [a,b,c,d] = [gg(a,b,c,d,M[1],5,-165796510),gg(d,a,b,c,M[6],9,-1069501632),gg(c,d,a,b,M[11],14,643717713),gg(b,c,d,a,M[0],20,-373897302),gg(a,b,c,d,M[5],5,-701558691),gg(d,a,b,c,M[10],9,38016083),gg(c,d,a,b,M[15],14,-660478335),gg(b,c,d,a,M[4],20,-405537848),gg(a,b,c,d,M[9],5,568446438),gg(d,a,b,c,M[14],9,-1019803690),gg(c,d,a,b,M[3],14,-187363961),gg(b,c,d,a,M[8],20,1163531501),gg(a,b,c,d,M[13],5,-1444681467),gg(d,a,b,c,M[2],9,-51403784),gg(c,d,a,b,M[7],14,1735328473),gg(b,c,d,a,M[12],20,-1926607734)];
    [a,b,c,d] = [hh(a,b,c,d,M[5],4,-378558),hh(d,a,b,c,M[8],11,-2022574463),hh(c,d,a,b,M[11],16,1839030562),hh(b,c,d,a,M[14],23,-35309556),hh(a,b,c,d,M[1],4,-1530992060),hh(d,a,b,c,M[4],11,1272893353),hh(c,d,a,b,M[7],16,-155497632),hh(b,c,d,a,M[10],23,-1094730640),hh(a,b,c,d,M[13],4,681279174),hh(d,a,b,c,M[0],11,-358537222),hh(c,d,a,b,M[3],16,-722521979),hh(b,c,d,a,M[6],23,76029189),hh(a,b,c,d,M[9],4,-640364487),hh(d,a,b,c,M[12],11,-421815835),hh(c,d,a,b,M[15],16,530742520),hh(b,c,d,a,M[2],23,-995338651)];
    [a,b,c,d] = [ii(a,b,c,d,M[0],6,-198630844),ii(d,a,b,c,M[7],10,1126891415),ii(c,d,a,b,M[14],15,-1416354905),ii(b,c,d,a,M[5],21,-57434055),ii(a,b,c,d,M[12],6,1700485571),ii(d,a,b,c,M[3],10,-1894986606),ii(c,d,a,b,M[10],15,-1051523),ii(b,c,d,a,M[1],21,-2054922799),ii(a,b,c,d,M[8],6,1873313359),ii(d,a,b,c,M[15],10,-30611744),ii(c,d,a,b,M[6],15,-1560198380),ii(b,c,d,a,M[13],21,1309151649),ii(a,b,c,d,M[4],6,-145523070),ii(d,a,b,c,M[11],10,-1120210379),ii(c,d,a,b,M[2],15,718787259),ii(b,c,d,a,M[9],21,-343485551)];
    [a, b, c, d] = [add32(a, aa), add32(b, bb), add32(c, cc), add32(d, dd)];
  }
  return [a, b, c, d].map(n => (n >>> 0).toString(16).padStart(8, '0').replace(/(..)/g, (_, x) => x[1] + x[0]).replace(/(....)/g, (_, x) => x[2] + x[3] + x[0] + x[1])).join('');
}

function gravatarUrl(email: string): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=64&d=404`;
}

function avatarHtml(t: Thread): string {
  const label = t.senderName || t.senderEmail;
  const initial = label[0].toUpperCase();
  const color = AVATAR_COLORS[hashStr(t.senderEmail) % AVATAR_COLORS.length];
  const domain = t.senderEmail.split('@')[1] ?? '';
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
  const gravatar = t.senderEmail ? gravatarUrl(t.senderEmail) : '';
  const faviconImg = faviconUrl ? `<img class="avatar-favicon" src="${faviconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  const gravatarImg = gravatar ? `<img class="avatar-gravatar" src="${gravatar}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  return `<div class="avatar" style="background:${color}" data-initial="${initial}">${faviconImg}${gravatarImg}</div>`;
}

function threadRow(t: Thread, isSnoozed: boolean): string {
  const date = formatDate(t.receivedAt);
  const sender = t.senderName || t.senderEmail;
  const attachment = t.hasAttachment ? `<span class="attachment-icon" title="Has attachment">📎</span>` : '';
  const dot = `<span class="unread-dot${t.isUnread ? ' filled' : ''}"></span>`;

  // KPT-037: account badge shown in unified mode
  const acctIdx = unifiedMode ? accounts.findIndex(a => a.id === t.accountId) : -1;
  const acctBadge = acctIdx >= 0
    ? `<span class="account-badge" style="background:${ACCOUNT_BADGE_COLORS[acctIdx % ACCOUNT_BADGE_COLORS.length]}" title="${esc(accounts[acctIdx]?.email ?? '')}">${(accounts[acctIdx]?.email[0] ?? '?').toUpperCase()}</span>`
    : '';

  // Clock indicator for snoozed threads
  const clockIndicator = t.snoozedUntil
    ? `<span class="snooze-badge" title="Snoozed until ${formatDate(t.snoozedUntil)}">🕐 ${formatDate(t.snoozedUntil)}</span>`
    : '';

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

  return `
    <div class="thread-row${t.isUnread ? ' unread' : ''}${isSnoozed ? ' snoozed-row' : ''}${t.isStarred ? ' is-starred' : ''}" data-id="${t.id}">
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

// ── Inline reply ──────────────────────────────────────────
function openInlineReply(t: Thread, row: HTMLElement) {
  // Close any existing inline reply
  if (currentInlineReply) {
    currentInlineReply.remove();
    currentInlineReply = null;
  }

  const replyEl = document.createElement('div');
  replyEl.className = 'inline-reply';
  replyEl.innerHTML = `
    <textarea class="inline-reply-textarea" placeholder="Write your reply…" rows="3"></textarea>
    <div class="inline-reply-actions">
      <button class="btn-secondary inline-reply-cancel">Cancel</button>
      <button class="btn-primary inline-reply-send">Send</button>
    </div>`;

  row.insertAdjacentElement('afterend', replyEl);
  currentInlineReply = replyEl;

  const textarea = replyEl.querySelector<HTMLTextAreaElement>('.inline-reply-textarea')!;
  const sendBtn = replyEl.querySelector<HTMLButtonElement>('.inline-reply-send')!;
  const cancelBtn = replyEl.querySelector<HTMLButtonElement>('.inline-reply-cancel')!;

  textarea.focus();

  function collapse() {
    replyEl.remove();
    if (currentInlineReply === replyEl) currentInlineReply = null;
  }

  cancelBtn.addEventListener('click', collapse);

  sendBtn.addEventListener('click', async () => {
    const body = textarea.value.trim();
    if (!body || !account) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    try {
      await sendEmail(account, {
        to: t.senderEmail,
        subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
        body,
        threadId: t.gmailThreadId,
      });
      collapse();
      showToast('Reply sent');
      if (t.isUnread) {
        t.isUnread = false;
        row.classList.remove('unread');
        row.querySelector<HTMLElement>('.unread-dot')?.classList.remove('filled');
        markRead(account, t).catch(() => {});
      }
    } catch (e) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      const errEl = replyEl.querySelector('.inline-reply-error') ?? (() => {
        const d = document.createElement('div');
        d.className = 'inline-reply-error';
        replyEl.querySelector('.inline-reply-actions')!.insertAdjacentElement('beforebegin', d);
        return d;
      })();
      (errEl as HTMLElement).textContent = `Send failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
}

// ── Row actions ───────────────────────────────────────────
async function doMarkRead(t: Thread, row: HTMLElement) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await markRead(acct, t);
    const fresh = await getAccountById(acct.id);
    if (fresh && !unifiedMode) setAccount(fresh);
    t.isUnread = false;
    row.classList.remove('unread');
    row.querySelector<HTMLElement>('.unread-dot')?.classList.remove('filled');
  } catch (e) {
    console.error('Mark read failed:', e);
    setStatus('Mark read failed');
    t.isUnread = true;
    renderInbox();
  }
}

async function doMarkUnread(t: Thread, row: HTMLElement) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await markUnread(acct, t);
    t.isUnread = true;
    row.classList.add('unread');
    row.querySelector<HTMLElement>('.unread-dot')?.classList.add('filled');
  } catch (e) {
    console.error('Mark unread failed:', e);
    setStatus('Mark unread failed');
  }
}

async function doToggleStar(t: Thread, row: HTMLElement) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    const nowStarred = await toggleStar(acct, t);
    t.isStarred = nowStarred;
    const btn = row.querySelector<HTMLButtonElement>('.btn-star');
    if (btn) {
      btn.textContent = nowStarred ? '★' : '☆';
      btn.title = nowStarred ? 'Unstar' : 'Star';
      btn.classList.toggle('starred', nowStarred);
    }
    row.classList.toggle('is-starred', nowStarred);
  } catch (e) {
    console.error('Toggle star failed:', e);
    setStatus('Star toggle failed');
  }
}

async function doArchive(t: Thread, row: HTMLElement) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await archiveThread(acct, t);
    const fresh = await getAccountById(acct.id);
    if (fresh && !unifiedMode) setAccount(fresh);
    row.remove();
    threads = threads.filter(x => x.id !== t.id);
    showUndoToast('Archived', async () => {
      await unarchiveThread(acct, t);
      if (unifiedMode) {
        threads = await loadUnifiedThreads();
      } else {
        threads = await loadThreads(acct.id);
      }
      renderInbox();
    });
  } catch (e) {
    console.error('Archive failed:', e);
    setStatus('Archive failed');
    renderInbox();
  }
}

async function doBlock(t: Thread, _row: HTMLElement) {
  const acct = accountFor(t);
  if (!acct) return;
  if (!confirm(`Block all email from ${t.senderEmail}?\n\nThis will archive + unsubscribe + label in Gmail.`)) return;
  await blockSender(acct, t);
  const fresh = await getAccountById(acct.id);
  if (fresh && !unifiedMode) setAccount(fresh);
  threads = threads.filter(x => !(x.senderEmail === t.senderEmail && x.accountId === t.accountId));
  renderInbox();
  showUndoToast(`Blocked ${t.senderEmail}`, async () => {
    if (unifiedMode) {
      threads = await loadUnifiedThreads();
    } else {
      threads = await loadThreads(acct.id);
    }
    renderInbox();
  });
}

async function doUnsnooze(t: Thread, row: HTMLElement) {
  const acct = accountFor(t);
  await unsnoozeThread(t);
  t.snoozedUntil = null;
  row.remove();
  threads = threads.filter(x => x.id !== t.id);
  showToast('Back in inbox', 3000);
  if (acct) {
    threads = unifiedMode ? await loadUnifiedThreads() : await loadThreads(acct.id);
  }
}

async function doMute(t: Thread, row: HTMLElement) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await muteThread(acct, t);
    t.isMuted = true;
    row.remove();
    threads = threads.filter(x => x.id !== t.id);
    showUndoToast('Thread muted', async () => {
      await unmuteThread(t);
      t.isMuted = false;
      if (unifiedMode) {
        threads = await loadUnifiedThreads();
      } else {
        threads = await loadThreads(acct.id);
      }
      renderInbox();
    });
  } catch (e) {
    console.error('Mute failed:', e);
    setStatus('Mute failed');
  }
}

// ── Context menu ──────────────────────────────────────────
function showContextMenu(x: number, y: number, t: Thread, row: HTMLElement, isSnoozed: boolean) {
  document.getElementById('kept-ctx-menu')?.remove();

  const menu = document.createElement('div');
  menu.id = 'kept-ctx-menu';
  menu.className = 'ctx-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  type MenuItem = { label: string; action: () => void; cls?: string };
  const items: Array<MenuItem | 'divider'> = [];

  if (!isSnoozed) {
    items.push({ label: '🕐  Snooze…', action: () => { menu.remove(); openSnoozePicker(t, row); }, cls: 'ctx-menu-item--snooze' });
  } else {
    items.push({ label: '↑  Wake up now', action: () => { menu.remove(); doUnsnooze(t, row); }, cls: 'ctx-menu-item--snooze' });
  }
  items.push({ label: `${t.isStarred ? '★  Unstar' : '☆  Star'}`, action: () => { menu.remove(); doToggleStar(t, row); } });
  items.push({ label: '✉  Mark as unread', action: () => { menu.remove(); doMarkUnread(t, row); } });
  items.push('divider');
  items.push({ label: '📂  Archive', action: () => { menu.remove(); doArchive(t, row); } });
  items.push({ label: '✓  Mark read', action: () => { menu.remove(); doMarkRead(t, row); } });
  items.push({ label: t.isMuted ? '🔔  Unmute thread' : '🔇  Mute thread', action: () => {
    menu.remove();
    if (t.isMuted) {
      unmuteThread(t).then(() => {
        t.isMuted = false;
        renderInbox();
      }).catch(() => setStatus('Unmute failed'));
    } else {
      doMute(t, row);
    }
  }});
  items.push('divider');
  items.push({ label: '🚫  Block sender', action: () => { menu.remove(); doBlock(t, row); }, cls: 'ctx-menu-item--danger' });

  const actionItems = items.filter((x): x is MenuItem => x !== 'divider');
  menu.innerHTML = items.map((item) =>
    item === 'divider'
      ? `<hr class="ctx-menu-divider">`
      : `<button class="ctx-menu-item${item.cls ? ' ' + item.cls : ''}" data-action-idx="${actionItems.indexOf(item)}">${item.label}</button>`
  ).join('');

  menu.querySelectorAll<HTMLButtonElement>('.ctx-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = actionItems[parseInt(btn.dataset.actionIdx!)];
      if (item) item.action();
    });
  });

  document.body.appendChild(menu);

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;
  });

  function dismiss(e: MouseEvent | KeyboardEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e instanceof MouseEvent && menu.contains(e.target as Node)) return;
    menu.remove();
    document.removeEventListener('click', dismiss as EventListener);
    document.removeEventListener('keydown', dismiss as EventListener);
  }
  setTimeout(() => {
    document.addEventListener('click', dismiss as EventListener);
    document.addEventListener('keydown', dismiss as EventListener);
  }, 0);
}

// ── Snooze picker ─────────────────────────────────────────
function snoozePresets(): Array<{ label: string; untilMs: () => number }> {
  const now = new Date();

  const plus3h = () => Date.now() + 3 * 60 * 60 * 1000;

  const nextDay9am = () => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
    return d.getTime();
  };

  const nextSat9am = () => {
    const d = new Date(now);
    const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilSat);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };

  const nextMon9am = () => {
    const d = new Date(now);
    const daysUntilMon = (1 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMon);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };

  return [
    { label: 'In 3 hours', untilMs: plus3h },
    { label: 'Tomorrow 9am', untilMs: nextDay9am },
    { label: 'Saturday 9am', untilMs: nextSat9am },
    { label: 'Monday 9am', untilMs: nextMon9am },
  ];
}

function openSnoozePicker(t: Thread, row: HTMLElement) {
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
      <span>Snooze until…</span>
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

  const rowRect = row.getBoundingClientRect();
  picker.style.top = `${Math.min(rowRect.bottom + 4, window.innerHeight - 320)}px`;
  picker.style.left = `${Math.max(8, Math.min(rowRect.left, window.innerWidth - 280))}px`;

  picker.querySelector('.snooze-picker-close')!.addEventListener('click', () => picker.remove());

  let selectedPresetMs: number | null = null;
  const confirmBtn = document.getElementById('snooze-confirm') as HTMLButtonElement;

  picker.querySelectorAll<HTMLButtonElement>('.snooze-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Highlight selection, store time, enable confirm -- do NOT snooze immediately
      picker.querySelectorAll('.snooze-preset-btn').forEach(b => b.classList.remove('snooze-preset-btn--active'));
      btn.classList.add('snooze-preset-btn--active');
      const idx = parseInt(btn.dataset.idx!);
      selectedPresetMs = presets[idx].untilMs();
      confirmBtn.disabled = false;
    });
  });

  confirmBtn.addEventListener('click', async () => {
    const input = document.getElementById('snooze-dt') as HTMLInputElement;
    const errorEl = document.getElementById('snooze-dt-error')!;

    if (selectedPresetMs !== null) {
      await doSnooze(t, row, selectedPresetMs);
      picker.remove();
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
    await doSnooze(t, row, chosen);
    picker.remove();
  });

  // When custom datetime changes, clear preset selection and validate
  (document.getElementById('snooze-dt') as HTMLInputElement).addEventListener('change', () => {
    const inp = document.getElementById('snooze-dt') as HTMLInputElement;
    const errorEl = document.getElementById('snooze-dt-error')!;
    // Clear preset highlight
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

async function doSnooze(t: Thread, row: HTMLElement, untilMs: number) {
  await snoozeThread(t, untilMs);
  t.snoozedUntil = untilMs;
  row.classList.add('snoozing-out');
  setTimeout(() => {
    row.remove();
    threads = threads.filter(x => x.id !== t.id);
  }, 250);
  const acct = account;
  showUndoToast(`Snoozed until ${formatDate(untilMs)}`, async () => {
    await unsnoozeThread(t);
    t.snoozedUntil = null;
    if (acct) {
      threads = await loadThreads(acct.id);
      renderInbox();
    }
  });
}

function setupSnoozeResurface() {
  // Poll every 60s — re-render inbox if thread count changes (snoozed threads surfacing)
  setInterval(async () => {
    if (!account) return;
    const fresh = await loadThreads(account.id, searchQuery || undefined);
    if (fresh.length !== threads.length) {
      threads = fresh;
      renderInbox();
    }
  }, 60_000);

  // Also resurface on window focus (Tauri-only)
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused && account) {
        loadThreads(account.id, searchQuery || undefined).then(fresh => {
          threads = fresh;
          renderInbox();
        }).catch(() => {});
      }
    });
  }
}

// ── Compose new email ─────────────────────────────────────
function showToast(msg: string, durationMs = 2000) {
  const existing = document.getElementById('kept-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'kept-toast';
  toast.className = 'kept-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  // Animate in next frame
  requestAnimationFrame(() => { toast.classList.add('kept-toast-visible'); });
  setTimeout(() => {
    toast.classList.remove('kept-toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, durationMs);
}

let _undoToastTimer: ReturnType<typeof setTimeout> | null = null;

function showUndoToast(msg: string, undoFn: () => Promise<void> | void) {
  // Dismiss any existing undo toast
  const existing = document.getElementById('kept-undo-toast');
  if (existing) {
    existing.remove();
    if (_undoToastTimer !== null) { clearTimeout(_undoToastTimer); _undoToastTimer = null; }
  }

  const toast = document.createElement('div');
  toast.id = 'kept-undo-toast';
  toast.className = 'undo-toast';
  toast.innerHTML = `
    <span class="undo-toast-msg">${msg}</span>
    <button class="undo-toast-btn">Undo</button>
    <div class="undo-toast-progress"></div>
  `;
  document.body.appendChild(toast);

  const DURATION = 5000;

  function dismiss() {
    if (_undoToastTimer !== null) { clearTimeout(_undoToastTimer); _undoToastTimer = null; }
    toast.remove();
  }

  toast.querySelector('.undo-toast-btn')!.addEventListener('click', async () => {
    dismiss();
    await undoFn();
  });

  _undoToastTimer = setTimeout(dismiss, DURATION);
}

// Deterministic avatar color from string
function avatarColor(s: string): string {
  const colors = ['#7c6fd4','#4a90d9','#e67e22','#27ae60','#c0392b','#8e44ad','#16a085','#d35400'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

async function openComposeNew() {
  if (!account) return;
  if (document.getElementById('compose-new-panel')) return; // prevent double-open

  // Load known sender emails for autocomplete (best-effort)
  let knownEmails: string[] = [];
  try {
    knownEmails = await loadSenderEmails(account.id);
  } catch { /* non-fatal */ }

  const overlay = document.createElement('div');
  overlay.className = 'reader-overlay compose-new-overlay';

  const panelId = 'compose-new-panel';
  const titleId = 'compose-new-title';
  overlay.innerHTML = `
    <div class="compose-new-panel" id="${panelId}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="compose-new-header">
        <span class="compose-new-title" id="${titleId}">New Message</span>
        <button class="btn-icon compose-new-close-btn" id="compose-new-close" aria-label="Close">✕</button>
      </div>
      <div class="compose-new-body-area">
        <div class="compose-field-group" style="position:relative">
          <label class="compose-field-label" for="compose-new-to">To</label>
          <input class="compose-field-input" id="compose-new-to" type="text"
            placeholder="name@example.com, another@example.com"
            autocomplete="off" aria-autocomplete="list" aria-controls="compose-ac-list" />
          <ul class="compose-ac-list" id="compose-ac-list" role="listbox" aria-label="Suggestions" style="display:none"></ul>
        </div>
        <div class="compose-field-group">
          <label class="compose-field-label" for="compose-new-subject">Subject</label>
          <input class="compose-field-input" id="compose-new-subject" type="text" placeholder="Subject" />
        </div>
        <div class="compose-field-group" style="flex:1;display:flex;flex-direction:column">
          <label class="compose-field-label" for="compose-new-body-ta">Body</label>
          <textarea class="compose-field-input compose-new-body-ta" id="compose-new-body-ta"
            placeholder="Write your message…" style="flex:1;min-height:120px;resize:vertical"></textarea>
        </div>
        <div id="compose-new-error" class="compose-new-error-banner" style="display:none"></div>
      </div>
      <div class="compose-new-footer">
        <button class="compose-send-btn" id="compose-new-send" disabled>Send</button>
        <button class="compose-discard-btn" id="compose-new-discard">Discard</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const panelEl = overlay.querySelector<HTMLElement>('#compose-new-panel')!;
  const toEl = overlay.querySelector<HTMLInputElement>('#compose-new-to')!;
  const subjectEl = overlay.querySelector<HTMLInputElement>('#compose-new-subject')!;
  const bodyEl = overlay.querySelector<HTMLTextAreaElement>('#compose-new-body-ta')!;
  const sendBtn = overlay.querySelector<HTMLButtonElement>('#compose-new-send')!;
  const errorEl = overlay.querySelector<HTMLElement>('#compose-new-error')!;
  const acList = overlay.querySelector<HTMLUListElement>('#compose-ac-list')!;

  function isValidEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  }

  function updateSendState() {
    const toList = toEl.value.split(',').map(s => s.trim()).filter(Boolean);
    const allValid = toList.length > 0 && toList.every(isValidEmail);
    const ok = allValid && bodyEl.value.trim().length > 0;
    sendBtn.disabled = !ok;
    (sendBtn as HTMLButtonElement).style.opacity = ok ? '1' : '0.35';
    (sendBtn as HTMLButtonElement).style.cursor = ok ? 'pointer' : 'default';
  }

  // ── Autocomplete ────────────────────────────────────────
  let acIndex = -1;

  function closeAc() {
    acList.style.display = 'none';
    acList.innerHTML = '';
    acIndex = -1;
  }

  function renderAc(items: string[]) {
    if (items.length === 0) { closeAc(); return; }
    acList.innerHTML = items.slice(0, 6).map((email, i) => {
      const initials = email[0].toUpperCase();
      const bg = avatarColor(email);
      return `<li class="compose-ac-item" role="option" data-email="${esc(email)}" data-idx="${i}">
        <span class="compose-ac-avatar" style="background:${bg}">${initials}</span>
        <span class="compose-ac-email">${esc(email)}</span>
      </li>`;
    }).join('');
    acList.style.display = 'block';
    acIndex = -1;
  }

  function selectAcItem(email: string) {
    // Replace the last token in To field with selected email
    const parts = toEl.value.split(',');
    parts[parts.length - 1] = email;
    toEl.value = parts.join(', ') + ', ';
    closeAc();
    updateSendState();
    toEl.focus();
  }

  toEl.addEventListener('input', () => {
    updateSendState();
    const parts = toEl.value.split(',');
    const query = parts[parts.length - 1].trim();
    if (query.length === 0) { closeAc(); return; }
    const q = query.toLowerCase();
    const matches = knownEmails.filter(e => e.toLowerCase().startsWith(q));
    renderAc(matches);
  });

  acList.addEventListener('mousedown', e => {
    const li = (e.target as Element).closest<HTMLElement>('.compose-ac-item');
    if (li) { e.preventDefault(); selectAcItem(li.dataset.email!); }
  });

  // ── Keyboard nav for autocomplete ───────────────────────
  function onToKeyDown(e: KeyboardEvent) {
    const items = acList.querySelectorAll<HTMLElement>('.compose-ac-item');
    if (acList.style.display !== 'none' && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acIndex = Math.min(acIndex + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('compose-ac-item--active', i === acIndex));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = Math.max(acIndex - 1, 0);
        items.forEach((el, i) => el.classList.toggle('compose-ac-item--active', i === acIndex));
        return;
      }
      if (e.key === 'Enter' && acIndex >= 0) {
        e.preventDefault();
        selectAcItem(items[acIndex].dataset.email!);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeAc();
        return;
      }
    }
  }
  toEl.addEventListener('keydown', onToKeyDown);
  toEl.addEventListener('blur', () => setTimeout(closeAc, 150));

  bodyEl.addEventListener('input', updateSendState);
  updateSendState();
  toEl.focus();

  // ── Close / discard ─────────────────────────────────────
  function closeSafe() {
    document.removeEventListener('keydown', onDocKeyDown);
    overlay.remove();
  }

  function showDiscardConfirm() {
    // In-panel overlay confirm — no alert() or browser confirm()
    const confirmEl = document.createElement('div');
    confirmEl.className = 'compose-discard-confirm';
    confirmEl.innerHTML = `
      <div class="compose-discard-box">
        <p class="compose-discard-msg">Discard this draft?</p>
        <div class="compose-discard-actions">
          <button class="compose-discard-yes">Discard draft</button>
          <button class="compose-discard-no">Keep editing</button>
        </div>
      </div>`;
    panelEl.appendChild(confirmEl);
    confirmEl.querySelector('.compose-discard-yes')!.addEventListener('click', () => closeSafe());
    confirmEl.querySelector('.compose-discard-no')!.addEventListener('click', () => confirmEl.remove());
  }

  function discardWithPrompt() {
    if (bodyEl.value.trim().length > 0) {
      showDiscardConfirm();
    } else {
      closeSafe();
    }
  }

  // Backdrop click does NOT close (per Stark Mono spec — prevents accidental loss)
  overlay.addEventListener('click', e => { if (e.target === overlay) e.stopPropagation(); });

  document.getElementById('compose-new-close')!.addEventListener('click', discardWithPrompt);
  document.getElementById('compose-new-discard')!.addEventListener('click', discardWithPrompt);

  function onDocKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (acList.style.display !== 'none') { closeAc(); return; }
      discardWithPrompt();
    }
  }
  document.addEventListener('keydown', onDocKeyDown);

  // Tab order hint: To → Subject → Body → Send → Discard (natural DOM order)

  // ── Send ────────────────────────────────────────────────
  sendBtn.addEventListener('click', async () => {
    if (sendBtn.disabled) return;
    const toList = toEl.value.split(',').map(s => s.trim()).filter(Boolean);
    const subject = subjectEl.value.trim();
    const body = bodyEl.value.trim();
    if (!account) return;

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="compose-spinner"></span> Sending…';
    errorEl.style.display = 'none';
    toEl.disabled = true;
    subjectEl.disabled = true;
    bodyEl.disabled = true;

    try {
      await sendEmail(account, { to: toList.join(', '), subject: subject || '(no subject)', body });
      closeSafe();
      showToast('Message sent');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errorEl.textContent = `Send failed: ${msg}`;
      errorEl.style.display = 'block';
      sendBtn.disabled = false;
      sendBtn.innerHTML = 'Send';
      toEl.disabled = false;
      subjectEl.disabled = false;
      bodyEl.disabled = false;
      updateSendState();
    }
  });
}

// ── Thread reader ─────────────────────────────────────────
async function openThread(t: Thread) {
  if (!account) return;
  // track open thread for future reply/forward (see openThread)
  // Mark read — optimistic DOM update, revert on failure
  if (t.isUnread) {
    t.isUnread = false;
    document.querySelector<HTMLElement>(`.thread-row[data-id="${t.id}"]`)?.classList.remove('unread');
    markRead(account, t).catch(() => {
      // Revert if API call failed
      t.isUnread = true;
      document.querySelector<HTMLElement>(`.thread-row[data-id="${t.id}"]`)?.classList.add('unread');
    });
  }

  // Draft persistence
  const draftKey = 'draft-' + t.gmailThreadId;
  const savedDraft = localStorage.getItem(draftKey);

  // Full-page reader — hide inbox, show reader inside shell
  const shell = document.getElementById('app-shell')!;
  shell.classList.add('reader-open');

  const reader = document.createElement('div');
  reader.className = 'reader-fullpage';
  reader.innerHTML = `
    <div class="reader-header">
      <button class="btn-icon reader-back" id="reader-back" title="Back to inbox">←</button>
      <div class="reader-subject">${esc(t.subject)}</div>
      <div class="reader-actions-header">
        <button class="btn-icon" id="btn-archive-reader" title="Archive">🗑</button>
      </div>
    </div>
    <div class="reader-body"><div class="spinner"></div></div>
    <div class="reader-footer">
      <button class="btn-primary" id="btn-reply"${savedDraft ? ' style="display:none"' : ''}>Reply</button>
      <button class="btn-secondary danger" id="btn-block-reader">Block sender</button>
      <div class="compose-area" id="compose" style="display:${savedDraft ? 'flex' : 'none'}; flex:1; flex-direction:column; gap:8px;">
        <textarea class="compose-textarea" id="compose-body" placeholder="Write your reply…">${savedDraft ? esc(savedDraft) : ''}</textarea>
        <div style="display:flex; gap:8px;">
          <button class="btn-primary" id="btn-send">Send</button>
          <button class="btn-secondary" id="btn-cancel-compose">Cancel</button>
        </div>
      </div>
    </div>`;
  shell.appendChild(reader);

  function closeReader() {
    reader.remove();
    shell.classList.remove('reader-open');
  }

  document.getElementById('reader-back')!.addEventListener('click', closeReader);

  // Escape key closes reader
  function handleEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') { closeReader(); document.removeEventListener('keydown', handleEsc); }
  }
  document.addEventListener('keydown', handleEsc);

  // lastMessageId for In-Reply-To header
  let lastMessageId: string | null = null;

  // Load messages
  try {
    const result = await fetchMessageBody(account, t.gmailThreadId);
    const bodies = (result as any).bodies ?? (result as any).messages ?? result;
    lastMessageId = (result as any).lastMessageId ?? null;
    const bodyEl = reader.querySelector('.reader-body')!;
    bodyEl.innerHTML = '';
    const msgs = bodies as any[];
    const isThread = msgs.length > 1;

    msgs.forEach((m: any, idx: number) => {
      const isLast = idx === msgs.length - 1;
      const msgContainer = document.createElement('div');
      msgContainer.className = 'thread-message' + (!isLast && isThread ? ' thread-message-collapsed' : '');

      // Parse sender name from "From" header
      const senderName = m.from.replace(/<.*>/, '').trim() || m.from;

      // Collapsed header bar (always present for non-last messages in threads)
      if (isThread && !isLast) {
        const headerBar = document.createElement('div');
        headerBar.className = 'thread-message-header';
        const preview = (m.body || '').slice(0, 80).replace(/\n/g, ' ');
        headerBar.innerHTML = `
          <span class="thread-msg-sender">${esc(senderName)}</span>
          <span class="thread-msg-preview">${esc(preview)}</span>
          <span class="thread-msg-date">${formatDate(m.receivedAt)}</span>
          <span class="thread-msg-chevron">›</span>`;
        headerBar.addEventListener('click', () => {
          msgContainer.classList.toggle('thread-message-collapsed');
        });
        msgContainer.appendChild(headerBar);
      }

      // Message content wrapper
      const contentWrap = document.createElement('div');
      contentWrap.className = 'thread-message-content';

      const metaDiv = document.createElement('div');
      metaDiv.className = 'thread-msg-meta';
      metaDiv.textContent = `${m.from} · ${formatDate(m.receivedAt)}`;
      contentWrap.appendChild(metaDiv);

      const rawHtml: string | null = (m as any).htmlBody ?? null;
      const sanitized = rawHtml ? sanitizeEmailHtml(rawHtml) : '';

      if (sanitized) {
        // Render sanitized HTML in sandboxed iframe
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-popups-to-escape-sandbox');
        iframe.style.cssText = 'width:100%; border:none; overflow:hidden; min-height:60px;';
        iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#222;margin:0;padding:0;line-height:1.5;word-break:break-word;}
          a{color:#5B4EDB;}
          img[data-original-src]{background:#f0f0f0;min-height:20px;border-radius:4px;}
          blockquote{border-left:3px solid #ddd;margin:8px 0;padding-left:12px;color:#666;}
          table{border-collapse:collapse;max-width:100%;}
          td,th{padding:4px 8px;border:1px solid #eee;}
          pre{background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto;}
          img{max-width:100%;height:auto;}
        </style></head><body>${sanitized}</body></html>`;

        // Auto-resize iframe to content height
        const resizeIframe = () => {
          const h = iframe.contentDocument?.body?.scrollHeight;
          if (h) iframe.style.height = h + 4 + 'px';
        };

        // Load images button (shown only if images were blocked)
        const loadImgBtn = document.createElement('button');
        loadImgBtn.className = 'btn-load-images';
        loadImgBtn.textContent = '🖼 Load images';
        loadImgBtn.style.cssText = 'display:none; margin-top:6px; font-size:12px;';
        loadImgBtn.addEventListener('click', () => {
          const imgs = iframe.contentDocument?.querySelectorAll<HTMLImageElement>('img[data-original-src]');
          imgs?.forEach(img => {
            const orig = img.getAttribute('data-original-src')!;
            img.setAttribute('src', orig);
            img.removeAttribute('data-original-src');
          });
          loadImgBtn.remove();
          resizeIframe();
        });
        iframe.addEventListener('load', () => {
          resizeIframe();
          const blocked = iframe.contentDocument?.querySelectorAll('img[data-original-src]');
          if (blocked && blocked.length > 0) loadImgBtn.style.display = 'inline-block';
        });

        contentWrap.appendChild(iframe);
        contentWrap.appendChild(loadImgBtn);
      } else {
        // Fallback: plain text (no HTML, or HTML exceeded 200 KB cap)
        const bodyDiv = document.createElement('div');
        bodyDiv.style.cssText = 'white-space:pre-wrap; font-size:14px;';
        bodyDiv.textContent = m.body.slice(0, 20000);
        contentWrap.appendChild(bodyDiv);

        if (m.body.length > 20000) {
          const showMore = document.createElement('button');
          showMore.className = 'btn-show-more';
          showMore.textContent = 'Show full email';
          showMore.addEventListener('click', () => {
            bodyDiv.textContent = m.body;
            showMore.remove();
          });
          contentWrap.appendChild(showMore);
        }
      }

      msgContainer.appendChild(contentWrap);
      bodyEl.appendChild(msgContainer);
    });

    // Auto-scroll to bottom to show latest message
    bodyEl.scrollTop = bodyEl.scrollHeight;
  } catch {
    reader.querySelector('.reader-body')!.innerHTML = '<p style="color:var(--text-muted)">Could not load messages.</p>';
  }

  // Wire compose textarea draft auto-save
  const textarea = reader.querySelector<HTMLTextAreaElement>('#compose-body')!;
  textarea.addEventListener('input', () => {
    localStorage.setItem(draftKey, textarea.value);
  });

  // Reply
  document.getElementById('btn-reply')!.addEventListener('click', () => {
    const compose = document.getElementById('compose')!;
    compose.style.display = 'flex';
    document.getElementById('btn-reply')!.style.display = 'none';
    textarea.focus();
  });
  document.getElementById('btn-cancel-compose')!.addEventListener('click', () => {
    localStorage.removeItem(draftKey);
    textarea.value = '';
    document.getElementById('compose')!.style.display = 'none';
    document.getElementById('btn-reply')!.style.display = '';
  });
  document.getElementById('btn-send')!.addEventListener('click', async () => {
    const body = textarea.value.trim();
    if (!body || !account) return;
    const btn = document.getElementById('btn-send') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await sendEmail(account, {
        to: t.senderEmail,
        subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
        body,
        threadId: t.gmailThreadId,
        inReplyTo: lastMessageId ?? undefined,
      });
      localStorage.removeItem(draftKey);
      closeReader();
    } catch (e) {
      // Show inline error in reply footer — no alert() per KPT-025Q spec
      const errDiv = document.getElementById('reply-send-error') ?? (() => {
        const d = document.createElement('div');
        d.id = 'reply-send-error';
        d.style.cssText = 'font-size:12px;color:var(--danger,#dc2626);padding:4px 0;';
        btn.parentElement!.insertBefore(d, btn);
        return d;
      })();
      errDiv.textContent = `Send failed: ${e instanceof Error ? e.message : String(e)}`;
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  });

  document.getElementById('btn-archive-reader')!.addEventListener('click', async () => {
    if (!account) return;
    await archiveThread(account, t);
    const fresh = account ? await getAccountById(account.id) : null;
    if (fresh) setAccount(fresh);
    threads = threads.filter(x => x.id !== t.id);
    renderInbox();
    closeReader();
  });
  document.getElementById('btn-block-reader')!.addEventListener('click', async () => {
    if (!account) return;
    if (!confirm(`Block all email from ${t.senderEmail}?`)) return;
    await blockSender(account, t);
    const fresh = account ? await getAccountById(account.id) : null;
    if (fresh) setAccount(fresh);
    threads = threads.filter(x => x.senderEmail !== t.senderEmail);
    renderInbox();
    closeReader();
  });
}

// ── Helpers ───────────────────────────────────────────────
function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

function setStatus(msg: string) {
  const el = document.getElementById('status-right');
  if (el) el.textContent = msg;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d >= today) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d >= yesterday) return 'Yesterday';
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Convert Date to "YYYY-MM-DDTHH:MM" string for datetime-local input */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Start ─────────────────────────────────────────────────
boot();
