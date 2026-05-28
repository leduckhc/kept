import { brandTokens, renderPipMark } from '/packages/ui/src/index.js';
import { createBrowserLocalMailRepository, createJsonMailStore, flagsForTriageAction, getInboxSections, parseMboxToThreads, syncGmailInbox } from '/packages/mail-core/src/index.js';
import { createProviderAdapter, disabledProvider } from '/packages/ai-core/src/index.js';
import {
  applyLocalReadState,
  createLocalReadStateStore,
  createThreadSummaryActionController,
  formatAttachmentMeta,
  hasRemoteImages,
  isThreadOpenKey,
  markThreadRead,
  normalizeReaderThread,
  sanitizeHtmlForDisplay,
} from './thread-reader.js';
import {
  GMAIL_ACCOUNT_ID,
  combineInboxThreads,
  createLocalStorageAdapter,
  filterInboxThreads,
  getGmailSyncStatus,
  getInboxSearchState,
  getSyncedGmailThreads,
  repositoryMessagesToInboxThreads,
  userFacingGmailOAuthError,
} from './gmail-connect.js';
import {
  createTriageActionController,
  filterArchivedInboxThreads,
  getThreadTriageState,
  isTriageShortcutEvent,
  resolveTriageAction,
  statusCopyForTriage,
} from './triage-actions.js';

const STORAGE_KEY = 'kept.localMailThreads.v1';
const IMPORT_META_KEY = 'kept.localMailImportMeta.v1';
const READ_STATE_KEY = 'kept.localThreadReadState.v1';
const root = document.querySelector('#root');
const gmailAdapter = window.__KEPT_GMAIL_CONNECT__ || null;
const aiRuntime = window.__KEPT_AI__ || {};
const storageAdapter = createLocalStorageAdapter(localStorage);
const mailStore = createJsonMailStore({ storage: storageAdapter });
const mailRepositoryPromise = createBrowserLocalMailRepository({
  storage: storageAdapter,
  key: 'kept.localMailRepository.v1',
});
const readStateStore = createLocalReadStateStore(localStorage, READ_STATE_KEY);
const aiAuditStore = {
  async recordAiAudit(entry) {
    const repository = await mailRepositoryPromise;
    return repository.recordAiAudit(entry);
  },
};
const aiSettings = aiRuntime.settings || disabledProvider;
const aiAdapter = aiRuntime.adapter || createProviderAdapter(aiSettings, {
  call: aiRuntime.call,
  transport: aiRuntime.transport,
  keyStore: aiRuntime.keyStore,
  auditStore: aiRuntime.auditStore || aiAuditStore,
});
let pendingSummaryController = null;
let gmailStateEpoch = 0;

const state = {
  threads: loadThreads(),
  importMeta: loadImportMeta(),
  searchQuery: '',
  activeThreadId: null,
  lastFocusedRowId: null,
  ai: {
    approval: null,
    summary: null,
    status: 'idle',
    errorMessage: '',
  },
  gmail: {
    status: 'never-connected',
    threads: [],
    errorMessage: '',
    accountId: GMAIL_ACCOUNT_ID,
  },
  triage: {
    statusByThreadId: {},
  },
  imagePermissionByMessageId: {},
};

document.documentElement.style.setProperty('--accent', brandTokens.color.accent);
document.documentElement.style.setProperty('--paper', brandTokens.color.paper);
document.documentElement.style.setProperty('--ink', brandTokens.color.ink);
renderApp();
initializeGmailState();

window.addEventListener('keydown', (event) => {
  if (state.activeThreadId && event.key === 'Escape') {
    event.preventDefault();
    closeThreadReader();
    return;
  }
  if (state.activeThreadId && isTriageShortcutEvent(event)) {
    const intent = triageIntentForShortcut(event);
    if (intent) {
      event.preventDefault();
      applyTriageToActiveThread(intent);
      return;
    }
  }
  const wantsCommandSearch = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
  if (!wantsCommandSearch) return;
  event.preventDefault();
  document.querySelector('#inbox-search')?.focus();
});

