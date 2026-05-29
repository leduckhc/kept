// main.ts — Kept inbox UI
import { type Account, getAccount, startOAuth } from './auth';
import { type Thread, syncInbox, loadThreads, markRead, archiveThread, blockSender, fetchMessageBody, sendEmail, groupBySection } from './gmail';

// ── State ─────────────────────────────────────────────────
let account: Account | null = null;
let threads: Thread[] = [];
let searchQuery = '';
let syncing = false;
let selectedThread: Thread | null = null; // tracks open thread

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
    account = await getAccount();
    if (account) {
      showShell();
      await refresh();
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
    btn.textContent = 'Opening browser…';
    try {
      account = await startOAuth();
      showShell();
      await refresh();
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = 'Sign in with Google';
      alert(`Login failed: ${e}`);
    }
  });
}

// ── App shell ─────────────────────────────────────────────
function showShell() {
  document.getElementById('app')!.innerHTML = `
    <div id="app-shell">
      <div class="toolbar">
        <span class="toolbar-title">Kept</span>
        <input class="search-input" id="search" placeholder="Search…" type="search" />
        <button class="btn-icon" id="btn-sync" title="Sync inbox">↻</button>
        <button class="btn-icon" id="btn-theme" title="Toggle theme">◑</button>
        <button class="btn-icon" id="btn-signout" title="Sign out">⇥</button>
      </div>
      <div class="inbox" id="inbox"></div>
      <div class="statusbar">
        <span id="status-left">${account?.email ?? ''}</span>
        <span id="status-right"></span>
      </div>
    </div>
  `;

  document.getElementById('btn-sync')!.addEventListener('click', () => syncAndRender());
  document.getElementById('btn-theme')!.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
  document.getElementById('btn-signout')!.addEventListener('click', async () => {
    if (!confirm('Sign out?')) return;
    const db = await import('./db').then(m => m.getDb());
    await db.execute('DELETE FROM accounts');
    account = null;
    threads = [];
    showAuth();
  });

  const searchEl = document.getElementById('search') as HTMLInputElement;
  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value;
    renderInbox();
  });
}

// ── Sync ──────────────────────────────────────────────────
async function refresh() {
  if (!account) return;
  threads = await loadThreads(account.id);
  renderInbox();
  // Always sync on boot to get fresh data
  syncAndRender();
}

