// main.ts — Kept inbox UI
import { type Account, getAccount, startOAuth } from './auth';
import { type Thread, syncInbox, loadThreads, markRead, archiveThread, blockSender, fetchMessageBody, sendEmail, groupBySection } from './gmail';

// ── State ─────────────────────────────────────────────────
let account: Account | null = null;
let threads: Thread[] = [];
let searchQuery = '';
let syncing = false;
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

function setAccount(a: Account) { account = a; }


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
    const originalHTML = btn.innerHTML;
    btn.textContent = 'Opening browser…';
    try {
      account = await startOAuth();
      showShell();
      await refresh();
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
        <span class="toolbar-title">Kept</span>
        <input class="search-input" id="search" placeholder="Search…" type="search" />
        <button class="btn-icon" id="btn-sync" title="Sync inbox">↻</button>
        <button class="btn-icon" id="btn-theme" title="Toggle theme">◑</button>
        <button class="btn-icon" id="btn-signout" title="Sign out" style="font-size:13px">Sign out</button>
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
    try {
      const db = await import('./db').then(m => m.getDb());
      const acctId = account?.id;
      await db.execute('DELETE FROM accounts WHERE 1=1');
      if (acctId != null) {
        await db.execute('DELETE FROM threads WHERE account_id = ?', [acctId]);
        await db.execute('DELETE FROM messages WHERE account_id = ?', [acctId]);
        await db.execute('DELETE FROM blocked_senders WHERE account_id = ?', [acctId]);
        await db.execute('DELETE FROM settings WHERE account_id = ?', [acctId]);
      }
      account = null;
      threads = [];
      syncing = false;
      showAuth();
    } catch (e) {
      console.error('Sign out error:', e);
    }
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
    ${s.threads.map(threadRow).join('')}
  `;
  }).join('');

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

function threadRow(t: Thread): string {
  const date = formatDate(t.receivedAt);
  const sender = t.senderName || t.senderEmail;
  const attachment = t.hasAttachment ? `<span class="attachment-icon" title="Has attachment">📎</span>` : '';
  const dot = `<span class="unread-dot${t.isUnread ? ' filled' : ''}"></span>`;
  return `
    <div class="thread-row${t.isUnread ? ' unread' : ''}" data-id="${t.id}">
      ${dot}
      ${avatarHtml(t)}
      <div class="thread-mid${attachment ? ' has-attachment' : ''}">
        <div class="thread-top">
          <span class="thread-sender">${esc(sender)}</span>
          <span class="thread-date">${date}</span>
        </div>
        <div class="thread-subject-line">${esc(t.subject)}</div>
        <div class="thread-preview-line">${esc(t.snippet)}</div>
      </div>
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
  try {
    await markRead(account, t);
    const fresh = await getAccount();
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
    const fresh = await getAccount();
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
  const fresh = await getAccount();
  if (fresh) setAccount(fresh);
  // Remove all rows from this sender
  threads = threads.filter(x => x.senderEmail !== t.senderEmail);
  renderInbox();
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
      alert(`Send failed: ${e}`);
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  });

  document.getElementById('btn-archive-reader')!.addEventListener('click', async () => {
    if (!account) return;
    await archiveThread(account, t);
    const fresh = await getAccount();
    if (fresh) setAccount(fresh);
    threads = threads.filter(x => x.id !== t.id);
    renderInbox();
    overlay.remove();
  });
  document.getElementById('btn-block-reader')!.addEventListener('click', async () => {
    if (!account) return;
    if (!confirm(`Block all email from ${t.senderEmail}?`)) return;
    await blockSender(account, t);
    const fresh = await getAccount();
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

// ── Start ─────────────────────────────────────────────────
boot();