async function initializeGmailState() {
  const initialEpoch = gmailStateEpoch;
  const repository = await mailRepositoryPromise;
  if (hasActiveGmailMutation(initialEpoch)) return;

  const repositoryMessages = await repository.listMessages({ accountId: state.gmail.accountId });
  if (hasActiveGmailMutation(initialEpoch)) return;

  if (repositoryMessages.length > 0) {
    const connector = await getOptionalGmailConnector();
    if (hasActiveGmailMutation(initialEpoch)) return;
    if (connector) await retryQueuedTriageActions(repository, connector);
    if (hasActiveGmailMutation(initialEpoch)) return;
    state.gmail.threads = repositoryMessagesToInboxThreads(await repository.listMessages({ accountId: state.gmail.accountId }));
    state.gmail.status = (await repository.getSyncState(state.gmail.accountId))?.status || 'connected';
  } else {
    const syncState = await mailStore.loadSyncState();
    if (hasActiveGmailMutation(initialEpoch)) return;
    state.gmail.threads = getSyncedGmailThreads(syncState, { accountId: state.gmail.accountId });
    state.gmail.status = getGmailSyncStatus(syncState, { accountId: state.gmail.accountId });
  }
  renderApp();
}

function markGmailMutation() {
  gmailStateEpoch += 1;
}

function hasActiveGmailMutation(initialEpoch) {
  return initialEpoch !== gmailStateEpoch;
}

function renderApp() {
  const allThreads = applyLocalReadState(combineInboxThreads(state.gmail.threads, state.threads), readStateStore.load()).map(applyTriageStatus);
  const activeThread = state.activeThreadId ? allThreads.find((thread) => thread.id === state.activeThreadId) : null;
  if (state.activeThreadId && !activeThread) state.activeThreadId = null;
  if (activeThread) {
    root.replaceChildren(renderThreadReader(normalizeReaderThread(activeThread), activeThread));
    wireThreadReaderControls();
    return;
  }

  const visibleThreads = filterInboxThreads(filterArchivedInboxThreads(allThreads), state.searchQuery);
  const inboxNow = newestThreadDate(visibleThreads) || newestThreadDate(allThreads) || new Date();
  const sections = getInboxSections(visibleThreads, { now: inboxNow });
  const inboxCount = allThreads.length;
  const visibleCount = visibleThreads.length;
  const unreadCount = visibleThreads.filter((thread) => thread.isUnread).length;
  const newSenders = getNewSenders(visibleThreads);
  const searchState = getInboxSearchState({
    enabled: inboxCount > 0,
    indexing: state.gmail.status === 'syncing',
    stale: state.gmail.status === 'sync-error' && state.gmail.threads.length > 0,
    errorMessage: state.gmail.status === 'sync-error' && state.gmail.threads.length === 0 ? state.gmail.errorMessage : '',
    query: state.searchQuery,
    totalCount: inboxCount,
    visibleCount,
  });

  root.replaceChildren(renderInboxShell({ sections, inboxCount, visibleCount, unreadCount, newSenders, searchState }));
  wireGmailControls();
  wireImportControls();
  wireSearchControl();
  wireThreadRows();
}

