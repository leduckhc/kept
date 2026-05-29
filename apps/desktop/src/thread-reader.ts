// @ts-nocheck
const READ_STATE_VERSION = 1;
const UNSAFE_GMAIL_ID = /(?:token|secret|ya29|access_token|refresh_token|code_verifier)/i;

export function parseListUnsubscribeHeaders(listUnsubscribe = '', listUnsubscribePost = '') {
  const ANGLE_BRACKET_RE = /<([^>]+)>/g;
  let unsubscribeUrl = null;
  let unsubscribeMailto = null;
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = ANGLE_BRACKET_RE.exec(listUnsubscribe)) !== null) {
    const value = match[1].trim();
    if (!unsubscribeUrl && /^https?:\/\//i.test(value)) unsubscribeUrl = value;
    if (!unsubscribeMailto && /^mailto:/i.test(value)) unsubscribeMailto = value;
  }
  const oneClickPost = Boolean(listUnsubscribePost && listUnsubscribePost.trim().length > 0);
  return { unsubscribeUrl, unsubscribeMailto, oneClickPost };
}

export function normalizeReaderThread(thread = {}) {
  const messages = normalizeReaderMessages(thread);
  const firstMessage = messages[0] || null;
  const sender = normalizeContact(thread.sender || firstMessage?.sender || thread.senderEmail || 'Unknown sender', thread.senderEmail);
  const recipients = normalizeRecipients(thread.recipients || firstMessage?.recipients || []);
  const receivedAt = thread.receivedAt || firstMessage?.receivedAt || new Date(0).toISOString();
  const subject = thread.subject || firstMessage?.subject || '(no subject)';
  return {
    id: String(thread.id || firstMessage?.threadId || firstMessage?.id || 'unknown-thread'),
    subject,
    sender,
    recipients,
    receivedAt,
    dateLabel: formatReaderDate(receivedAt),
    messages,
    gmailUrl: safeGmailThreadUrl(thread),
  };
}

export function applyLocalReadState(threads, readState = {}) {
  return threads.map((thread) => {
    if (!Object.prototype.hasOwnProperty.call(readState, thread.id)) return { ...thread };
    return { ...thread, isUnread: readState[thread.id] === false };
  });
}

export function createLocalReadStateStore(storage, key = 'kept.localThreadReadState.v1') {
  return {
    load() {
      try {
        const parsed = JSON.parse(storage.getItem(key) || '{}');
        return parsed?.version === READ_STATE_VERSION && parsed.threads && typeof parsed.threads === 'object' ? parsed.threads : {};
      } catch (_error) {
        return {};
      }
    },
    save(readState) {
      storage.setItem(key, JSON.stringify({ version: READ_STATE_VERSION, threads: readState }));
    },
  };
}

export function createMemoryReadStateStore(initialState = {}) {
  let state = { ...initialState };
  return {
    load() { return { ...state }; },
    save(nextState) { state = { ...nextState }; },
  };
}

export function createThreadReaderController({ threads, readStateStore, focusRow = () => {} }) {
  let activeThreadId = null;
  let lastFocusedRowId = null;

  function currentThreads() {
    return applyLocalReadState(threads, readStateStore.load());
  }

  function openThread(threadId, rowId = null) {
    const thread = currentThreads().find((candidate) => candidate.id === threadId);
    if (!thread) return null;
    activeThreadId = thread.id;
    lastFocusedRowId = rowId;
    markThreadRead(readStateStore, thread.id, true);
    return { mode: 'reader', reader: normalizeReaderThread({ ...thread, isUnread: false }) };
  }

  return {
    openThread,
    openFromRowClick({ threadId, rowId }) {
      return openThread(threadId, rowId);
    },
    openFromRowKey(event, { threadId, rowId }) {
      if (!isThreadOpenKey(event)) return null;
      event.preventDefault?.();
      return openThread(threadId, rowId);
    },
    closeReader() {
      activeThreadId = null;
      if (lastFocusedRowId) focusRow(lastFocusedRowId);
      return { mode: 'inbox' };
    },
    currentView() {
      if (!activeThreadId) return { mode: 'inbox', threads: currentThreads() };
      const thread = currentThreads().find((candidate) => candidate.id === activeThreadId);
      return thread ? { mode: 'reader', reader: normalizeReaderThread(thread) } : { mode: 'inbox', threads: currentThreads() };
    },
  };
}

