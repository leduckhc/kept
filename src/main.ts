// main.ts — Kept inbox UI
import { type Account, getAllAccounts, getAccountById, removeAccount, startOAuth } from './auth';
import { resolveActiveAccount, setActiveAccountId, clearActiveAccountId } from './accountContext';
import { type Thread, syncInbox, loadThreads, loadSnoozedThreads, loadSenderEmails, markRead, archiveThread, blockSender, fetchMessageBody, sendEmail, groupBySection, snoozeThread, unsnoozeThread, hasSyncedBefore } from './gmail';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { notifyNewThreads, updateBadge, ensureNotificationPermission } from './notifications';

// ── State ─────────────────────────────────────────────────
let account: Account | null = null;      // active account
let accounts: Account[] = [];            // all accounts
let threads: Thread[] = [];
let searchQuery = '';
let syncing = false;
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
type ViewName = 'Inbox' | 'Snoozed' | 'Sent' | 'Drafts' | 'Starred';
let currentView: ViewName = 'Inbox';
let selectedThreadId: string | null = null;
let kbRegistered = false;

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
        <button class="btn-icon" id="btn-theme" title="Toggle theme">◑</button>
        <button class="btn-icon account-picker-btn" id="btn-account" title="Switch account" style="font-size:13px">${account?.email?.split('@')[0] ?? '…'} ▾</button>
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
      <div class="inbox" id="inbox"></div>
      <div class="statusbar">
        <span id="status-left">${account?.email ?? ''}</span>
        <span id="status-right"></span>
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
  document.getElementById('btn-theme')!.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
  document.getElementById('btn-account')!.addEventListener('click', () => {
    showAccountMenu();
  });

  const searchEl = document.getElementById('search') as HTMLInputElement;
  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value;
    if (searchDebounce !== null) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      if (!account) return;
      threads = await loadThreads(account.id, searchQuery);
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
  // Clean up when shell is replaced
  const cleanupKey = () => { document.removeEventListener('keydown', handleKey); };
  document.getElementById('btn-signout')!.addEventListener('click', cleanupKey, { once: true });
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
  } else {
    renderViewPlaceholder(view);
  }
}

function renderViewPlaceholder(view: ViewName) {
  const container = document.getElementById('inbox');
  if (!container) return;
  const icons: Record<ViewName, string> = { Inbox: '✉', Snoozed: '🕐', Sent: '↗', Drafts: '✏', Starred: '★' };
  container.innerHTML = `
    <div class="empty-state">
      <div class="icon" style="color:var(--lavender-accent)">${icons[view]}</div>
      <div class="empty-text">${view}</div>
      <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Coming soon</div>
    </div>`;
}

// ── Sync ──────────────────────────────────────────────────
/** On boot: load active account threads, then kick off parallel sync for all accounts. */
async function refreshAll() {
  if (!account) return;
  threads = await loadThreads(account.id);
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
  // Reload threads for the active account after all syncs complete
  threads = await loadThreads(account.id);
  renderInbox();
  setStatus(`Synced — ${threads.length} threads`);
  setTimeout(() => setStatus(''), 5000);
}