function renderInboxShell({ sections, inboxCount, visibleCount, unreadCount, newSenders, searchState }) {
  const shell = el('main', { className: 'shell', ariaLabel: 'Kept inbox' });
  const surface = el('section', { className: 'inbox-surface' });
  surface.append(renderTopBar({ inboxCount, visibleCount, unreadCount, searchState }), renderGmailStatus());
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

function renderTopBar({ inboxCount, visibleCount, unreadCount, searchState }) {
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

  const status = el('div', { className: 'status-pill', ariaLabel: 'Local-first, bring your own AI, and search status' });
  status.append(
    el('span', { className: 'status-dot', ariaHidden: 'true' }),
    el('span', { text: `Local mail · ${searchState.label} · BYO AI ${disabledProvider.status}` }),
  );

  topbar.append(brand, title, search, status);
  return topbar;
}

function renderGmailStatus() {
  const status = el('section', {
    className: `gmail-status ${state.gmail.status}`,
    ariaLabel: 'Gmail connection status',
    role: 'status',
    ariaLive: 'polite',
  });
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
      detail: 'Finish Gmail sign-in in your browser, then return to Kept. Mail stays local on this device.',
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
      detail: state.gmail.errorMessage || 'Reconnect Gmail to keep triage syncing. Existing local mail stays available.',
    };
  }
  if (state.gmail.status === 'oauth-denied') {
    return {
      title: 'Gmail sign-in is blocked for this alpha',
      detail: state.gmail.errorMessage || 'Ask to be added as a Kept Google OAuth test user, or import a Gmail Takeout mbox while verification is pending.',
    };
  }
  if (state.gmail.status === 'sync-error') {
    return {
      title: 'Gmail sync did not finish',
      detail: state.gmail.errorMessage || 'Try syncing again. Existing local mail stays available and triage will queue safely.',
    };
  }
  return {
    title: 'Real mail only — no demo inbox loaded',
    detail: 'Connect Gmail for local sync, or import a Gmail Takeout mbox fallback. No mock inbox is loaded.',
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
      body: 'Kept opened Gmail sign-in. Return here once approval is complete and Kept will keep mail local on this device.',
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
    const isRevoked = state.gmail.status === 'auth-revoked';
    return {
      eyebrow: isRevoked ? 'Reconnect needed' : 'Google verification needed',
      title: isRevoked ? 'Gmail access expired.' : 'Google blocked this alpha sign-in.',
      body: isRevoked ? 'Reconnect Gmail to keep triage syncing. Existing local mail stays available.' : (state.gmail.errorMessage || 'Your Google account must be added as a Kept test user before Gmail sync can finish. Nothing synced locally yet.'),
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
  const triage = getThreadTriageState(thread);
  const status = state.triage.statusByThreadId[thread.id];
  const row = el('article', {
    className: `thread-row${triage.read ? '' : ' unread'}${triage.starred ? ' starred' : ''}${sectionId === 'priority' ? ' priority' : ''}`,
    ariaLabel: `${thread.sender}, ${thread.subject}, ${formatTime(thread.receivedAt)}`,
  });
  row.id = rowIdForThread(thread.id);
  row.dataset.threadId = thread.id;

  const open = el('button', {
    type: 'button',
    className: 'thread-open-button',
    ariaLabel: `${thread.sender}, ${thread.subject}, ${formatTime(thread.receivedAt)}. Open thread`,
  });
  open.setAttribute('data-thread-open', 'true');
  open.append(
    el('span', { className: 'unread-dot', ariaHidden: 'true' }),
    renderAvatar(thread),
    el('strong', { className: 'sender-name', text: thread.sender }),
    el('span', { className: 'subject', text: thread.subject }),
    el('span', { className: 'snippet', text: thread.snippet || '' }),
    status ? renderTriageStatus(status, { inline: true }) : null,
    el('time', { className: 'time', text: formatTime(thread.receivedAt), dateTime: thread.receivedAt }),
  );

  row.append(open, renderThreadTriageControls(thread));
  return row;
}

function renderThreadTriageControls(thread) {
  const triage = getThreadTriageState(thread);
  const actions = el('div', { className: 'triage-actions', ariaLabel: `Actions for ${thread.sender}: ${thread.subject}` });
  actions.append(
    triageButton('archive', 'Archive', 'Archive message'),
    triageButton('read-toggle', triage.read ? 'Unread' : 'Read', triage.read ? 'Mark unread' : 'Mark read'),
    triageButton('star-toggle', triage.starred ? 'Starred' : 'Star', triage.starred ? 'Remove star' : 'Star message', triage.starred),
  );
  return actions;
}

function renderReaderTriageBar(thread) {
  const bar = el('section', { className: 'reader-triage-bar', ariaLabel: `Triage thread: ${thread.subject || 'message'}` });
  bar.append(renderThreadTriageControls(thread));
  const status = state.triage.statusByThreadId[thread.id];
  if (status) bar.append(renderTriageStatus(status));
  return bar;
}

function renderTriageStatus(status, { inline = false } = {}) {
  return el('span', {
    className: `triage-status${inline ? ' triage-status-inline' : ''}`,
    text: statusCopyForTriage(status),
    role: 'status',
    ariaLive: 'polite',
  });
}

function triageButton(intent, label, ariaLabel, pressed = false) {
  const button = el('button', { type: 'button', className: `triage-action ${intent}`, text: label, ariaLabel });
  button.setAttribute('data-triage-intent', intent);
  if (pressed) button.setAttribute('aria-pressed', 'true');
  return button;
}

function renderThreadReader(reader, sourceThread = null) {
  const shell = el('main', { className: 'shell reader-shell', ariaLabel: 'Kept thread reader' });
  const surface = el('article', { className: 'reader-surface' });
  const header = el('header', { className: 'reader-header' });
  header.append(
    el('button', { type: 'button', className: 'secondary-mail-action reader-back', text: '← Back to inbox', id: 'reader-back' }),
    renderReaderTitle(reader),
  );
  if (reader.gmailUrl) {
    const gmailLink = el('a', { className: 'secondary-mail-action reader-gmail-link', text: 'Open in Gmail', href: reader.gmailUrl, target: '_blank', rel: 'noreferrer' });
    header.append(gmailLink);
  }
  surface.append(header, renderReaderTriageBar(sourceThread || reader), renderReaderMeta(reader), renderReaderSummaryPanel(reader));
  reader.messages.forEach((message) => surface.append(renderReaderMessage(message)));
  shell.append(surface);
  return shell;
}

function renderReaderTitle(reader) {
  const title = el('div', { className: 'reader-title' });
  title.append(el('p', { className: 'eyebrow', text: 'Local thread' }), el('h1', { text: reader.subject }));
  return title;
}

function renderReaderMeta(reader) {
  const meta = el('section', { className: 'reader-meta', ariaLabel: 'Thread metadata' });
  meta.append(
    renderMetaRow('From', reader.sender.label),
    renderMetaRow('To', reader.recipients.length ? reader.recipients.map((recipient) => recipient.label).join(', ') : 'No recipients saved'),
    renderMetaRow('Date', reader.dateLabel),
  );
  return meta;
}

function renderMetaRow(label, value) {
  const row = el('p', { className: 'reader-meta-row' });
  row.append(el('strong', { text: label }), el('span', { text: value }));
  return row;
}

function renderReaderSummaryPanel(reader) {
  const panel = el('section', { className: 'reader-ai-panel', ariaLabel: 'AI thread summary' });
  panel.append(
    el('div', { className: 'reader-ai-copy' }),
  );
  const copy = panel.querySelector('.reader-ai-copy');
  copy.append(el('h2', { text: 'Summarize this thread' }));
  copy.append(el('p', { text: 'Kept only sends this selected thread after you approve the exact provider, model, action, content preview, and hash.' }));

  if (state.ai.summary) {
    panel.append(el('div', { className: 'reader-ai-result', text: state.ai.summary }));
  }
  if (state.ai.errorMessage) {
    panel.append(el('p', { className: 'reader-ai-error', text: state.ai.errorMessage }));
  }
  if (state.ai.approval?.selectedThreadId === reader.id) {
    panel.append(renderApprovalGate(state.ai.approval));
  }

  const actions = el('div', { className: 'reader-ai-actions' });
  actions.append(el('button', { type: 'button', className: 'primary-mail-action', text: state.ai.status === 'preparing' ? 'Preparing…' : 'Summarize selected thread', id: 'summarize-thread', disabled: state.ai.status === 'preparing' || state.ai.status === 'sending' }));
  panel.append(actions);
  return panel;
}

function renderApprovalGate(approval) {
  const gate = el('section', { className: 'reader-ai-approval', ariaLabel: 'Approve AI request' });
  gate.append(
    renderMetaRow('Provider', approval.provider || 'none'),
    renderMetaRow('Model', approval.model || 'not set'),
    renderMetaRow('Action', approval.action),
    renderMetaRow('Content boundary', `Selected thread only: ${approval.selectedThreadId}`),
    renderMetaRow('Payload hash', approval.payloadHash),
    el('pre', { className: 'reader-ai-preview', text: approval.payloadPreview }),
  );
  const actions = el('div', { className: 'reader-ai-actions' });
  actions.append(
    el('button', { type: 'button', className: 'primary-mail-action', text: state.ai.status === 'sending' ? 'Sending…' : 'Approve and send once', id: 'approve-summary', disabled: state.ai.status === 'sending' }),
    el('button', { type: 'button', className: 'secondary-mail-action', text: 'Cancel', id: 'cancel-summary' }),
  );
  gate.append(actions);
  return gate;
}

function renderReaderMessage(message) {
  const article = el('section', { className: 'reader-message', ariaLabel: `Message from ${message.sender.label}` });
  article.append(renderMessageHeader(message));
  if (message.remoteImagesBlocked) {
    if (state.imagePermissionByMessageId[message.id]) {
      const badge = el('p', { className: 'reader-remote-images-loaded', text: '🔓 Remote images loaded.' });
      article.append(badge);
      const bodyDiv = el('div', { className: 'reader-body reader-body-html' });
      bodyDiv.innerHTML = sanitizeHtmlForDisplay(message.htmlBody || message.body);
      article.append(bodyDiv);
    } else {
      const badge = el('p', { className: 'reader-remote-images-blocked' });
      badge.append(el('span', { text: '🔒 Remote images blocked — message text only.' }));
      const loadBtn = el('button', { type: 'button', className: 'load-images-btn', text: 'Load images' });
      loadBtn.setAttribute('data-message-id', message.id);
      badge.append(loadBtn);
      article.append(badge);
      article.append(el('pre', { className: 'reader-body', text: message.body }));
    }
  } else {
    article.append(el('pre', { className: 'reader-body', text: message.body }));
  }
  if (message.attachments.length > 0) article.append(renderAttachments(message.attachments));
  return article;
}

function renderMessageHeader(message) {
  const header = el('div', { className: 'reader-message-header' });
  header.append(
    el('strong', { text: message.sender.label }),
    el('time', { text: message.dateLabel, dateTime: message.dateTime }),
  );
  return header;
}

function renderAttachments(attachments) {
  const section = el('section', { className: 'reader-attachments', ariaLabel: 'Attachment metadata' });
  section.append(el('h2', { text: 'Attachments' }));
  const list = el('ul');
  attachments.forEach((attachment) => list.append(el('li', { text: formatAttachmentMeta(attachment) })));
  section.append(list);
  return section;
}

function wireGmailControls() {
  document.querySelector('#connect-gmail')?.addEventListener('click', startGmailConnect);
  document.querySelector('#connect-gmail-empty')?.addEventListener('click', startGmailConnect);
  document.querySelector('#sync-gmail')?.addEventListener('click', syncGmail);
  document.querySelector('#clear-gmail-cache')?.addEventListener('click', async () => {
    markGmailMutation();
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

function wireThreadRows() {
  document.querySelectorAll('[data-triage-intent]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const threadId = button.closest('[data-thread-id]')?.dataset.threadId || state.activeThreadId;
      applyTriageToThread(threadId, button.getAttribute('data-triage-intent'));
    });
  });
  document.querySelectorAll('[data-thread-open]').forEach((open) => {
    const row = open.closest('[data-thread-id]');
    open.addEventListener('click', () => openThreadReader(row?.dataset.threadId, row?.id));
    open.addEventListener('keydown', (event) => {
      if (isTriageShortcutEvent(event)) {
        const intent = triageIntentForShortcut(event);
        if (intent) {
          event.preventDefault();
          applyTriageToThread(row?.dataset.threadId, intent);
          return;
        }
      }
      if (!isThreadOpenKey(event)) return;
      event.preventDefault();
      openThreadReader(row?.dataset.threadId, row?.id);
    });
  });
}

function wireThreadReaderControls() {
  document.querySelector('#reader-back')?.addEventListener('click', closeThreadReader);
  document.querySelectorAll('[data-triage-intent]').forEach((button) => {
    button.addEventListener('click', () => applyTriageToActiveThread(button.getAttribute('data-triage-intent')));
  });
  document.querySelector('#summarize-thread')?.addEventListener('click', requestThreadSummary);
  document.querySelector('#approve-summary')?.addEventListener('click', approveThreadSummary);
  document.querySelector('#cancel-summary')?.addEventListener('click', cancelThreadSummary);
  document.querySelectorAll('.load-images-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const messageId = btn.getAttribute('data-message-id');
      if (messageId) {
        state.imagePermissionByMessageId[messageId] = true;
        renderApp();
      }
    });
  });
}