export function createThreadSummaryActionController({ threads, adapter } = {}) {
  if (!adapter || typeof adapter.summarizeThread !== 'function') throw new Error('summary adapter is required');
  let pending = null;
  let latestSummary = null;

  function getThread(threadId) {
    return threads.find((candidate) => candidate.id === threadId) || null;
  }

  return {
    async requestSummary(threadId) {
      const thread = getThread(threadId);
      if (!thread) return { status: 'thread_missing', approval: null };
      const reader = normalizeReaderThread(thread);
      const summaryThread = readerThreadForSummary(reader);
      const preview = await adapter.summarizeThread(summaryThread, { approved: false });
      if (preview.status !== 'approval_denied' || !preview.envelope) {
        return { status: preview.status || 'preview_unavailable', approval: null, error: preview.error || null };
      }
      pending = {
        thread: summaryThread,
        approval: {
          provider: preview.envelope.provider,
          model: preview.envelope.model,
          action: preview.envelope.action,
          selectedThreadId: summaryThread.id,
          payloadPreview: preview.envelope.payloadPreview,
          payloadHash: preview.envelope.payloadHash,
        },
      };
      return { status: 'approval_required', approval: pending.approval };
    },
    cancelSummary() {
      pending = null;
      return { status: 'cancelled' };
    },
    async approveSummary(approvedPayloadHash) {
      if (!pending) return { status: 'approval_missing', summary: latestSummary };
      if (approvedPayloadHash !== pending.approval.payloadHash) return { status: 'approval_mismatch', summary: latestSummary };
      const current = pending;
      pending = null;
      const result = await adapter.summarizeThread(current.thread, { approved: true, expectedPayloadHash: current.approval.payloadHash });
      if (result.status === 'ok') {
        latestSummary = result.response?.text || String(result.response || '');
        return { status: 'ok', summary: latestSummary, envelope: result.envelope };
      }
      return { status: result.status, error: result.error || null, summary: latestSummary, envelope: result.envelope || null };
    },
    currentSummary() {
      return latestSummary;
    },
    currentApproval() {
      return pending?.approval || null;
    },
  };
}

export function markThreadRead(readStateStore, threadId, read) {
  const readState = readStateStore.load();
  readState[threadId] = Boolean(read);
  readStateStore.save(readState);
  return readState;
}

export function isThreadOpenKey(event) {
  return event?.key === 'Enter' || event?.key === ' ' || event?.key === 'Spacebar';
}

