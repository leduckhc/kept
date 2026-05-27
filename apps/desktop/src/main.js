import { brandTokens, renderPipMark } from '/packages/ui/src/index.js';
import { createJsonMailStore, getInboxSections, parseMboxToThreads, syncGmailInbox } from '/packages/mail-core/src/index.js';
import { disabledProvider } from '/packages/ai-core/src/index.js';
import {
  GMAIL_ACCOUNT_ID,
  combineInboxThreads,
  createLocalStorageAdapter,
  filterInboxThreads,
  getGmailSyncStatus,
  getSyncedGmailThreads,
} from './gmail-connect.js';

const STORAGE_KEY = 'kept.localMailThreads.v1';
const IMPORT_META_KEY = 'kept.localMailImportMeta.v1';
const root = document.querySelector('#root');
const gmailAdapter = window.__KEPT_GMAIL_CONNECT__ || null;
const mailStore = createJsonMailStore({ storage: createLocalStorageAdapter(localStorage) });

const state = {
  threads: loadThreads(),
  importMeta: loadImportMeta(),
  searchQuery: '',
  gmail: {
    status: 'never-connected',
    threads: [],
    errorMessage: '',
    accountId: GMAIL_ACCOUNT_ID,
  },
};

document.documentElement.style.setProperty('--accent', brandTokens.color.accent);
document.documentElement.style.setProperty('--paper', brandTokens.color.paper);
document.documentElement.style.setProperty('--ink', brandTokens.color.ink);
renderApp();
initializeGmailState();

window.addEventListener('keydown', (event) => {
  const wantsCommandSearch = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
  if (!wantsCommandSearch) return;
  event.preventDefault();
  document.querySelector('#inbox-search')?.focus();
});

async function initializeGmailState() {
  const syncState = await mailStore.loadSyncState();
  state.gmail.threads = getSyncedGmailThreads(syncState, { accountId: state.gmail.accountId });
  state.gmail.status = getGmailSyncStatus(syncState, { accountId: state.gmail.accountId });
  renderApp();
}

function renderApp() {
  const allThreads = combineInboxThreads(state.gmail.threads, state.threads);
  const visibleThreads = filterInboxThreads(allThreads, state.searchQuery);
  const inboxNow = newestThreadDate(visibleThreads) || newestThreadDate(allThreads) || new Date();
  const sections = getInboxSections(visibleThreads, { now: inboxNow });
  const inboxCount = allThreads.length;
  const visibleCount = visibleThreads.length;
  const unreadCount = visibleThreads.filter((thread) => thread.isUnread).length;
  const newSenders = getNewSenders(visibleThreads);

  root.replaceChildren(renderInboxShell({ sections, inboxCount, visibleCount, unreadCount, newSenders }));
  wireGmailControls();
  wireImportControls();
  wireSearchControl();
}

function renderInboxShell({ sections, inboxCount, visibleCount, unreadCount, newSenders }) {
  const shell = el('main', { className: 'shell', ariaLabel: 'Kept inbox' });
  const surface = el('section', { className: 'inbox-surface' });
  surface.append(renderTopBar({ inboxCount, visibleCount, unreadCount }), renderGmailStatus());
  if (inboxCount === 0) {
    surface.append(renderEmptyGmailState());
  } else if (visibleCount === 0) {
    surface.append(renderSearchEmptyState());
  } else {
    surface.append(renderNewSenders(newSenders), renderInboxSections(sections));
  }
  shell.append(surface);
  return shell;
}