async function applyTriageToActiveThread(intent) {
  if (!state.activeThreadId) return;
  await applyTriageToThread(state.activeThreadId, intent);
}

async function applyTriageToThread(threadId, intent) {
  if (!threadId || !intent) return;
  const thread = currentThreads().find((candidate) => candidate.id === threadId);
  if (!thread) return;
  const action = resolveTriageAction(thread, intent);
  const desiredFlags = flagsForTriageAction(action);
  updateThreadFlags(threadId, desiredFlags);
  state.triage.statusByThreadId[threadId] = thread.providerMessageId ? 'queued' : 'saved-locally';
  if (desiredFlags.archived) state.activeThreadId = null;
  renderApp();

  try {
    const repository = await mailRepositoryPromise;
    const connector = thread.providerMessageId ? await getOptionalGmailConnector() : null;
    const controller = createTriageActionController({ repository, connector, accountId: state.gmail.accountId });
    const result = await controller.applyThreadAction({ ...thread, flags: { ...getThreadTriageState(thread), ...desiredFlags } }, action);
    updateThreadFlags(threadId, desiredFlags);
    state.triage.statusByThreadId[threadId] = result.status;
  } catch (error) {
    state.triage.statusByThreadId[threadId] = thread.providerMessageId ? 'queued' : 'saved-locally';
  }
  renderApp();
}

