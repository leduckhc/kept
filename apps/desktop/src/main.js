import { brandTokens, renderPipMark } from '../../packages/ui/src/index.js';
import { classifyThread } from './classifier.js';
import { loadInboxSectionsState, saveInboxSectionsState } from './inbox-sections-state.js';
import { clearSelection, getBulkDominantReadState, getSectionCheckboxState, selectSection, toggleThreadSelection } from './bulk-selection.js';
import { createBrowserLocalMailRepository, createJsonMailStore, flagsForTriageAction, getInboxSections, parseMboxToThreads, syncGmailInbox } from '../../packages/mail-core/src/index.js';
import { createProviderAdapter, disabledProvider } from '../../packages/ai-core/src/index.js';
import {
  applyLocalReadState,
  createLocalReadStateStore,
  createSenderTrustStore,
  createLocalUnsubscribeStore,
  createThreadSummaryActionController,
  filterBannedSenderThreads,
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
import { isImageProxyAvailable, proxyImage } from './tauri-image-proxy.js';

const STORAGE_KEY = 'kept.localMailThreads.v1';
const IMPORT_META_KEY = 'kept.localMailImportMeta.v1';
const READ_STATE_KEY = 'kept.localThreadReadState.v1';
const TRUST_STORE_KEY = 'kept.senderTrust.v1';

// Icon SVGs — defined at module top so they are available when function declarations run
const TRIAGE_ICONS = {
  archive:            `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="14" height="3" rx="1"/><path d="M2 6v7a1 1 0 001 1h10a1 1 0 001-1V6"/><path d="M6 10h4"/></svg>`,
  'read-toggle-read':   `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>`,
  'read-toggle-unread': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/><line x1="2" y1="2" x2="14" y2="14"/></svg>`,
  'star-toggle-off':    `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="8 1.5 10 6 15 6.5 11.5 10 12.5 15 8 12.5 3.5 15 4.5 10 1 6.5 6 6"/></svg>`,
  'star-toggle-on':     `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="8 1.5 10 6 15 6.5 11.5 10 12.5 15 8 12.5 3.5 15 4.5 10 1 6.5 6 6"/></svg>`,
};
const inboxSectionsCollapsed = loadInboxSectionsState(typeof localStorage !== 'undefined' ? localStorage : null);
const UNSUB_STATE_KEY = 'kept.localUnsubscribeState.v1';
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
const senderTrustStore = createSenderTrustStore(localStorage, TRUST_STORE_KEY);
const unsubscribeStore = createLocalUnsubscribeStore(localStorage, UNSUB_STATE_KEY);
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
  lastOpenedWasUnread: false,
  selectedThreadIds: new Set(),
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
  imageProxy: {
    // keyed by message id: 'idle' | 'loading' | 'loaded' | 'error'
    statusByMessageId: {},
    // keyed by message id: Map<originalSrc, dataUri>
    dataByMessageId: {},
    errorByMessageId: {},
  unsub: {
    pendingThreadId: null,  // thread id waiting for modal confirmation
  },
};

// CSS custom properties are now owned by styles.css (dual-theme token system).
// brandTokens.color.accent is no longer injected inline so that the
// prefers-color-scheme media query can control --accent per theme.

// Auto-trust all senders that already existed before the trust store was
// introduced — but only on the very first run (flag ensures one-time only).
const _TRUST_INIT_FLAG = 'kept.senderTrust.initialized.v1';
if (!localStorage.getItem(_TRUST_INIT_FLAG)) {
  const _existingSenderEmails = state.threads
    .map((t) => t.senderEmail || t.sender)
    .filter(Boolean);
  senderTrustStore.initFromExistingSenders(_existingSenderEmails);
  localStorage.setItem(_TRUST_INIT_FLAG, '1');
}

renderApp();
initializeGmailState();

window.addEventListener('keydown', (event) => {
  if (state.activeThreadId && event.key === 'Escape') {
    event.preventDefault();
    closeThreadReader();
    return;
  }
  if (!state.activeThreadId && event.key === 'Escape' && state.selectedThreadIds.size > 0) {
    event.preventDefault();
    state.selectedThreadIds = clearSelection();
    renderApp();
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
  // Auto-trust gmail senders that existed before the trust store was introduced
  // — same one-time-only guard as the local threads init above.
  if (!localStorage.getItem(_TRUST_INIT_FLAG)) {
    const gmailSenderEmails = state.gmail.threads.map((t) => t.senderEmail || t.sender).filter(Boolean);
    senderTrustStore.initFromExistingSenders(gmailSenderEmails);
    localStorage.setItem(_TRUST_INIT_FLAG, '1');
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
  const allThreads = filterBannedSenderThreads(
    applyLocalReadState(combineInboxThreads(state.gmail.threads, state.threads), readStateStore.load()).map(applyTriageStatus),
    senderTrustStore,
  );
  const activeThread = state.activeThreadId ? allThreads.find((thread) => thread.id === state.activeThreadId) : null;
  if (state.activeThreadId && !activeThread) state.activeThreadId = null;
  if (activeThread) {
    const senderEmail = String(activeThread.senderEmail || activeThread.sender || '').toLowerCase().trim();
    const isSenderNew = senderTrustStore.isNew(senderEmail);
    root.replaceChildren(renderThreadReader(normalizeReaderThread(activeThread), activeThread, { wasUnread: state.lastOpenedWasUnread, isSenderNew, senderEmail }));
    wireThreadReaderControls();
    return;
  }

  const visibleThreads = filterInboxThreads(filterArchivedInboxThreads(allThreads), state.searchQuery);
  const inboxNow = newestThreadDate(visibleThreads) || newestThreadDate(allThreads) || new Date();

  // Split into primary / newsletters / updates before date-grouping
  const primaryThreads = [];
  const newsletterThreads = [];
  const updateThreads = [];
  visibleThreads.forEach((thread) => {
    const category = classifyThread(thread);
    if (category === 'newsletter') newsletterThreads.push(thread);
    else if (category === 'update') updateThreads.push(thread);
    else primaryThreads.push(thread);
  });

  const sections = getInboxSections(primaryThreads, { now: inboxNow });
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

  root.replaceChildren(renderInboxShell({ sections, inboxCount, visibleCount, unreadCount, newSenders, searchState, newsletterThreads, updateThreads, allVisibleThreads: visibleThreads }));
  wireGmailControls();
  wireImportControls();
  wireSearchControl();
  wireThreadRows();
  wireInboxSectionToggles();
}

function renderInboxShell({ sections, inboxCount, visibleCount, unreadCount, newSenders, searchState, newsletterThreads = [], updateThreads = [], allVisibleThreads = [] }) {
  const shell = el('main', { className: 'shell', ariaLabel: 'Kept inbox' });
  const hasSelection = state.selectedThreadIds.size > 0;
  const surface = el('section', { className: `inbox-surface${hasSelection ? ' selection-active' : ''}` });
  surface.append(renderTopBar({ inboxCount, visibleCount, unreadCount, searchState }), renderGmailStatus());
  if (inboxCount === 0) {
    surface.append(renderEmptyGmailState());
  } else if (visibleCount === 0) {
    surface.append(renderSearchEmptyState());
  } else {
    surface.append(renderNewSenders(newSenders), renderInboxSections(sections));
    if (newsletterThreads.length > 0) {
      surface.append(renderCollapsibleCategory('newsletters', 'Newsletters', newsletterThreads));
    }
    if (updateThreads.length > 0) {
      surface.append(renderCollapsibleCategory('updates', 'Updates', updateThreads));
    }
  }
  shell.append(surface);
  if (hasSelection) {
    const dominantRead = getBulkDominantReadState(allVisibleThreads, state.selectedThreadIds);
    shell.append(renderBulkActionBar(state.selectedThreadIds.size, dominantRead));
  }
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

  const rail = el('div', { className: 'sender-rail', role: 'list' });
  if (newSenders.length === 0) {
    rail.append(el('p', { className: 'empty-row', text: 'No new senders detected in local mail.' }));
  } else {
    newSenders.forEach((sender) => rail.append(renderSenderCard(sender)));
  }

  section.append(rail);
  return section;
}

function renderSenderCard(sender) {
  const card = el('article', { className: 'sender-card', role: 'listitem' });

  const top = el('div', { className: 'sender-card-top' });
  const identity = el('div', { className: 'sender-card-identity' });
  identity.append(
    el('strong', { text: sender.sender }),
    el('span', { className: 'sender-email', text: sender.senderEmail || 'local mail' }),
  );
  top.append(renderAvatar(sender), identity);

  const bottom = el('div', { className: 'sender-card-bottom' });
  bottom.append(
    el('p', { className: 'sender-card-subject', text: sender.subject }),
  );

  const actions = el('div', { className: 'sender-actions' });
  const keepBtn = el('button', { type: 'button', className: 'accept', ariaLabel: `Keep ${sender.sender}` });
  keepBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 8 6 12 14 4"/></svg>`;
  const muteBtn = el('button', { type: 'button', className: 'block', ariaLabel: `Mute ${sender.sender}` });
  muteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>`;
  actions.append(keepBtn, muteBtn);
  bottom.append(actions);

  card.append(top, bottom);
  return card;
}

function renderInboxSections(sections) {
  const list = el('section', { className: 'inbox-list', ariaLabel: 'Messages grouped by date' });
  sections.forEach((section) => list.append(renderThreadSection(section)));
  return list;
}

function renderThreadSection(section) {
  const group = el('section', { className: 'thread-section', ariaLabel: section.title });
  const sectionThreadIds = section.threads.map((t) => t.id);
  group.append(renderSectionHeader(section.title, formatPlural(section.threads.length, 'message'), sectionThreadIds));

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
  const isSelected = state.selectedThreadIds.has(thread.id);
  const row = el('article', {
    className: `thread-row${triage.read ? '' : ' unread'}${triage.starred ? ' starred' : ''}${sectionId === 'priority' ? ' priority' : ''}${isSelected ? ' selected' : ''}`,
    ariaLabel: `${thread.sender}, ${thread.subject}, ${formatTime(thread.receivedAt)}`,
  });
  row.id = rowIdForThread(thread.id);
  row.dataset.threadId = thread.id;

  // Row checkbox (circular, hidden by default; visible on hover / when any selection active)
  const checkbox = el('button', {
    type: 'button',
    className: `thread-checkbox${isSelected ? ' checked' : ''}`,
    ariaLabel: isSelected ? 'Deselect thread' : 'Select thread',
  });
  checkbox.dataset.selectThread = thread.id;
  if (isSelected) checkbox.setAttribute('aria-pressed', 'true');

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
    ...(status ? [renderTriageStatus(status, { inline: true })] : []),
    el('time', { className: 'time', text: formatTime(thread.receivedAt), dateTime: thread.receivedAt }),
  );

  row.append(checkbox, open, renderThreadTriageControls(thread));
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
  const iconKey = intent === 'read-toggle'
    ? (label === 'Unread' ? 'read-toggle-read' : 'read-toggle-unread')
    : intent === 'star-toggle'
    ? (pressed ? 'star-toggle-on' : 'star-toggle-off')
    : intent;
  const button = el('button', { type: 'button', className: `triage-action ${intent}`, ariaLabel });
  button.innerHTML = TRIAGE_ICONS[iconKey] || label;
  button.setAttribute('data-triage-intent', intent);
  if (pressed) button.setAttribute('aria-pressed', 'true');
  return button;
}

function renderBulkActionBar(count, dominantRead) {
  const bar = el('div', { className: 'bulk-action-bar', role: 'toolbar', ariaLabel: 'Bulk actions' });

  const left = el('div', { className: 'bulk-action-left' });
  const clearBtn = el('button', { type: 'button', className: 'bulk-clear', ariaLabel: 'Clear selection', text: '✕' });
  clearBtn.dataset.bulkAction = 'clear';
  left.append(clearBtn, el('span', { className: 'bulk-count', text: `${count} selected` }));

  const right = el('div', { className: 'bulk-action-right' });
  const archiveBtn = el('button', { type: 'button', className: 'bulk-btn', text: 'Archive', ariaLabel: 'Archive selected threads' });
  archiveBtn.dataset.bulkAction = 'archive';
  const readLabel = dominantRead === 'unread' ? 'Mark read' : 'Mark unread';
  const readBtn = el('button', { type: 'button', className: 'bulk-btn', text: readLabel, ariaLabel: `${readLabel} for selected threads` });
  readBtn.dataset.bulkAction = dominantRead === 'unread' ? 'mark-read' : 'mark-unread';
  const muteBtn = el('button', { type: 'button', className: 'bulk-btn', text: 'Mute senders', ariaLabel: 'Mute senders of selected threads' });
  muteBtn.dataset.bulkAction = 'mute-senders';
  right.append(archiveBtn, readBtn, muteBtn);

  bar.append(left, right);
  return bar;
}

function applyBulkArchive(selectedIds) {
  const ids = [...selectedIds];
  ids.forEach((id) => {
    updateThreadFlags(id, { archived: true });
    state.triage.statusByThreadId[id] = 'saved-locally';
  });
  state.selectedThreadIds = clearSelection();
}

function applyBulkReadState(selectedIds, readState) {
  const ids = [...selectedIds];
  const desiredFlags = { read: readState === 'read' };
  ids.forEach((id) => {
    updateThreadFlags(id, desiredFlags);
    state.triage.statusByThreadId[id] = 'saved-locally';
  });
  state.selectedThreadIds = clearSelection();
}

function applyBulkMuteSenders(selectedIds, allThreads) {
  const ids = [...selectedIds];
  ids.forEach((id) => {
    const thread = allThreads.find((t) => t.id === id);
    if (!thread) return;
    const senderEmail = String(thread.senderEmail || thread.sender || '').toLowerCase().trim();
    if (senderEmail) senderTrustStore.ban(senderEmail);
  });
  state.selectedThreadIds = clearSelection();
}

function renderThreadReader(reader, sourceThread = null, { wasUnread = false, isSenderNew = false, senderEmail = '' } = {}) {
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
  if (wasUnread) {
    const chip = el('div', { className: 'reader-marked-read-chip', role: 'status', ariaLive: 'polite', text: 'Marked read' });
    surface.append(chip);
  }
  if (isSenderNew && senderEmail) {
    surface.append(renderSenderTrustCard(reader, senderEmail));
  }
  // Unsubscribe button: shown when any message has unsubscribe data and thread isn't already unsubscribed
  const hasUnsubscribe = reader.messages.some((msg) => msg.unsubscribeUrl || msg.unsubscribeMailto);
  if (hasUnsubscribe) {
    const alreadyUnsubscribed = unsubscribeStore.isUnsubscribed(reader.id);
    if (alreadyUnsubscribed) {
      header.append(el('span', { className: 'unsub-done', text: 'Unsubscribed ✓' }));
    } else {
      const unsubBtn = el('button', { type: 'button', className: 'secondary-mail-action reader-unsub-button', text: 'Unsubscribe', id: 'reader-unsub' });
      unsubBtn.dataset.threadId = reader.id;
      header.append(unsubBtn);
    }
  }
  surface.append(header, renderReaderTriageBar(sourceThread || reader), renderReaderMeta(reader), renderReaderSummaryPanel(reader));
  reader.messages.forEach((message) => surface.append(renderReaderMessage(message)));
  // Confirmation modal if pending
  if (state.unsub.pendingThreadId === reader.id) {
    surface.append(renderUnsubConfirmModal(reader));
  }
  shell.append(surface);
  return shell;
}

function renderSenderTrustCard(reader, senderEmail) {
  const card = el('div', { className: 'sender-trust-card', role: 'region', ariaLabel: 'New sender' });
  const info = el('div', { className: 'sender-trust-info' });
  const identity = el('div', { className: 'sender-trust-identity' });
  identity.append(
    el('strong', { text: reader.sender.name || reader.sender.label || senderEmail }),
    el('span', { className: 'sender-trust-email', text: senderEmail }),
  );
  info.append(renderAvatar(reader.sender), identity);
  const subtext = el('p', { className: 'sender-trust-subtext', text: 'First message from this sender' });
  const actions = el('div', { className: 'sender-trust-actions' });
  const acceptBtn = el('button', { type: 'button', className: 'sender-trust-accept', text: 'Accept', ariaLabel: `Accept ${senderEmail}` });
  const banBtn = el('button', { type: 'button', className: 'sender-trust-ban', text: 'Ban', ariaLabel: `Ban ${senderEmail}` });
  acceptBtn.setAttribute('data-trust-action', 'accept');
  acceptBtn.setAttribute('data-trust-email', senderEmail);
  banBtn.setAttribute('data-trust-action', 'ban');
  banBtn.setAttribute('data-trust-email', senderEmail);
  actions.append(acceptBtn, banBtn);
  card.append(info, subtext, actions);
  return card;
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

function renderUnsubConfirmModal(reader) {
  const senderName = reader.sender?.label || reader.sender?.name || reader.sender?.email || 'this sender';
  const modal = el('section', { className: 'unsub-modal', ariaLabel: 'Confirm unsubscribe', role: 'dialog' });
  const card = el('div', { className: 'unsub-modal-body' });
  card.append(el('p', { className: 'unsub-modal-text', text: `Unsubscribe from ${senderName}? This sends a one-click unsubscribe request.` }));
  const actions = el('div', { className: 'unsub-modal-actions' });
  actions.append(
    el('button', { type: 'button', className: 'primary-mail-action', text: 'Unsubscribe', id: 'unsub-confirm' }),
    el('button', { type: 'button', className: 'secondary-mail-action', text: 'Cancel', id: 'unsub-cancel' }),
  );
  card.append(actions);
  modal.append(card);
  return modal;
}

function renderReaderMessage(message) {
  const article = el('section', { className: 'reader-message', ariaLabel: `Message from ${message.sender.label}` });
  article.append(renderMessageHeader(message));
  if (message.remoteImagesBlocked) {
    const proxyStatus = state.imageProxy.statusByMessageId[message.id] || 'idle';
    if (proxyStatus === 'loaded') {
      article.append(el('p', { className: 'reader-remote-images-loaded', text: '🛡 Images loaded via proxy — sender cannot track you.' }));
    } else if (proxyStatus === 'loading') {
      article.append(el('p', { className: 'reader-remote-images-blocked', text: '🔒 Loading images via proxy…' }));
    } else if (proxyStatus === 'error') {
      const errorMsg = state.imageProxy.errorByMessageId[message.id] || 'Could not load images.';
      article.append(el('p', { className: 'reader-remote-images-blocked', text: `🔒 ${errorMsg}` }));
      if (isImageProxyAvailable()) {
        const retryBtn = el('button', { type: 'button', className: 'secondary-mail-action reader-load-images', text: 'Retry loading images (via proxy)' });
        retryBtn.setAttribute('data-load-images-message-id', message.id);
        retryBtn.setAttribute('data-load-images-raw-body', message.rawBody || '');
        article.append(retryBtn);
      }
    } else {
      // idle — show blocked badge + load button if proxy is available
      article.append(el('p', { className: 'reader-remote-images-blocked', text: '🔒 Remote images blocked — message text only.' }));
      if (isImageProxyAvailable()) {
        const loadBtn = el('button', { type: 'button', className: 'secondary-mail-action reader-load-images', text: 'Load images (via proxy)' });
        loadBtn.setAttribute('data-load-images-message-id', message.id);
        loadBtn.setAttribute('data-load-images-raw-body', message.rawBody || '');
        article.append(loadBtn);
      }
    }
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
  // Selection: row checkboxes
  document.querySelectorAll('[data-select-thread]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const threadId = btn.dataset.selectThread;
      if (threadId) {
        state.selectedThreadIds = toggleThreadSelection(state.selectedThreadIds, threadId);
        renderApp();
      }
    });
  });

  // Selection: section checkboxes
  document.querySelectorAll('[data-select-section]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const sectionThreadIds = JSON.parse(btn.dataset.selectSection);
        state.selectedThreadIds = selectSection(state.selectedThreadIds, sectionThreadIds);
        renderApp();
      } catch (_err) { /* ignore */ }
    });
  });

  // Bulk action bar
  document.querySelectorAll('[data-bulk-action]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = btn.dataset.bulkAction;
      const allThreads = currentThreads();
      if (action === 'clear') {
        state.selectedThreadIds = clearSelection();
        renderApp();
      } else if (action === 'archive') {
        applyBulkArchive(state.selectedThreadIds);
        renderApp();
      } else if (action === 'mark-read') {
        applyBulkReadState(state.selectedThreadIds, 'read');
        renderApp();
      } else if (action === 'mark-unread') {
        applyBulkReadState(state.selectedThreadIds, 'unread');
        renderApp();
      } else if (action === 'mute-senders') {
        applyBulkMuteSenders(state.selectedThreadIds, allThreads);
        renderApp();
      }
    });
  });

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
  document.querySelectorAll('[data-load-images-message-id]').forEach((button) => {
    button.addEventListener('click', () => loadImagesViaProxy(button.getAttribute('data-load-images-message-id'), button.getAttribute('data-load-images-raw-body') || ''));
  });
  // Unsubscribe flow
  document.querySelector('#reader-unsub')?.addEventListener('click', () => {
    const threadId = state.activeThreadId;
    if (!threadId) return;
    state.unsub.pendingThreadId = threadId;
    renderApp();
  });
  document.querySelector('#unsub-cancel')?.addEventListener('click', () => {
    state.unsub.pendingThreadId = null;
    renderApp();
  });
  document.querySelector('#unsub-confirm')?.addEventListener('click', () => executeUnsubscribe());
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

async function loadImagesViaProxy(messageId, rawBody) {
  if (!messageId || !isImageProxyAvailable()) return;
  state.imageProxy.statusByMessageId[messageId] = 'loading';
  state.imageProxy.errorByMessageId[messageId] = '';
  renderApp();

  // Extract all remote image src values from the raw HTML body
  const srcRe = /<img[^>]+src\s*=\s*["'](https?:\/\/[^"'>\s]+)["']/gi;
  const srcs = [];
  let match;
  const body = rawBody || '';
  // eslint-disable-next-line no-cond-assign
  while ((match = srcRe.exec(body)) !== null) {
    if (!srcs.includes(match[1])) srcs.push(match[1]);
  }

  if (srcs.length === 0) {
    // No src values in raw body (body was already stripped) — mark loaded with no images
    state.imageProxy.statusByMessageId[messageId] = 'loaded';
    state.imageProxy.dataByMessageId[messageId] = {};
    renderApp();
    return;
  }

  try {
    const results = await Promise.allSettled(srcs.map((src) => proxyImage(src).then((dataUri) => ({ src, dataUri }))));
    const data = {};
    const errors = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.dataUri) {
        data[result.value.src] = result.value.dataUri;
      } else {
        errors.push(result.reason?.message || 'Could not load one or more images.');
      }
    });
    state.imageProxy.dataByMessageId[messageId] = data;
    if (errors.length > 0 && Object.keys(data).length === 0) {
      state.imageProxy.statusByMessageId[messageId] = 'error';
      state.imageProxy.errorByMessageId[messageId] = errors[0];
    } else {
      state.imageProxy.statusByMessageId[messageId] = 'loaded';
      state.imageProxy.errorByMessageId[messageId] = '';
    }
  } catch (error) {
    state.imageProxy.statusByMessageId[messageId] = 'error';
    state.imageProxy.errorByMessageId[messageId] = userFacingError(error, 'Could not load images via proxy.');
  }
async function executeUnsubscribe() {
  const threadId = state.unsub.pendingThreadId;
  if (!threadId) return;
  state.unsub.pendingThreadId = null;

  // Find the first message with unsubscribe data
  const allThreads = currentThreads();
  const thread = allThreads.find((candidate) => candidate.id === threadId);
  if (!thread) return;

  const reader = normalizeReaderThread(thread);
  const message = reader.messages.find((msg) => msg.unsubscribeUrl || msg.unsubscribeMailto);
  if (!message) return;

  // Preference: (1) RFC 8058 one-click POST if available, (2) mailto open, (3) https link open
  if (message.oneClickPost && message.unsubscribeUrl) {
    try {
      await fetch(message.unsubscribeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
        mode: 'no-cors',
      });
    } catch (_error) {
      // no-cors fetch may throw — treat as attempted
    }
  } else if (message.unsubscribeMailto) {
    window.open(message.unsubscribeMailto, '_blank');
  } else if (message.unsubscribeUrl) {
    window.open(message.unsubscribeUrl, '_blank');
  }

  unsubscribeStore.markUnsubscribed(threadId);
  renderApp();
}

function openThreadReader(threadId, rowId) {
  if (!threadId) return;
  // Capture unread status before marking read so we can show the "Marked read" chip
  const allThreads = applyLocalReadState(combineInboxThreads(state.gmail.threads, state.threads), readStateStore.load());
  const thread = allThreads.find((candidate) => candidate.id === threadId);
  state.lastOpenedWasUnread = Boolean(thread?.isUnread);
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

/**
 * Render a collapsible Newsletters or Updates section.
 * @param {'newsletters'|'updates'} key
 * @param {string} label
 * @param {Array} threads
 */
function renderCollapsibleCategory(key, label, threads) {
  const PREVIEW_COUNT = 2;
  const collapsed = inboxSectionsCollapsed[key];
  const container = el('section', { className: `collapsible-category${collapsed ? ' collapsed' : ''}`, ariaLabel: label });
  container.dataset.categoryKey = key;

  // Header
  const header = el('button', {
    type: 'button',
    className: 'collapsible-category-header',
    ariaExpanded: String(!collapsed),
  });
  header.setAttribute('data-section-toggle', key);
  header.append(
    el('span', { className: 'category-label', text: label }),
    el('span', { className: 'category-count', text: String(threads.length) }),
    el('span', { className: 'category-chevron', text: collapsed ? '▸' : '▾', ariaHidden: 'true' }),
  );
  container.append(header);

  // Rows
  const rows = el('div', { className: 'rows', role: 'list' });
  const visibleThreads = collapsed ? threads.slice(0, PREVIEW_COUNT) : threads;
  visibleThreads.forEach((thread) => rows.append(renderThreadRow(thread, key)));
  container.append(rows);

  // "… and N more" hint when collapsed and there are hidden rows
  const hiddenCount = threads.length - PREVIEW_COUNT;
  if (collapsed && hiddenCount > 0) {
    const more = el('p', { className: 'category-more', text: `… and ${hiddenCount} more` });
    more.setAttribute('data-section-toggle', key);
    container.append(more);
  }

  return container;
}

function wireInboxSectionToggles() {
  document.querySelectorAll('[data-section-toggle]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const key = trigger.getAttribute('data-section-toggle');
      if (key !== 'newsletters' && key !== 'updates') return;
      inboxSectionsCollapsed[key] = !inboxSectionsCollapsed[key];
      saveInboxSectionsState(inboxSectionsCollapsed, localStorage);
      renderApp();
    });
  });
}

function renderSectionHeader(title, meta, sectionThreadIds = null) {
  const header = el('div', { className: 'section-header' });
  if (sectionThreadIds && sectionThreadIds.length > 0) {
    const checkState = getSectionCheckboxState(sectionThreadIds, state.selectedThreadIds);
    const sectionCb = el('button', {
      type: 'button',
      className: `section-checkbox${checkState === 'all' ? ' checked' : checkState === 'indeterminate' ? ' indeterminate' : ''}`,
      ariaLabel: checkState === 'all' ? `Deselect all in ${title}` : `Select all in ${title}`,
    });
    sectionCb.dataset.selectSection = JSON.stringify(sectionThreadIds);
    if (checkState === 'all') sectionCb.setAttribute('aria-pressed', 'true');
    header.append(sectionCb);
  }
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