function renderTopBar({ inboxCount, visibleCount, unreadCount }) {
  const topbar = el('header', { className: 'topbar' });

  const brand = el('div', { className: 'brand' });
  const pipWrap = el('span', { className: 'pip-wrap', ariaHidden: 'true' });
  pipWrap.innerHTML = renderPipMark();
  brand.append(pipWrap, el('span', { className: 'brand-copy', text: 'Pip / Kept' }));

  const title = el('div', { className: 'inbox-title' });
  title.append(
    el('h1', { text: 'Inbox' }),
    el('span', { className: 'inbox-count', text: formatInboxCount({ inboxCount, visibleCount, unreadCount }) }),
  );

  const search = el('label', { className: 'search-box', ariaLabel: 'Search synced local inbox' });
  search.append(
    el('span', { className: 'search-icon', text: '⌕', ariaHidden: 'true' }),
    el('input', {
      id: 'inbox-search',
      type: 'search',
      placeholder: 'Search local inbox',
      ariaLabel: 'Search synced local inbox',
      disabled: inboxCount === 0,
      value: state.searchQuery,
    }),
    el('kbd', { text: '⌘K' }),
  );

  const status = el('div', { className: 'status-pill', ariaLabel: 'Local-first and bring your own AI status' });
  status.append(
    el('span', { className: 'status-dot', ariaHidden: 'true' }),
    el('span', { text: `Local mail · BYO AI ${disabledProvider.status}` }),
  );

  topbar.append(brand, title, search, status);
  return topbar;
}

function renderGmailStatus() {
  const status = el('section', { className: `gmail-status ${state.gmail.status}`, ariaLabel: 'Gmail connection status' });
  const copy = el('div');
  const statusCopy = gmailStatusCopy();
  copy.append(
    el('strong', { text: statusCopy.title }),
    el('span', { text: statusCopy.detail }),
  );
  const actions = el('div', { className: 'mail-actions' });

  if ((state.gmail.status === 'never-connected' || state.gmail.status === 'oauth-denied' || state.gmail.status === 'auth-revoked') && state.gmail.threads.length > 0) {
    actions.append(el('button', { type: 'button', className: 'primary-mail-action', text: 'Connect Gmail', id: 'connect-gmail' }));
  }
  if (state.gmail.status === 'connected' || state.gmail.status === 'connected-empty' || state.gmail.status === 'sync-error') {
    actions.append(el('button', { type: 'button', className: 'primary-mail-action', text: 'Sync now', id: 'sync-gmail' }));
  }
  if (state.gmail.threads.length > 0) {
    actions.append(el('button', { type: 'button', className: 'secondary-mail-action', text: 'Clear Gmail cache', id: 'clear-gmail-cache' }));
  }
  actions.append(renderImportButton(state.importMeta ? 'Import another mbox' : 'Import mbox fallback', 'secondary-mail-action'));

  status.append(copy, actions);
  return status;
}

function gmailStatusCopy() {
  if (state.gmail.status === 'oauth-pending') {
    return {
      title: 'Opening Gmail sign-in',
      detail: 'Finish the readonly Gmail consent in your browser, then return to Kept.',
    };
  }
  if (state.gmail.status === 'syncing') {
    return {
      title: 'Syncing recent Gmail',
      detail: 'Kept is saving recent inbox rows locally on this device.',
    };
  }
  if (state.gmail.status === 'connected') {
    return {
      title: `Gmail connected · ${formatPlural(state.gmail.threads.length, 'local message')}`,
      detail: 'Recent Gmail appears first. Bodies and OAuth tokens are not logged.',
    };
  }
  if (state.gmail.status === 'connected-empty') {
    return {
      title: 'Gmail connected · no inbox mail yet',
      detail: 'Kept checked Gmail and did not find recent inbox rows. Sync again anytime.',
    };
  }
  if (state.gmail.status === 'auth-revoked') {
    return {
      title: 'Gmail access needs reconnecting',
      detail: state.gmail.errorMessage || 'Reconnect Gmail to refresh readonly access. Existing local mail stays available.',
    };
  }
  if (state.gmail.status === 'oauth-denied') {
    return {
      title: 'Gmail sign-in needs attention',
      detail: state.gmail.errorMessage || 'Try connecting Gmail again.',
    };
  }
  if (state.gmail.status === 'sync-error') {
    return {
      title: 'Gmail sync did not finish',
      detail: state.gmail.errorMessage || 'Try syncing again. Existing local mail stays available.',
    };
  }
  return {
    title: 'Real mail only — no demo inbox loaded',
    detail: 'Connect Gmail for readonly local sync, or import a Gmail Takeout mbox fallback.',
  };
}