function currentThreads() {
  return applyLocalReadState(combineInboxThreads(state.gmail.threads, state.threads), readStateStore.load()).map(applyTriageStatus);
}

function updateThreadFlags(threadId, desiredFlags) {
  state.gmail.threads = state.gmail.threads.map((thread) => applyFlagsToThread(thread, threadId, desiredFlags));
  state.threads = state.threads.map((thread) => applyFlagsToThread(thread, threadId, desiredFlags));
  saveLocalImport();
}

function applyFlagsToThread(thread, threadId, desiredFlags) {
  if (thread.id !== threadId) return thread;
  const flags = { ...getThreadTriageState(thread), ...desiredFlags };
  return applyTriageStatus({ ...thread, flags });
}

function applyTriageStatus(thread) {
  const triage = getThreadTriageState(thread);
  return {
    ...thread,
    flags: { ...triage },
    isUnread: !triage.read,
    isPriority: triage.starred,
    isStarred: triage.starred,
    isArchived: triage.archived,
  };
}

function triageIntentForShortcut(event) {
  const key = event?.key === 'Enter' ? 'Enter' : String(event?.key || '').toLowerCase();
  if (key === 'e') return 'archive';
  if (key === 'u') return 'read-toggle';
  if (key === 's') return 'star-toggle';
  return '';
}

