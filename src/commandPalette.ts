import { type Thread, loadThreads } from './gmail';
import { type Account } from './auth';
import { type ViewName, state } from './state';
import { esc, toggleLayoutMode } from './helpers';
import { icon } from './icons';

export interface CommandPaletteDeps {
  openThread: (t: Thread) => void;
  openThreadWithReply: (t: Thread) => void;
  openComposeNew: (subject?: string) => void;
  switchView: (view: ViewName) => void;
  showCheatSheet: () => void;
  showAuth: () => void;
  doArchive: (t: Thread, row: HTMLElement) => void;
  doToggleStar: (t: Thread, row: HTMLElement) => void;
  doMute: (t: Thread, row: HTMLElement) => void;
  doMarkUnread: (t: Thread, row: HTMLElement) => void;
  openSnoozePicker: (t: Thread, row: HTMLElement) => void;
  removeAccount: (a: Account) => Promise<void>;
  clearActiveAccountId: () => void;
  applyTheme: (theme: string) => void;
  syncAndRender: () => void;
  openSettings: () => void;
}

const CMD_RECENT_KEY = 'cmd-palette-recent';
const CMD_RECENT_MAX = 5;

export function cmdRecentGet(): string[] {
  try { return JSON.parse(localStorage.getItem(CMD_RECENT_KEY) ?? '[]'); } catch { return []; }
}

export function cmdRecentPush(id: string) {
  const list = cmdRecentGet().filter(x => x !== id);
  list.unshift(id);
  localStorage.setItem(CMD_RECENT_KEY, JSON.stringify(list.slice(0, CMD_RECENT_MAX)));
}