function renderEmptyGmailState() {
  const copy = emptyStateCopy();
  const empty = el('section', { className: 'empty-import', ariaLabel: 'Connect Gmail' });
  empty.append(el('p', { className: 'eyebrow', text: copy.eyebrow }));
  empty.append(el('h2', { text: copy.title }));
  empty.append(el('p', { text: copy.body }));
  if (copy.actionLabel) {
    empty.append(el('button', { type: 'button', className: 'primary-mail-action large', text: copy.actionLabel, id: 'connect-gmail-empty' }));
  }
  empty.append(el('p', { className: 'import-help', text: copy.help }));
  return empty;
}

function emptyStateCopy() {
  if (state.gmail.status === 'oauth-pending') {
    return {
      eyebrow: 'Browser sign-in',
      title: 'Finish Gmail in your browser.',
      body: 'Kept opened the readonly consent flow. Return here once Gmail approval is complete.',
      actionLabel: '',
      help: 'Prefer no OAuth? You can still skip this and use the mbox fallback above for a local Gmail Takeout import.',
    };
  }
  if (state.gmail.status === 'syncing') {
    return {
      eyebrow: 'Syncing locally',
      title: 'Bringing recent Gmail into Kept.',
      body: 'This first sync is saving recent inbox rows locally on this device.',
      actionLabel: '',
      help: 'You can leave this window open. Kept will keep the mbox fallback available if you prefer a manual import later.',
    };
  }
  if (state.gmail.status === 'connected-empty') {
    return {
      eyebrow: 'Gmail connected',
      title: 'No recent inbox mail found.',
      body: 'Kept checked Gmail and saved the empty sync state locally. You can sync again or import a Takeout mbox.',
      actionLabel: '',
      help: 'The mbox fallback above remains available for older exported mail.',
    };
  }
  if (state.gmail.status === 'oauth-denied' || state.gmail.status === 'auth-revoked') {
    return {
      eyebrow: state.gmail.status === 'auth-revoked' ? 'Reconnect needed' : 'Sign-in interrupted',
      title: state.gmail.status === 'auth-revoked' ? 'Gmail access expired.' : 'Gmail did not connect yet.',
      body: state.gmail.status === 'auth-revoked' ? 'Reconnect Gmail to refresh readonly access. Existing local mail stays available.' : 'Nothing synced locally. Try Gmail again, or use the local mbox fallback if you would rather import manually.',
      actionLabel: 'Connect Gmail',
      help: 'The mbox fallback above still gives you a local Gmail Takeout import path without OAuth.',
    };
  }
  return {
    eyebrow: 'Fresh Kept',
    title: 'Connect Gmail to fill this inbox.',
    body: 'Kept starts empty. Gmail sync is readonly and stores recent mail locally on this device.',
    actionLabel: 'Connect Gmail',
    help: 'Prefer no OAuth? Use the mbox fallback above for a local Gmail Takeout import.',
  };
}

function renderSearchEmptyState() {
  const empty = el('section', { className: 'empty-import compact', ariaLabel: 'No local search results' });
  empty.append(
    el('p', { className: 'eyebrow', text: 'No matches' }),
    el('h2', { text: 'Nothing local matches that search.' }),
    el('p', { text: 'Search runs only over mail already synced or imported on this device.' }),
    el('button', { type: 'button', className: 'secondary-mail-action large', text: 'Clear search', id: 'clear-search' }),
  );
  return empty;
}

function renderImportButton(label, className = 'secondary-mail-action') {
  const wrap = el('label', { className });
  wrap.append(
    el('span', { text: label }),
    el('input', { type: 'file', accept: '.mbox,text/plain,application/mbox', className: 'visually-hidden', dataImportMbox: true }),
  );
  return wrap;
}