async function getOptionalGmailConnector() {
  try {
    return await getGmailConnector();
  } catch (_error) {
    return null;
  }
}

async function retryQueuedTriageActions(repository, connector) {
  if (!repository || !connector?.applyTriageAction) return [];
  const controller = createTriageActionController({ repository, connector, accountId: state.gmail.accountId });
  const results = await controller.retryQueuedActions();
  results.forEach((entry) => {
    if (entry.threadId) state.triage.statusByThreadId[entry.threadId] = entry.status;
  });
  return results;
}

function createThreadSummaryController() {
  return createThreadSummaryActionController({
    threads: applyLocalReadState(combineInboxThreads(state.gmail.threads, state.threads), readStateStore.load()),
    adapter: aiAdapter,
  });
}

async function requestThreadSummary() {
  if (!state.activeThreadId) return;
  state.ai = { ...state.ai, status: 'preparing', approval: null, errorMessage: '' };
  renderApp();
  try {
    pendingSummaryController = createThreadSummaryController();
    const result = await pendingSummaryController.requestSummary(state.activeThreadId);
    if (result.status === 'approval_required') {
      state.ai = { ...state.ai, status: 'approval_required', approval: result.approval, errorMessage: '' };
    } else if (result.status === 'disabled') {
      state.ai = { ...state.ai, status: 'idle', approval: null, errorMessage: 'BYO AI is off. Enable a provider before sending thread content.' };
    } else {
      state.ai = { ...state.ai, status: 'idle', approval: null, errorMessage: userFacingError(result.error || new Error(result.status), 'Could not prepare AI summary approval.') };
    }
  } catch (error) {
    pendingSummaryController = null;
    state.ai = { ...state.ai, status: 'idle', approval: null, errorMessage: userFacingError(error, 'Could not prepare AI summary approval.') };
  }
  renderApp();
}

