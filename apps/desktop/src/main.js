import { brandTokens, renderPipMark } from '/packages/ui/src/index.js';
import { getInboxSections, parseMboxToThreads } from '/packages/mail-core/src/index.js';
import { disabledProvider } from '/packages/ai-core/src/index.js';

const STORAGE_KEY = 'kept.localMailThreads.v1';
const IMPORT_META_KEY = 'kept.localMailImportMeta.v1';
const root = document.querySelector('#root');

const state = {
  threads: loadThreads(),
  importMeta: loadImportMeta(),
};

document.documentElement.style.setProperty('--accent', brandTokens.color.accent);
document.documentElement.style.setProperty('--paper', brandTokens.color.paper);
document.documentElement.style.setProperty('--ink', brandTokens.color.ink);
renderApp();

window.addEventListener('keydown', (event) => {
  const wantsCommandSearch = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
  if (!wantsCommandSearch) return;
  event.preventDefault();
  document.querySelector('#inbox-search')?.focus();
});

function renderApp() {
  const inboxNow = newestThreadDate(state.threads) || new Date();
  const sections = getInboxSections(state.threads, { now: inboxNow });
  const inboxCount = state.threads.length;
  const unreadCount = state.threads.filter((thread) => thread.isUnread).length;
  const newSenders = getNewSenders(state.threads);

  root.replaceChildren(renderInboxShell({ sections, inboxCount, unreadCount, newSenders }));
  wireImportControls();
}

function renderInboxShell({ sections, inboxCount, unreadCount, newSenders }) {
  const shell = el('main', { className: 'shell', ariaLabel: 'Kept inbox' });
  const surface = el('section', { className: 'inbox-surface' });
  surface.append(renderTopBar({ inboxCount, unreadCount }), renderImportStatus());
  if (inboxCount === 0) {
    surface.append(renderEmptyImportState());
  } else {
    surface.append(renderNewSenders(newSenders), renderInboxSections(sections));
  }
  shell.append(surface);
  return shell;
}

function renderTopBar({ inboxCount, unreadCount }) {
  const topbar = el('header', { className: 'topbar' });

  const brand = el('div', { className: 'brand' });
  const pipWrap = el('span', { className: 'pip-wrap', ariaHidden: 'true' });
  pipWrap.innerHTML = renderPipMark();
  brand.append(pipWrap, el('span', { className: 'brand-copy', text: 'Pip / Kept' }));

  const title = el('div', { className: 'inbox-title' });
  title.append(
    el('h1', { text: 'Inbox' }),
    el('span', { className: 'inbox-count', text: inboxCount === 0 ? 'No local mail imported' : `${inboxCount} messages · ${unreadCount} unread` }),
  );

  const search = el('label', { className: 'search-box', ariaLabel: 'Ask or search mail' });
  search.append(
    el('span', { className: 'search-icon', text: '⌕', ariaHidden: 'true' }),
    el('input', {
      id: 'inbox-search',
      type: 'search',
      placeholder: 'Search imported mail',
      ariaLabel: 'Search imported mail',
      disabled: inboxCount === 0,
    }),
    el('kbd', { text: '⌘K' }),
  );

  const status = el('div', { className: 'status-pill', ariaLabel: 'Local-first and bring your own AI status' });
  status.append(
    el('span', { className: 'status-dot', ariaHidden: 'true' }),
    el('span', { text: `Local import · BYO AI ${disabledProvider.status}` }),
  );

  topbar.append(brand, title, search, status);
  return topbar;
}

function renderImportStatus() {
  const status = el('section', { className: 'import-status', ariaLabel: 'Local mail import status' });
  const copy = el('div');
  copy.append(
    el('strong', { text: state.importMeta ? `Imported ${state.importMeta.count} messages` : 'Real mail only — no demo inbox loaded' }),
    el('span', { text: state.importMeta ? `${state.importMeta.fileName} · ${formatImportedAt(state.importMeta.importedAt)}` : 'Import a Gmail Takeout .mbox file to populate this inbox locally.' }),
  );
  const actions = el('div', { className: 'import-actions' });
  actions.append(renderImportButton(state.importMeta ? 'Import another mbox' : 'Import Gmail Takeout mbox'));
  if (state.threads.length > 0) {
    actions.append(el('button', { type: 'button', className: 'clear-import', text: 'Clear local import', id: 'clear-local-import' }));
  }
  status.append(copy, actions);
  return status;
}

function renderEmptyImportState() {
  const empty = el('section', { className: 'empty-import', ariaLabel: 'Import real mail' });
  empty.append(
    el('p', { className: 'eyebrow', text: 'No mock inbox' }),
    el('h2', { text: 'Bring in your real Gmail export.' }),
    el('p', { text: 'Kept now starts empty. Choose a Gmail Takeout .mbox file and it parses the inbox on this Mac. Nothing is uploaded to a Kept server.' }),
    renderImportButton('Choose .mbox file'),
    el('p', { className: 'import-help', text: 'Gmail path: Google Takeout → Mail → export → unzip → choose the .mbox file.' }),
  );
  return empty;
}

function renderImportButton(label) {
  const wrap = el('label', { className: 'import-button' });
  wrap.append(
    el('span', { text: label }),
    el('input', { type: 'file', accept: '.mbox,text/plain,application/mbox', className: 'visually-hidden', dataImportMbox: true }),
  );
  return wrap;
}