function renderNewSenders(newSenders) {
  const section = el('section', { className: 'new-senders', ariaLabel: 'New senders' });
  section.append(renderSectionHeader('New senders', `${newSenders.length} local`));

  const railWrap = el('div', { className: 'carousel-wrap' });
  railWrap.append(el('button', { className: 'carousel-control', type: 'button', text: '‹', ariaLabel: 'Previous new senders' }));

  const rail = el('div', { className: 'sender-rail', role: 'list' });
  if (newSenders.length === 0) {
    rail.append(el('p', { className: 'empty-row', text: 'No new senders detected in local mail.' }));
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
    el('span', { className: 'sender-email', text: sender.senderEmail || 'local mail' }),
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
  group.append(renderSectionHeader(section.title, formatPlural(section.threads.length, 'message')));

  const rows = el('div', { className: 'rows', role: 'list' });
  if (section.threads.length === 0) {
    rows.append(el('p', { className: 'empty-row', text: `No ${section.title.toLowerCase()} mail in this local inbox.` }));
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

function wireGmailControls() {
  document.querySelector('#connect-gmail')?.addEventListener('click', startGmailConnect);
  document.querySelector('#connect-gmail-empty')?.addEventListener('click', startGmailConnect);
  document.querySelector('#sync-gmail')?.addEventListener('click', syncGmail);
  document.querySelector('#clear-gmail-cache')?.addEventListener('click', async () => {
    await mailStore.clear();
    state.gmail.threads = [];
    state.gmail.status = 'never-connected';
    state.gmail.errorMessage = '';
    renderApp();
  });
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
}

function wireSearchControl() {
  const search = document.querySelector('#inbox-search');
  search?.addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderApp();
    document.querySelector('#inbox-search')?.focus();
  });
  document.querySelector('#clear-search')?.addEventListener('click', () => {
    state.searchQuery = '';
    renderApp();
  });
}

async function startGmailConnect() {
  state.gmail.status = 'oauth-pending';
  state.gmail.errorMessage = '';
  renderApp();

  try {
    if (!gmailAdapter?.startOAuth) throw new Error('Gmail desktop bridge is not available in this build.');
    await gmailAdapter.startOAuth({ accountId: state.gmail.accountId });
    await syncGmail();
  } catch (error) {
    state.gmail.status = error?.code === 'GMAIL_AUTH_REVOKED' ? 'auth-revoked' : 'oauth-denied';
    state.gmail.errorMessage = userFacingError(error, 'Could not finish Gmail sign-in.');
    renderApp();
  }
}

async function syncGmail() {
  state.gmail.status = 'syncing';
  state.gmail.errorMessage = '';
  renderApp();

  try {
    const connector = await getGmailConnector();
    const result = await syncGmailInbox({ connector, accountId: state.gmail.accountId, mailStore, maxResults: 25 });
    state.gmail.threads = result.threads.map(toPersistedThread);
    state.gmail.status = result.status || (state.gmail.threads.length > 0 ? 'connected' : 'connected-empty');
    renderApp();
  } catch (error) {
    state.gmail.status = error?.code === 'GMAIL_AUTH_REVOKED' ? 'auth-revoked' : 'sync-error';
    state.gmail.errorMessage = userFacingError(error, 'Could not sync Gmail.');
    renderApp();
  }
}

async function getGmailConnector() {
  if (gmailAdapter?.createConnector) return gmailAdapter.createConnector({ accountId: state.gmail.accountId });
  if (gmailAdapter?.listRecentMessages) return { provider: 'gmail', listRecentMessages: gmailAdapter.listRecentMessages };
  throw new Error('Gmail sync bridge is not available yet.');
}

function toPersistedThread(thread) {
  const { body: _body, textBody: _textBody, ...safeThread } = thread;
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

function formatInboxCount({ inboxCount, visibleCount, unreadCount }) {
  if (inboxCount === 0) return 'No local mail connected';
  if (visibleCount !== inboxCount) return `${visibleCount} of ${inboxCount} local messages`;
  return `${formatPlural(inboxCount, 'message')} · ${unreadCount} unread`;
}

function formatPlural(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function formatTime(value) {
  const received = new Date(value);
  const now = newestThreadDate(combineInboxThreads(state.gmail.threads, state.threads)) || new Date();
  const sameDay = received.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  if (sameDay) {
    return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(received);
  }
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(received);
}

function userFacingError(error, fallback) {
  const message = error?.message || fallback;
  if (/token|secret|authorization|code_verifier|access_token|refresh_token/i.test(message)) return fallback;
  return message;
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