async function syncAndRender() {
  if (syncing || !account) return;
  syncing = true;
  setStatus('Syncing…');
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  try {
    // Capture thread IDs known before sync to detect new arrivals
    const preSync = await loadThreads(account.id);
    const knownIds = new Set(preSync.map(t => t.id));
    // Gate: only send notifications on second+ sync (historyId already set)
    const isSubsequentSync = await hasSyncedBefore(account.id);

    await syncInbox(account, n => setStatus(`Syncing… ${n} threads`));
    threads = await loadThreads(account.id);
    renderInbox();
    setStatus(`Synced — ${threads.length} threads`);

    // Fire notifications for newly-arrived threads (not first sync)
    if (isSubsequentSync) {
      const newThreads = threads.filter(t => !knownIds.has(t.id));
      if (newThreads.length > 0) {
        notifyNewThreads(newThreads.map(t => ({ senderName: t.senderName, subject: t.subject }))).catch(() => {});
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
    ${accounts.map(a => `
      <button class="account-menu-item${a.id === account?.id ? ' active' : ''}" data-id="${a.id}">
        <span class="account-email">${esc(a.email)}</span>
        ${a.id === account?.id ? '<span class="account-active-badge">active</span>' : ''}
        <button class="account-remove-btn" data-remove-id="${a.id}" title="Remove account">×</button>
      </button>`).join('')}
    <button class="account-menu-add" id="btn-add-account">+ Add account</button>
    <hr style="border:none;border-top:1px solid var(--border);margin:4px 0"/>
    <button class="account-menu-signout" id="btn-signout-all">Sign out of all accounts</button>
  `;

  overlay.appendChild(menu);
  document.body.appendChild(overlay);

  // Switch account
  menu.querySelectorAll<HTMLButtonElement>('.account-menu-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if ((e.target as HTMLElement).closest('.account-remove-btn')) return;
      const id = btn.dataset.id!;
      const target = accounts.find(a => a.id === id);
      if (!target || target.id === account?.id) { overlay.remove(); return; }
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

      case 'r': {
        if (!selectedThreadId) break;
        const t = threads.find(x => x.id === selectedThreadId);
        if (t) openThreadWithReply(t);
        break;
      }

      case 'u': {
        const overlay = document.querySelector<HTMLElement>('.reader-overlay');
        if (overlay) overlay.remove();
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
        const overlay = document.querySelector<HTMLElement>('.reader-overlay');
        if (overlay) overlay.remove();
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
    row.querySelector('.btn-archive')?.addEventListener('click', e => { e.stopPropagation(); doArchive(t, row); });
    row.querySelector('.btn-block')?.addEventListener('click', e => { e.stopPropagation(); doBlock(t, row); });
    if (isSnoozed) {
      row.querySelector('.btn-unsnooze')?.addEventListener('click', e => { e.stopPropagation(); doUnsnooze(t, row); });
    } else {
      row.querySelector('.btn-snooze')?.addEventListener('click', e => { e.stopPropagation(); openSnoozePicker(t, row); });
    }
  });
}

// ── Avatar ────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#d97706', '#7c3aed', '#0891b2', '#16a34a',
  '#dc2626', '#db2777', '#2563eb', '#65a30d',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarHtml(t: Thread): string {
  const label = t.senderName || t.senderEmail;
  const initial = label[0].toUpperCase();
  const color = AVATAR_COLORS[hashStr(t.senderEmail) % AVATAR_COLORS.length];
  const domain = t.senderEmail.split('@')[1] ?? '';
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
  return `<div class="avatar" style="background:${color}" data-initial="${initial}">${
    faviconUrl ? `<img src="${faviconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''
  }</div>`;
}

function threadRow(t: Thread, isSnoozed: boolean): string {
  const date = formatDate(t.receivedAt);
  const sender = t.senderName || t.senderEmail;
  const attachment = t.hasAttachment ? `<span class="attachment-icon" title="Has attachment">📎</span>` : '';
  const dot = `<span class="unread-dot${t.isUnread ? ' filled' : ''}"></span>`;

  // Clock indicator for snoozed threads
  const clockIndicator = t.snoozedUntil
    ? `<span class="snooze-indicator" title="Snoozed until ${formatDate(t.snoozedUntil)}">🕐 ${formatDate(t.snoozedUntil)}</span>`
    : '';

  const actionsHtml = isSnoozed
    ? `<div class="thread-actions">
         <button class="btn-action btn-unsnooze" title="Wake up now">↑</button>
         <button class="btn-action btn-archive" title="Archive">⬇</button>
       </div>`
    : `<div class="thread-actions">
         <button class="btn-action btn-snooze" title="Snooze">🕐</button>
         <button class="btn-action btn-read" title="Mark read">✓</button>
         <button class="btn-action btn-archive" title="Archive">⬇</button>
         <button class="btn-action danger btn-block" title="Block sender">⊘</button>
       </div>`;

  return `
    <div class="thread-row${t.isUnread ? ' unread' : ''}${isSnoozed ? ' snoozed-row' : ''}" data-id="${t.id}">
      ${dot}
      ${avatarHtml(t)}
      <div class="thread-mid${attachment ? ' has-attachment' : ''}">
        <div class="thread-top">
          <span class="thread-sender">${esc(sender)}</span>
          <span class="thread-date">${date}</span>
        </div>
        <div class="thread-subject-line">${esc(t.subject)}</div>
        <div class="thread-preview-line">${clockIndicator || esc(t.snippet)}</div>
      </div>
      ${actionsHtml}
    </div>`;
}

// ── Row actions ───────────────────────────────────────────
async function doMarkRead(t: Thread, row: HTMLElement) {
  if (!account) return;
  try {
    await markRead(account, t);
    const fresh = account ? await getAccountById(account.id) : null;
    if (fresh) setAccount(fresh);
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

async function doArchive(t: Thread, row: HTMLElement) {
  if (!account) return;
  try {
    await archiveThread(account, t);
    const fresh = account ? await getAccountById(account.id) : null;
    if (fresh) setAccount(fresh);
    row.remove();
    threads = threads.filter(x => x.id !== t.id);
  } catch (e) {
    console.error('Archive failed:', e);
    setStatus('Archive failed');
    renderInbox();
  }
}

async function doBlock(t: Thread, _row: HTMLElement) {
  if (!account) return;
  if (!confirm(`Block all email from ${t.senderEmail}?\n\nThis will archive + unsubscribe + label in Gmail.`)) return;
  await blockSender(account, t);
  const fresh = account ? await getAccountById(account.id) : null;
  if (fresh) setAccount(fresh);
  // Remove all rows from this sender
  threads = threads.filter(x => x.senderEmail !== t.senderEmail);
  renderInbox();
}

async function doUnsnooze(t: Thread, row: HTMLElement) {
  await unsnoozeThread(t);
  t.snoozedUntil = null;
  row.remove();
  threads = threads.filter(x => x.id !== t.id);
  // Refresh inbox so it picks up resurfaces thread
  if (account) {
    threads = await loadThreads(account.id);
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

  const items: Array<{ label: string; action: () => void }> = [];

  if (!isSnoozed) {
    items.push({ label: '🕐  Snooze…', action: () => { menu.remove(); openSnoozePicker(t, row); } });
  } else {
    items.push({ label: '↑  Wake up now', action: () => { menu.remove(); doUnsnooze(t, row); } });
  }
  items.push({ label: '✓  Mark as read', action: () => { menu.remove(); doMarkRead(t, row); } });
  items.push({ label: '⬇  Archive', action: () => { menu.remove(); doArchive(t, row); } });
  items.push({ label: '⊘  Block sender', action: () => { menu.remove(); doBlock(t, row); } });

  menu.innerHTML = items.map((item, i) =>
    `<button class="ctx-menu-item" data-idx="${i}">${item.label}</button>`
  ).join('');

  menu.querySelectorAll<HTMLButtonElement>('.ctx-menu-item').forEach(btn => {
    btn.addEventListener('click', () => items[parseInt(btn.dataset.idx!)]?.action());
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
      <button class="btn-primary snooze-confirm-btn" id="snooze-confirm">Snooze</button>
    </div>
  `;

  document.body.appendChild(picker);

  const rowRect = row.getBoundingClientRect();
  picker.style.top = `${Math.min(rowRect.bottom + 4, window.innerHeight - 320)}px`;
  picker.style.left = `${Math.max(8, Math.min(rowRect.left, window.innerWidth - 280))}px`;

  picker.querySelector('.snooze-picker-close')!.addEventListener('click', () => picker.remove());

  picker.querySelectorAll<HTMLButtonElement>('.snooze-preset-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx!);
      const untilMs = presets[idx].untilMs();
      await doSnooze(t, row, untilMs);
      picker.remove();
    });
  });

  document.getElementById('snooze-confirm')!.addEventListener('click', async () => {
    const input = document.getElementById('snooze-dt') as HTMLInputElement;
    const errorEl = document.getElementById('snooze-dt-error')!;
    const val = input.value;
    if (!val) { errorEl.style.display = ''; return; }
    const chosen = new Date(val).getTime();
    if (chosen <= Date.now()) {
      errorEl.style.display = '';
      errorEl.textContent = 'Pick a future time';
      return;
    }
    errorEl.style.display = 'none';
    await doSnooze(t, row, chosen);
    picker.remove();
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
  setStatus(`Snoozed until ${formatDate(untilMs)}`);
  setTimeout(() => setStatus(''), 4000);
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

  const overlay = document.createElement('div');
  overlay.className = 'reader-overlay';
  overlay.innerHTML = `
    <div class="reader-panel">
      <div class="reader-header">
        <div class="reader-subject">${esc(t.subject)}</div>
        <button class="btn-icon" id="reader-close">✕</button>
      </div>
      <div class="reader-body"><div class="spinner"></div></div>
      <div class="reader-footer">
        <button class="btn-primary" id="btn-reply"${savedDraft ? ' style="display:none"' : ''}>Reply</button>
        <button class="btn-secondary" id="btn-archive-reader">Archive</button>
        <button class="btn-secondary danger" id="btn-block-reader">Block sender</button>
        <div class="compose-area" id="compose" style="display:${savedDraft ? 'flex' : 'none'}; flex:1; flex-direction:column; gap:8px;">
          <textarea class="compose-textarea" id="compose-body" placeholder="Write your reply…">${savedDraft ? esc(savedDraft) : ''}</textarea>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary" id="btn-send">Send</button>
            <button class="btn-secondary" id="btn-cancel-compose">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('reader-close')!.addEventListener('click', () => overlay.remove());

  // lastMessageId for In-Reply-To header
  let lastMessageId: string | null = null;

  // Load messages
  try {
    const result = await fetchMessageBody(account, t.gmailThreadId);
    const bodies = (result as any).bodies ?? (result as any).messages ?? result;
    lastMessageId = (result as any).lastMessageId ?? null;
    const bodyEl = overlay.querySelector('.reader-body')!;
    bodyEl.innerHTML = '';
    (bodies as any[]).forEach((m: any, idx: number) => {
      if (idx > 0) {
        const hr = document.createElement('hr');
        hr.style.cssText = 'border:none; border-top:1px solid var(--border); margin:12px 0;';
        bodyEl.appendChild(hr);
      }
      const msgDiv = document.createElement('div');
      msgDiv.style.marginBottom = '20px';

      const metaDiv = document.createElement('div');
      metaDiv.style.cssText = 'font-size:12px; color:var(--text-muted); margin-bottom:6px;';
      metaDiv.textContent = `${m.from} · ${formatDate(m.receivedAt)}`;
      msgDiv.appendChild(metaDiv);

      const bodyDiv = document.createElement('div');
      bodyDiv.style.cssText = 'white-space:pre-wrap; font-size:14px;';
      bodyDiv.textContent = m.body.slice(0, 20000);
      msgDiv.appendChild(bodyDiv);

      if (m.body.length > 20000) {
        const showMore = document.createElement('button');
        showMore.className = 'btn-show-more';
        showMore.textContent = 'Show full email';
        showMore.addEventListener('click', () => {
          bodyDiv.textContent = m.body;
          showMore.remove();
        });
        msgDiv.appendChild(showMore);
      }

      bodyEl.appendChild(msgDiv);
    });
  } catch {
    overlay.querySelector('.reader-body')!.innerHTML = '<p style="color:var(--text-muted)">Could not load messages.</p>';
  }

  // Wire compose textarea draft auto-save
  const textarea = overlay.querySelector<HTMLTextAreaElement>('#compose-body')!;
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
      overlay.remove();
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
    overlay.remove();
  });
  document.getElementById('btn-block-reader')!.addEventListener('click', async () => {
    if (!account) return;
    if (!confirm(`Block all email from ${t.senderEmail}?`)) return;
    await blockSender(account, t);
    const fresh = account ? await getAccountById(account.id) : null;
    if (fresh) setAccount(fresh);
    threads = threads.filter(x => x.senderEmail !== t.senderEmail);
    renderInbox();
    overlay.remove();
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