async function approveThreadSummary() {
  if (!state.ai.approval) return;
  const approval = state.ai.approval;
  state.ai = { ...state.ai, status: 'sending', errorMessage: '' };
  renderApp();
  try {
    const controller = pendingSummaryController;
    if (!controller) throw new Error('AI approval expired. Prepare the summary again.');
    const result = await controller.approveSummary(approval.payloadHash);
    pendingSummaryController = null;
    if (result.status === 'ok') {
      state.ai = { approval: null, summary: result.summary, status: 'done', errorMessage: '' };
    } else {
      state.ai = { ...state.ai, approval: null, status: 'idle', errorMessage: userFacingError(result.error || new Error(result.status), 'Could not summarize this thread.') };
    }
  } catch (error) {
    pendingSummaryController = null;
    state.ai = { ...state.ai, approval: null, status: 'idle', errorMessage: userFacingError(error, 'Could not summarize this thread.') };
  }
  renderApp();
}

function cancelThreadSummary() {
  pendingSummaryController?.cancelSummary();
  pendingSummaryController = null;
  state.ai = { ...state.ai, status: 'cancelled', approval: null, errorMessage: '' };
  renderApp();
}

function openThreadReader(threadId, rowId) {
  if (!threadId) return;
  state.activeThreadId = threadId;
  state.lastFocusedRowId = rowId || rowIdForThread(threadId);
  markThreadRead(readStateStore, threadId, true);
  renderApp();
}

function closeThreadReader() {
  const rowId = state.lastFocusedRowId;
  state.activeThreadId = null;
  state.imagePermissionByMessageId = {};
  renderApp();
  if (rowId) document.getElementById(rowId)?.focus();
}

async function startGmailConnect() {
  markGmailMutation();
  state.gmail.status = 'oauth-pending';
  state.gmail.errorMessage = '';
  renderApp();

  try {
    if (!gmailAdapter?.startOAuth) throw new Error('Gmail desktop bridge is not available in this build.');
    await gmailAdapter.startOAuth({ accountId: state.gmail.accountId });
    await syncGmail();
  } catch (error) {
    state.gmail.status = error?.code === 'GMAIL_AUTH_REVOKED' ? 'auth-revoked' : 'oauth-denied';
    state.gmail.errorMessage = userFacingGmailOAuthError(error, 'Could not finish Gmail sign-in.');
    renderApp();
  }
}

async function syncGmail() {
  markGmailMutation();
  state.gmail.status = 'syncing';
  state.gmail.errorMessage = '';
  renderApp();

  try {
    const connector = await getGmailConnector();
    const repository = await mailRepositoryPromise;
    await retryQueuedTriageActions(repository, connector);
    const result = await syncGmailInbox({ connector, accountId: state.gmail.accountId, repository, mailStore, maxResults: 25 });
    const repositoryMessages = await repository.listMessages({ accountId: state.gmail.accountId });
    state.gmail.threads = repositoryMessagesToInboxThreads(repositoryMessages).map(toPersistedThread);
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
  const { body: _body, textBody: _textBody, raw: _raw, payload: _payload, accessToken: _accessToken, refreshToken: _refreshToken, ...safeThread } = thread;
  return {
    ...safeThread,
    searchTokens: createSearchTokens(thread),
  };
}

function createSearchTokens(thread) {
  return [
    thread.sender,
    thread.senderEmail,
    thread.subject,
    thread.snippet,
    thread.body,
    thread.textBody,
    ...(Array.isArray(thread.recipients) ? thread.recipients : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}@._-]+|[^\p{L}\p{N}@._-]+$/gu, ''))
    .filter(Boolean);
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

function rowIdForThread(threadId) {
  return `thread-row-${String(threadId).replace(/[^a-z0-9_-]/gi, '-')}`;
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
    else if (key === 'ariaLive') node.setAttribute('aria-live', value);
    else if (key === 'ariaHidden') node.setAttribute('aria-hidden', String(value));
    else if (key === 'dateTime') node.setAttribute('datetime', value);
    else if (key === 'dataImportMbox') node.setAttribute('data-import-mbox', 'true');
    else node[key] = value;
  });
  return node;
}