export function renderCommandPalette(deps: CommandPaletteDeps) {
  if (document.getElementById('cmd-palette-backdrop')) return;

  interface PaletteCommand {
    id: string;
    label: string;
    shortcut?: string;
    icon?: string;
    group?: string;
    action: () => void;
  }

  const commands: PaletteCommand[] = [
    { id: 'archive',       label: 'Archive',           shortcut: 'e', icon: icon.archive('16px'), group: 'Thread', action: () => {
      if (!state.selectedThreadId || !state.account) return;
      const t = state.threads.find(x => x.id === state.selectedThreadId); if (!t) return;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
      if (row) deps.doArchive(t, row);
    }},
    { id: 'star',          label: 'Star / Unstar',     shortcut: 's', icon: icon.star('16px'), group: 'Thread', action: () => {
      if (!state.selectedThreadId || !state.account) return;
      const t = state.threads.find(x => x.id === state.selectedThreadId); if (!t) return;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
      if (row) deps.doToggleStar(t, row);
    }},
    { id: 'mute',          label: 'Mute',              shortcut: 'm', icon: icon.mute('16px'), group: 'Thread', action: () => {
      if (!state.selectedThreadId || !state.account) return;
      const t = state.threads.find(x => x.id === state.selectedThreadId); if (!t) return;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
      if (row) deps.doMute(t, row);
    }},
    { id: 'mark-unread',   label: 'Mark as Unread',    shortcut: 'Shift+U', icon: icon.emailOpen('16px'), group: 'Thread', action: () => {
      if (!state.selectedThreadId || !state.account) return;
      const t = state.threads.find(x => x.id === state.selectedThreadId); if (!t) return;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
      if (row) deps.doMarkUnread(t, row);
    }},
    { id: 'snooze',        label: 'Snooze',            shortcut: 'h', icon: icon.snooze('16px'), group: 'Thread', action: () => {
      if (!state.selectedThreadId || !state.account) return;
      const t = state.threads.find(x => x.id === state.selectedThreadId); if (!t) return;
      const row = document.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
      if (row) deps.openSnoozePicker(t, row);
    }},
    { id: 'reply',         label: 'Reply',             shortcut: 'r', icon: icon.reply('16px'), group: 'Thread', action: () => {
      if (!state.selectedThreadId) return;
      const t = state.threads.find(x => x.id === state.selectedThreadId);
      if (t) deps.openThreadWithReply(t);
    }},
    { id: 'compose',       label: 'Compose New',       shortcut: 'c', icon: icon.pencil('16px'), group: 'Compose', action: () => deps.openComposeNew() },
    { id: 'go-inbox',      label: 'Go to Inbox',       icon: icon.email('16px'), group: 'Navigate', action: () => deps.switchView('Inbox') },
    { id: 'go-snoozed',    label: 'Go to Snoozed',     icon: icon.clock('16px'), group: 'Navigate', action: () => deps.switchView('Snoozed') },
    { id: 'go-sent',       label: 'Go to Sent',        icon: icon.send('16px'), group: 'Navigate', action: () => deps.switchView('Sent') },
    { id: 'go-drafts',     label: 'Go to Drafts',      icon: icon.pencil('16px'), group: 'Navigate', action: () => deps.switchView('Drafts') },
    { id: 'go-starred',    label: 'Go to Starred',     icon: icon.star('16px'), group: 'Navigate', action: () => deps.switchView('Starred') },
        { id: 'toggle-theme',  label: 'Toggle Theme (Light / Dark / System)',  icon: icon.theme('16px'), group: 'App', action: () => {
      const current = localStorage.getItem('theme') ?? 'light';
      const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
      deps.applyTheme(next);
    }},
    { id: 'toggle-layout', label: 'Toggle Layout (2-pane / 3-pane)', icon: icon.email('16px'), group: 'App', action: () => {
      toggleLayoutMode();
    }},
    { id: 'sync',           label: 'Sync',              shortcut: '⌘R', icon: icon.send('16px'), group: 'App', action: () => deps.syncAndRender() },
    { id: 'settings',       label: 'Settings',          icon: icon.email('16px'), group: 'App', action: () => deps.openSettings() },
    { id: 'show-shortcuts',label: 'Show Shortcuts',    shortcut: '?', icon: icon.keyboard('16px'), group: 'App', action: () => deps.showCheatSheet() },
    { id: 'sign-out',      label: 'Sign Out',          icon: icon.logout('16px'), group: 'App', action: async () => {
      if (!confirm('Sign out of all accounts? This will delete all local data.')) return;
      for (const a of state.accounts) await deps.removeAccount(a).catch(() => {});
      deps.clearActiveAccountId();
      state.account = null;
      state.accounts = [];
      state.threads = [];
      state.syncing = false;
      deps.showAuth();
    }},
  ];

  let activeIdx = 0;
  let searchMode = false;
  let searchResults: Thread[] = [];

  const backdrop = document.createElement('div');
  backdrop.id = 'cmd-palette-backdrop';

  const palette = document.createElement('div');
  palette.id = 'cmd-palette';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'cmd-palette-input-wrap';
  inputWrap.innerHTML = `<span class="cmd-palette-icon">${icon.keyboard('16px')}</span>`;

  const input = document.createElement('input');
  input.id = 'cmd-palette-input';
  input.type = 'text';
  input.placeholder = 'Search commands…';
  input.autocomplete = 'off';
  input.spellcheck = false;
  inputWrap.appendChild(input);

  const list = document.createElement('div');
  list.className = 'cmd-palette-list';

  palette.appendChild(inputWrap);
  palette.appendChild(list);
  backdrop.appendChild(palette);
  document.body.appendChild(backdrop);
  input.focus();

  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  }

  function filteredCommands(q: string): PaletteCommand[] {
    if (!q) return commands;
    const lower = q.toLowerCase();
    return commands.filter(c => c.label.toLowerCase().includes(lower));
  }

  function renderList(q: string) {
    list.innerHTML = '';
    activeIdx = 0;

    if (searchMode) {
      if (!searchResults.length) {
        list.innerHTML = '<div class="cmd-palette-empty">No threads found</div>';
        return;
      }
      searchResults.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'cmd-palette-thread' + (i === 0 ? ' active' : '');
        item.innerHTML = `<div class="cmd-palette-thread-subject">${esc(t.subject || '(no subject)')}</div>
          <div class="cmd-palette-thread-meta">${esc(t.senderName || t.senderEmail)}</div>`;
        item.addEventListener('mouseenter', () => setActive(i));
        item.addEventListener('click', () => { close(); deps.openThread(t); });
        list.appendChild(item);
      });
      return;
    }

    const matches = filteredCommands(q);
    if (!matches.length) {
      list.innerHTML = '<div class="cmd-palette-empty">No commands found</div>';
      return;
    }

    if (!q) {
      const recent = cmdRecentGet();
      const recentCmds = recent.map(id => commands.find(c => c.id === id)).filter(Boolean) as PaletteCommand[];
      if (recentCmds.length) {
        const sec = document.createElement('div');
        sec.className = 'cmd-palette-section';
        sec.textContent = 'Recent';
        list.appendChild(sec);
        recentCmds.forEach((c, i) => list.appendChild(makeItem(c, i)));
        activeIdx = 0;
        const allSec = document.createElement('div');
        allSec.className = 'cmd-palette-section';
        allSec.textContent = 'All Commands';
        list.appendChild(allSec);
        const offset = recentCmds.length;
        commands.forEach((c, i) => list.appendChild(makeItem(c, offset + i)));
      } else {
        let lastGroup = '';
        commands.forEach((c, i) => {
          if (c.group !== lastGroup) {
            lastGroup = c.group ?? '';
            const sec = document.createElement('div');
            sec.className = 'cmd-palette-section';
            sec.textContent = lastGroup;
            list.appendChild(sec);
          }
          list.appendChild(makeItem(c, i));
        });
      }
    } else {
      matches.forEach((c, i) => list.appendChild(makeItem(c, i)));
    }
  }

  function makeItem(c: PaletteCommand, idx: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'cmd-palette-item' + (idx === activeIdx ? ' active' : '');
    item.dataset.idx = String(idx);
    item.innerHTML = `
      <span class="cmd-palette-item-icon">${c.icon ?? ''}</span>
      <span class="cmd-palette-item-label">${esc(c.label)}</span>
      ${c.shortcut ? `<span class="cmd-palette-item-shortcut">${esc(c.shortcut)}</span>` : ''}
    `;
    item.addEventListener('mouseenter', () => setActive(idx));
    item.addEventListener('click', () => { close(); cmdRecentPush(c.id); c.action(); });
    return item;
  }

  function setActive(idx: number) {
    activeIdx = idx;
    list.querySelectorAll<HTMLElement>('.cmd-palette-item, .cmd-palette-thread').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      if (i === idx) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function getItems(): NodeListOf<HTMLElement> {
    return list.querySelectorAll<HTMLElement>('.cmd-palette-item, .cmd-palette-thread');
  }

  function runActive() {
    const items = getItems();
    const el = items[activeIdx];
    if (!el) return;
    el.click();
  }

  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  input.addEventListener('input', () => {
    const q = input.value.trim();

    if (!q) {
      searchMode = false;
      searchResults = [];
      renderList('');
      return;
    }

    renderList(q);

    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
      if (!state.account || !input.value.trim()) return;
      const q2 = input.value.trim();
      if (filteredCommands(q2).length === 0) {
        searchMode = true;
        const results = await loadThreads(state.account.id, q2);
        searchResults = results.slice(0, 20);
        renderList(q2);
      }
    }, 250);
  });

  async function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const items = getItems();
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
      runActive();
      return;
    }
  }
  document.addEventListener('keydown', onKey);

  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  renderList('');
}