function renderNewSenders(newSenders) {
  const section = el('section', { className: 'new-senders', ariaLabel: 'New senders' });
  section.append(renderSectionHeader('New senders', `${newSenders.length} from import`));

  const railWrap = el('div', { className: 'carousel-wrap' });
  railWrap.append(el('button', { className: 'carousel-control', type: 'button', text: '‹', ariaLabel: 'Previous new senders' }));

  const rail = el('div', { className: 'sender-rail', role: 'list' });
  if (newSenders.length === 0) {
    rail.append(el('p', { className: 'empty-row', text: 'No new senders detected in this import.' }));
  } else {
    newSenders.forEach((sender) => rail.append(renderSenderCard(sender)));
  }
  railWrap.append(rail, el('button', { className: 'carousel-control', type: 'button', text: '›', ariaLabel: 'Next new senders' }));

  section.append(railWrap);
  return section;
}

function renderSenderCard(sender) {
  const card = el('article', { className: 'sender-card', role: 'listitem' });
  card.append(
    renderAvatar(sender),
    el('strong', { text: sender.sender }),
    el('span', { className: 'sender-email', text: sender.senderEmail || 'local import' }),
    el('p', { text: sender.subject }),
  );

  const actions = el('div', { className: 'sender-actions' });
  actions.append(
    el('button', { type: 'button', className: 'accept', text: 'Keep', ariaLabel: `Keep ${sender.sender}` }),
    el('button', { type: 'button', className: 'block', text: 'Mute', ariaLabel: `Mute ${sender.sender}` }),
  );
  card.append(actions);
  return card;
}

function renderInboxSections(sections) {
  const list = el('section', { className: 'inbox-list', ariaLabel: 'Messages grouped by date' });
  sections.forEach((section) => list.append(renderThreadSection(section)));
  return list;
}

function renderThreadSection(section) {
  const group = el('section', { className: 'thread-section', ariaLabel: section.title });
  group.append(renderSectionHeader(section.title, `${section.threads.length} messages`));

  const rows = el('div', { className: 'rows', role: 'list' });
  if (section.threads.length === 0) {
    rows.append(el('p', { className: 'empty-row', text: `No ${section.title.toLowerCase()} mail in this import.` }));
  } else {
    section.threads.forEach((thread) => rows.append(renderThreadRow(thread, section.id)));
  }
  group.append(rows);
  return group;
}

function renderThreadRow(thread, sectionId) {
  const row = el('article', {
    className: `thread-row${thread.isUnread ? ' unread' : ''}${sectionId === 'priority' ? ' priority' : ''}`,
    role: 'listitem',
    tabIndex: 0,
    ariaLabel: `${thread.sender}, ${thread.subject}, ${formatTime(thread.receivedAt)}`,
  });

  row.append(
    el('span', { className: 'unread-dot', ariaHidden: 'true' }),
    renderAvatar(thread),
    el('strong', { className: 'sender-name', text: thread.sender }),
    el('span', { className: 'subject', text: thread.subject }),
    el('span', { className: 'snippet', text: thread.snippet || '' }),
    el('time', { className: 'time', text: formatTime(thread.receivedAt), dateTime: thread.receivedAt }),
  );

  const actions = el('div', { className: 'row-actions', ariaLabel: `Actions for ${thread.subject}` });
  actions.append(el('button', { type: 'button', text: '⋯', ariaLabel: `More actions for ${thread.subject}` }));
  row.append(actions);
  return row;
}

function wireImportControls() {
  document.querySelectorAll('[data-import-mbox]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const parsedThreads = parseMboxToThreads(text, { accountId: 'acct_local_mbox' }).map(toPersistedThread);
      state.threads = parsedThreads;
      state.importMeta = {
        fileName: file.name,
        count: parsedThreads.length,
        importedAt: new Date().toISOString(),
      };
      saveLocalImport();
      renderApp();
    });
  });

  document.querySelector('#clear-local-import')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(IMPORT_META_KEY);
    state.threads = [];
    state.importMeta = null;
    renderApp();
  });
}

function toPersistedThread(thread) {
  const { body: _body, ...safeThread } = thread;
  return safeThread;
}

function loadThreads() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function loadImportMeta() {
  try {
    return JSON.parse(localStorage.getItem(IMPORT_META_KEY) || 'null');
  } catch (_error) {
    return null;
  }
}

function saveLocalImport() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.threads));
  localStorage.setItem(IMPORT_META_KEY, JSON.stringify(state.importMeta));
}

function getNewSenders(threads) {
  const seen = new Set();
  return threads.filter((thread) => {
    const key = thread.senderEmail || thread.sender;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function newestThreadDate(threads) {
  const newest = threads
    .map((thread) => new Date(thread.receivedAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return newest || null;
}

function renderSectionHeader(title, meta) {
  const header = el('div', { className: 'section-header' });
  header.append(el('h2', { text: title }), el('span', { text: meta }));
  return header;
}

function renderAvatar(thread) {
  const avatar = el('span', { className: 'avatar', text: thread.avatarInitials || thread.sender.slice(0, 2).toUpperCase() });
  avatar.style.background = thread.avatarColor || '#ddd7f2';
  return avatar;
}

function formatTime(value) {
  const received = new Date(value);
  const now = newestThreadDate(state.threads) || new Date();
  const sameDay = received.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  if (sameDay) {
    return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(received);
  }
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(received);
}

function formatImportedAt(value) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function el(tagName, options = {}) {
  const node = document.createElement(tagName);
  Object.entries(options).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key === 'ariaLabel') node.setAttribute('aria-label', value);
    else if (key === 'ariaHidden') node.setAttribute('aria-hidden', String(value));
    else if (key === 'dateTime') node.setAttribute('datetime', value);
    else if (key === 'dataImportMbox') node.setAttribute('data-import-mbox', 'true');
    else node[key] = value;
  });
  return node;
}