export function safeGmailThreadUrl(thread = {}) {
  if (thread.source !== 'gmail' && thread.provider !== 'gmail') return null;
  const id = String(thread.providerThreadId || thread.gmailThreadId || thread.providerMessageId || '');
  if (!id || UNSAFE_GMAIL_ID.test(id) || /[\s/?#&=]/.test(id)) return null;
  return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(id)}`;
}

export function formatAttachmentMeta(attachment = {}) {
  return [attachment.filename || 'attachment', attachment.mimeType || 'application/octet-stream', formatBytes(attachment.byteSize || 0)].join(' · ');
}

export function formatReaderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function readerThreadForSummary(reader) {
  return {
    id: reader.id,
    subject: reader.subject,
    sender: reader.sender.label,
    receivedAt: reader.receivedAt,
    body: reader.messages.map((message) => `${message.sender.label} (${message.dateTime})\n${message.body}`).join('\n\n---\n\n'),
  };
}

function normalizeReaderMessages(thread) {
  const rawMessages = Array.isArray(thread.messages) && thread.messages.length > 0 ? thread.messages : [thread];
  return rawMessages
    .map((message, index) => {
      const receivedAt = message.receivedAt || thread.receivedAt || new Date(0).toISOString();
      const rawBody = message.body ?? message.textBody ?? message.htmlBody ?? thread.body ?? thread.textBody ?? thread.htmlBody;
      const listUnsub = message.listUnsubscribe || thread.listUnsubscribe || message['list-unsubscribe'] || thread['list-unsubscribe'] || '';
      const listUnsubPost = message.listUnsubscribePost || thread.listUnsubscribePost || message['list-unsubscribe-post'] || thread['list-unsubscribe-post'] || '';
      const unsubscribe = parseListUnsubscribeHeaders(listUnsub, listUnsubPost);
      return {
        id: String(message.id || `${thread.id || 'thread'}-${index}`),
        threadId: String(message.threadId || thread.id || ''),
        subject: message.subject || thread.subject || '(no subject)',
        sender: normalizeContact(message.sender || thread.sender || thread.senderEmail || 'Unknown sender', message.senderEmail || thread.senderEmail),
        recipients: normalizeRecipients(message.recipients || thread.recipients || []),
        body: normalizeBody(rawBody),
        htmlBody: looksLikeHtml(rawBody) ? String(rawBody) : null,
        rawBody: String(rawBody || ''),
        remoteImagesBlocked: hasRemoteImages(rawBody),
        unsubscribeUrl: unsubscribe.unsubscribeUrl,
        unsubscribeMailto: unsubscribe.unsubscribeMailto,
        oneClickPost: unsubscribe.oneClickPost,
        receivedAt,
        dateTime: receivedAt,
        dateLabel: formatReaderDate(receivedAt),
        attachments: normalizeAttachments(message.attachments || thread.attachments || []),
      };
    })
    .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
}

const REMOTE_IMAGE_RE = /<img[^>]+src\s*=\s*["']https?:\/\//i;
const LOOKS_LIKE_HTML_RE = /<[a-zA-Z]/;

export function createLocalUnsubscribeStore(storage, key = 'kept.localUnsubscribeState.v1') {
  return {
    load() {
      try {
        const parsed = JSON.parse(storage.getItem(key) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_error) {
        return {};
      }
    },
    save(state) {
      storage.setItem(key, JSON.stringify(state));
    },
    isUnsubscribed(threadId) {
      const state = this.load();
      return Boolean(state[threadId]);
    },
    markUnsubscribed(threadId) {
      const state = this.load();
      state[threadId] = true;
      this.save(state);
    },
  };
}

export function hasRemoteImages(rawBody) {
  return REMOTE_IMAGE_RE.test(String(rawBody || ''));
}

function looksLikeHtml(value) {
  return LOOKS_LIKE_HTML_RE.test(String(value || ''));
}

// Sanitize raw HTML for safe display (no DOM, no external libs — regex only).
// Removes script/style blocks and all event-handler / javascript: attributes.
// Allows structural and visual tags; allows <img src> after explicit user consent.
export function sanitizeHtmlForDisplay(rawHtml) {
  let html = String(rawHtml || '');
  // Strip script blocks
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Strip style blocks
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Strip on* event handler attributes (e.g. onclick, onerror, onload)
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Strip javascript: hrefs/srcs
  html = html.replace(/(href|src)\s*=\s*["']\s*javascript:[^"']*/gi, '$1=""');
  // Strip data: URI srcs (possible xss vector)
  html = html.replace(/src\s*=\s*["']\s*data:[^"']*/gi, 'src=""');
  return html;
}

function normalizeBody(value) {
  const text = stripHtml(String(value || '')).trim();
  return text || 'No local body saved for this message.';
}

function stripHtml(value) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function normalizeRecipients(recipients) {
  if (!Array.isArray(recipients)) return recipients ? [normalizeContact(recipients)] : [];
  return recipients.map((recipient) => normalizeContact(recipient));
}

function normalizeContact(contact, fallbackEmail = '') {
  if (contact && typeof contact === 'object') {
    const name = contact.name ? String(contact.name) : '';
    const email = contact.email ? String(contact.email) : fallbackEmail;
    return { name, email, label: formatContactLabel(name, email) };
  }
  const value = String(contact || fallbackEmail || 'Unknown');
  const match = value.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim(), label: formatContactLabel(match[1].trim(), match[2].trim()) };
  return value.includes('@') ? { name: '', email: value, label: value } : { name: value, email: fallbackEmail, label: formatContactLabel(value, fallbackEmail) };
}

function formatContactLabel(name, email) {
  if (name && email) return `${name} <${email}>`;
  return name || email || 'Unknown';
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment) => ({
    id: String(attachment.id || attachment.filename || 'attachment'),
    filename: attachment.filename || 'attachment',
    mimeType: attachment.mimeType || attachment.mime_type || 'application/octet-stream',
    byteSize: Number.isFinite(Number(attachment.byteSize ?? attachment.byte_size)) ? Number(attachment.byteSize ?? attachment.byte_size) : 0,
  }));
}

function formatBytes(byteSize) {
  const size = Number(byteSize) || 0;
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

// ---- Sender trust store ----

const TRUST_STORE_VERSION = 1;

/**
 * createSenderTrustStore — localStorage-backed trust/ban store.
 *
 * trusted and banned are Sets of normalised (lowercase-trimmed) email addresses.
 *
 * Initialise with initFromExistingSenders(emails) on first app load so that
 * all already-seen senders are auto-trusted (no flood of trust cards for existing mail).
 */
export function createSenderTrustStore(storage, key = 'kept.senderTrust.v1') {
  function _normalise(email) {
    return String(email || '').toLowerCase().trim();
  }

  function _load() {
    try {
      const raw = JSON.parse(storage.getItem(key) || 'null');
      if (!raw || raw.version !== TRUST_STORE_VERSION) return { trusted: new Set(), banned: new Set() };
      return {
        trusted: new Set(Array.isArray(raw.trusted) ? raw.trusted : []),
        banned: new Set(Array.isArray(raw.banned) ? raw.banned : []),
      };
    } catch (_err) {
      return { trusted: new Set(), banned: new Set() };
    }
  }

  function _save({ trusted, banned }) {
    storage.setItem(key, JSON.stringify({
      version: TRUST_STORE_VERSION,
      trusted: Array.from(trusted),
      banned: Array.from(banned),
    }));
  }

  return {
    /**
     * Silently trust all provided email addresses that are not already
     * in the store. Call once on first app load with existing sender emails.
     */
    initFromExistingSenders(emails = []) {
      const { trusted, banned } = _load();
      let changed = false;
      for (const email of emails) {
        const norm = _normalise(email);
        if (!norm) continue;
        if (!trusted.has(norm) && !banned.has(norm)) {
          trusted.add(norm);
          changed = true;
        }
      }
      if (changed) _save({ trusted, banned });
    },

    trust(email) {
      const norm = _normalise(email);
      if (!norm) return;
      const { trusted, banned } = _load();
      banned.delete(norm);
      trusted.add(norm);
      _save({ trusted, banned });
    },

    ban(email) {
      const norm = _normalise(email);
      if (!norm) return;
      const { trusted, banned } = _load();
      trusted.delete(norm);
      banned.add(norm);
      _save({ trusted, banned });
    },

    isTrusted(email) {
      const norm = _normalise(email);
      return norm ? _load().trusted.has(norm) : false;
    },

    isBanned(email) {
      const norm = _normalise(email);
      return norm ? _load().banned.has(norm) : false;
    },

    /** A sender is "new" if not trusted and not banned. */
    isNew(email) {
      const norm = _normalise(email);
      if (!norm) return false;
      const { trusted, banned } = _load();
      return !trusted.has(norm) && !banned.has(norm);
    },
  };
}

export function createMemorySenderTrustStore(initialState = { trusted: [], banned: [] }) {
  const fakeStorage = createMemoryStorageForTrust(initialState);
  return createSenderTrustStore(fakeStorage);
}

function createMemoryStorageForTrust(initialState) {
  const stored = {
    'kept.senderTrust.v1': JSON.stringify({
      version: 1,
      trusted: initialState.trusted || [],
      banned: initialState.banned || [],
    }),
  };
  return {
    getItem(k) { return stored[k] ?? null; },
    setItem(k, v) { stored[k] = v; },
  };
}

/**
 * Filter threads from banned senders out of any inbox view.
 */
export function filterBannedSenderThreads(threads = [], trustStore) {
  if (!trustStore) return threads;
  return threads.filter((thread) => {
    const email = String(thread.senderEmail || thread.sender || '').toLowerCase().trim();
    return !trustStore.isBanned(email);
  });
}

// ---------------------------------------------------------------------------
// Inline Reply Composer
// ---------------------------------------------------------------------------

/**
 /**
 * Render an inline reply composer panel (hidden by default).
 * Container receives class "reply-composer" and data-thread-id attribute.
 * The panel starts collapsed (hidden attr). Use openReplyComposer / closeReplyComposer to toggle.
 */
export function renderReplyComposer({ threadId, senderEmail = '', subject = '' } = {}) {
  const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const panel = document.createElement('section');
  panel.className = 'reply-composer';
  panel.setAttribute('aria-label', 'Reply composer');
  panel.setAttribute('data-thread-id', String(threadId || ''));
  panel.hidden = true;

  // To field (read-only)
  const toRow = document.createElement('div');
  toRow.className = 'reply-composer-field';
  const toLabel = document.createElement('label');
  toLabel.textContent = 'To';
  toLabel.className = 'reply-composer-label';
  const toInput = document.createElement('input');
  toInput.type = 'text';
  toInput.className = 'reply-composer-to';
  toInput.value = senderEmail;
  toInput.readOnly = true;
  toInput.setAttribute('aria-label', 'To');
  toRow.append(toLabel, toInput);

  // Subject field (read-only)
  const subjectRow = document.createElement('div');
  subjectRow.className = 'reply-composer-field';
  const subjectLabel = document.createElement('label');
  subjectLabel.textContent = 'Subject';
  subjectLabel.className = 'reply-composer-label';
  const subjectInput = document.createElement('input');
  subjectInput.type = 'text';
  subjectInput.className = 'reply-composer-subject';
  subjectInput.value = reSubject;
  subjectInput.readOnly = true;
  subjectInput.setAttribute('aria-label', 'Subject');
  subjectRow.append(subjectLabel, subjectInput);

  // Body textarea
  const bodyTextarea = document.createElement('textarea');
  bodyTextarea.className = 'reply-composer-body';
  bodyTextarea.setAttribute('aria-label', 'Reply body');
  bodyTextarea.placeholder = 'Write your reply…';
  bodyTextarea.rows = 6;

  // Actions
  const actions = document.createElement('div');
  actions.className = 'reply-composer-actions';

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'reply-composer-send';
  sendBtn.textContent = 'Send';
  sendBtn.setAttribute('data-reply-action', 'send');

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'reply-composer-cancel';
  cancelBtn.textContent = 'Discard';
  cancelBtn.setAttribute('data-reply-action', 'cancel');

  actions.append(sendBtn, cancelBtn);
  panel.append(toRow, subjectRow, bodyTextarea, actions);
  return panel;
}

/**
 * Open (expand) the reply composer inside containerEl.
 * Clears any previous body text so each open is fresh.
 */
export function openReplyComposer(containerEl) {
  if (!containerEl) return;
  const composer = containerEl.querySelector('.reply-composer');
  if (!composer) return;
  const textarea = composer.querySelector('.reply-composer-body');
  if (textarea) textarea.value = '';
  composer.hidden = false;
  textarea?.focus();
}

/**
 * Close (collapse) the reply composer inside containerEl.
 */
export function closeReplyComposer(containerEl) {
  if (!containerEl) return;
  const composer = containerEl.querySelector('.reply-composer');
  if (!composer) return;
  composer.hidden = true;
}