async function syncAndRender() {
  if (syncing || !account) return;
  syncing = true;
  setStatus('Syncing…');
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  try {
    await syncInbox(account, n => setStatus(`Syncing… ${n} threads`));
    threads = await loadThreads(account.id);
    renderInbox();
    setStatus(`Synced — ${threads.length} threads`);
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

// ── Render inbox ──────────────────────────────────────────
function renderInbox() {
  const container = document.getElementById('inbox');
  if (!container) return;

  const filtered = searchQuery
    ? threads.filter(t =>
        t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.senderEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.snippet.toLowerCase().includes(searchQuery.toLowerCase()))
    : threads;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">✉</div>
        <div>${searchQuery ? 'No results' : 'Inbox is empty'}</div>
      </div>`;
    return;
  }

  const sections = groupBySection(filtered);
  const html = sections.map(s => `
    <div class="section-header">${s.label} <span style="opacity:.5">${s.threads.length}</span></div>
    ${s.threads.map(threadRow).join('')}
  `).join('');

  container.innerHTML = html;

  // Wire up row clicks
  container.querySelectorAll<HTMLElement>('.thread-row').forEach(row => {
    const id = row.dataset.id!;
    const t = threads.find(x => x.id === id);
    if (!t) return;
    row.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.thread-actions')) return;
      openThread(t);
    });
    row.querySelector('.btn-read')?.addEventListener('click', e => { e.stopPropagation(); doMarkRead(t, row); });
    row.querySelector('.btn-archive')?.addEventListener('click', e => { e.stopPropagation(); doArchive(t, row); });
    row.querySelector('.btn-block')?.addEventListener('click', e => { e.stopPropagation(); doBlock(t, row); });
  });
}

function threadRow(t: Thread): string {
  const date = formatDate(t.receivedAt);
  const sender = t.senderName || t.senderEmail;
  return `
    <div class="thread-row${t.isUnread ? ' unread' : ''}" data-id="${t.id}">
      <span class="unread-dot"></span>
      <div class="thread-body">
        <div class="thread-sender">${esc(sender)}</div>
        <div class="thread-subject">${esc(t.subject)}</div>
        <div class="thread-preview">${esc(t.snippet)}</div>
      </div>
      <div class="thread-meta">${date}</div>
      <div class="thread-actions">
        <button class="btn-action btn-read" title="Mark read">✓</button>
        <button class="btn-action btn-archive" title="Archive">⬇</button>
        <button class="btn-action danger btn-block" title="Block sender">⊘</button>
      </div>
    </div>`;
}

// ── Row actions ───────────────────────────────────────────
async function doMarkRead(t: Thread, row: HTMLElement) {
  if (!account) return;
  await markRead(account, t);
  t.isUnread = false;
  row.classList.remove('unread');
}

async function doArchive(t: Thread, row: HTMLElement) {
  if (!account) return;
  await archiveThread(account, t);
  row.remove();
  threads = threads.filter(x => x.id !== t.id);
}

async function doBlock(t: Thread, row: HTMLElement) {
  if (!account) return;
  if (!confirm(`Block all email from ${t.senderEmail}?\n\nThis will archive + unsubscribe + label in Gmail.`)) return;
  await blockSender(account, t);
  // Remove all rows from this sender
  threads = threads.filter(x => x.senderEmail !== t.senderEmail);
  renderInbox();
}

// ── Thread reader ─────────────────────────────────────────
async function openThread(t: Thread) {
  if (!account) return;
  selectedThread = t;
  // Mark read
  if (t.isUnread) await markRead(account, t).catch(() => {});

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
        <button class="btn-primary" id="btn-reply">Reply</button>
        <button class="btn-secondary" id="btn-archive-reader">Archive</button>
        <button class="btn-secondary danger" id="btn-block-reader">Block sender</button>
        <div class="compose-area" id="compose" style="display:none; flex:1; flex-direction:column; gap:8px;">
          <textarea class="compose-textarea" id="compose-body" placeholder="Write your reply…"></textarea>
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

  // Load messages
  try {
    const { messages } = await fetchMessageBody(account, t.gmailThreadId);
    const bodyEl = overlay.querySelector('.reader-body')!;
    bodyEl.innerHTML = messages.map(m => `
      <div style="margin-bottom:20px;">
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">${esc(m.from)} · ${formatDate(m.receivedAt)}</div>
        <div style="white-space:pre-wrap; font-size:14px;">${esc(m.body.slice(0, 4000))}</div>
      </div>
    `).join('<hr style="border:none; border-top:1px solid var(--border); margin:12px 0;">');
  } catch {
    overlay.querySelector('.reader-body')!.innerHTML = '<p style="color:var(--text-muted)">Could not load messages.</p>';
  }

  // Reply
  
  document.getElementById('btn-reply')!.addEventListener('click', () => {
    const compose = document.getElementById('compose')!;
    compose.style.display = 'flex';
    document.getElementById('btn-reply')!.style.display = 'none';
    document.getElementById('compose-body')!.focus();
  });
  document.getElementById('btn-cancel-compose')!.addEventListener('click', () => {
    document.getElementById('compose')!.style.display = 'none';
    document.getElementById('btn-reply')!.style.display = '';
  });
  document.getElementById('btn-send')!.addEventListener('click', async () => {
    const body = (document.getElementById('compose-body') as HTMLTextAreaElement).value.trim();
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
      });
      overlay.remove();
    } catch (e) {
      alert(`Send failed: ${e}`);
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  });

  document.getElementById('btn-archive-reader')!.addEventListener('click', async () => {
    if (!account) return;
    await archiveThread(account, t);
    threads = threads.filter(x => x.id !== t.id);
    renderInbox();
    overlay.remove();
  });
  document.getElementById('btn-block-reader')!.addEventListener('click', async () => {
    if (!account) return;
    if (!confirm(`Block all email from ${t.senderEmail}?`)) return;
    await blockSender(account, t);
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

// ── Start ─────────────────────────────────────────────────
boot();
