const READ_STATE_VERSION = 1;
const UNSAFE_GMAIL_ID = /(?:token|secret|ya29|access_token|refresh_token|code_verifier)/i;

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

function normalizeReaderMessages(thread) {
  const rawMessages = Array.isArray(thread.messages) && thread.messages.length > 0 ? thread.messages : [thread];
  return rawMessages
    .map((message, index) => {
      const receivedAt = message.receivedAt || thread.receivedAt || new Date(0).toISOString();
      return {
        id: String(message.id || `${thread.id || 'thread'}-${index}`),
        threadId: String(message.threadId || thread.id || ''),
        subject: message.subject || thread.subject || '(no subject)',
        sender: normalizeContact(message.sender || thread.sender || thread.senderEmail || 'Unknown sender', message.senderEmail || thread.senderEmail),
        recipients: normalizeRecipients(message.recipients || thread.recipients || []),
        body: normalizeBody(message.body ?? message.textBody ?? message.htmlBody ?? thread.body ?? thread.textBody ?? thread.htmlBody),
        receivedAt,
        dateTime: receivedAt,
        dateLabel: formatReaderDate(receivedAt),
        attachments: normalizeAttachments(message.attachments || thread.attachments || []),
      };
    })
    .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
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
