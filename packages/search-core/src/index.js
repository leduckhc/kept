import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join, posix, win32 } from 'node:path';
import { homedir, platform } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  subject_ciphertext BLOB NOT NULL,
  subject_nonce BLOB NOT NULL,
  subject_tag BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, external_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  sender_ciphertext BLOB NOT NULL,
  sender_nonce BLOB NOT NULL,
  sender_tag BLOB NOT NULL,
  recipients_ciphertext BLOB NOT NULL,
  recipients_nonce BLOB NOT NULL,
  recipients_tag BLOB NOT NULL,
  subject_ciphertext BLOB NOT NULL,
  subject_nonce BLOB NOT NULL,
  subject_tag BLOB NOT NULL,
  body_ciphertext BLOB NOT NULL,
  body_nonce BLOB NOT NULL,
  body_tag BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, external_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  content_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  subject,
  body,
  sender,
  recipients,
  content='',
  tokenize='porter unicode61'
);
`;

export const sqliteSchema = SCHEMA;

export const encryptionDecision = {
  choice: 'App-layer AES-256-GCM encrypted blobs for this JS-only spike; prefer SQLCipher before production if Tauri packaging supports it',
  why: [
    'Node built-in sqlite lets the spike prove schema, inserts, FTS5, seed data, and no-network search without new dependencies.',
    'Canonical message fields are encrypted in accounts/threads/messages storage paths.',
    'FTS5 stores local derived searchable text, so SQLCipher remains the better production privacy story for FTS terms, WAL pages, and metadata.',
  ],
};

export function createInMemorySearchIndex() {
  const rows = [];
  return {
    addThread(thread) { rows.push(normalizeThread(thread)); },
    seed(threads) { threads.forEach((thread) => this.addThread(thread)); },
    search(query) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length === 0) return [];
      return rows
        .map((thread) => {
          const haystack = `${thread.subject} ${thread.sender} ${thread.body}`.toLowerCase();
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
          return { ...thread, score, snippet: thread.body.slice(0, 140) };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score);
    },
  };
}

export function normalizeThread(thread) {
  return {
    id: thread.id,
    accountId: thread.accountId || 'acct_demo_local',
    subject: thread.subject || '(no subject)',
    sender: thread.sender || 'unknown sender',
    recipients: Array.isArray(thread.recipients) ? thread.recipients : [],
    body: thread.body || '',
    receivedAt: thread.receivedAt || new Date(0).toISOString(),
  };
}

export function buildSearchRows(thread) {
  const normalized = normalizeThread(thread);
  return {
    thread: {
      id: normalized.id,
      account_id: normalized.accountId,
      subject_ciphertext: '[encrypted-subject-placeholder]',
      updated_at: normalized.receivedAt,
    },
    message: {
      id: `${normalized.id}:msg0`,
      thread_id: normalized.id,
      sender_ciphertext: '[encrypted-sender-placeholder]',
      recipients_ciphertext: '[encrypted-recipients-placeholder]',
      subject_ciphertext: '[encrypted-subject-placeholder]',
      body_ciphertext: '[encrypted-body-placeholder]',
      received_at: normalized.receivedAt,
    },
    fts: {
      subject: normalized.subject,
      sender: normalized.sender,
      recipients: normalized.recipients.join(' '),
      body: normalized.body,
    },
  };
}

export function createLocalEncryptionKey(secret = randomBytes(32)) {
  if (Buffer.isBuffer(secret)) {
    if (secret.length !== 32) throw new Error('Encryption key must be 32 bytes');
    return secret;
  }
  return createHash('sha256').update(String(secret)).digest();
}

export function getDefaultKeptDatabasePath(os = platform()) {
  if (os === 'darwin') return posix.join(homedir(), 'Library', 'Application Support', 'Kept', 'kept.sqlite');
  if (os === 'win32') return win32.join(homedir(), 'AppData', 'Roaming', 'Kept', 'kept.sqlite');
  return posix.join(homedir(), '.local', 'share', 'Kept', 'kept.sqlite');
}

export function createKeptSearchStore({ databasePath = ':memory:', encryptionKey } = {}) {
  if (!encryptionKey) throw new Error('createKeptSearchStore requires encryptionKey');
  const key = createLocalEncryptionKey(encryptionKey);
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);
  db.exec(SCHEMA);

  function encrypt(value) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return { ciphertext, nonce, tag: cipher.getAuthTag() };
  }

  function decrypt(ciphertext, nonce, tag) {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  function encryptColumns(prefix, value) {
    const encrypted = encrypt(value);
    return {
      [`${prefix}_ciphertext`]: encrypted.ciphertext,
      [`${prefix}_nonce`]: encrypted.nonce,
      [`${prefix}_tag`]: encrypted.tag,
    };
  }

  function insertAccount({ email, displayName = '' }) {
    const result = db.prepare(`
      INSERT INTO accounts (email, display_name)
      VALUES (?, ?)
      ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name
      RETURNING id
    `).get(email, displayName);
    return result.id;
  }

  function insertThread({ accountId, externalId, subject }) {
    const encryptedSubject = encryptColumns('subject', subject);
    const result = db.prepare(`
      INSERT INTO threads (
        account_id, external_id, subject_ciphertext, subject_nonce, subject_tag
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(account_id, external_id) DO UPDATE SET
        subject_ciphertext = excluded.subject_ciphertext,
        subject_nonce = excluded.subject_nonce,
        subject_tag = excluded.subject_tag
      RETURNING id
    `).get(
      accountId,
      externalId,
      encryptedSubject.subject_ciphertext,
      encryptedSubject.subject_nonce,
      encryptedSubject.subject_tag,
    );
    return result.id;
  }

  function insertMessage({ accountId, threadId, externalId, sentAt, sender, recipients = [], subject, body }) {
    const encryptedSender = encryptColumns('sender', sender);
    const encryptedRecipients = encryptColumns('recipients', JSON.stringify(recipients));
    const encryptedSubject = encryptColumns('subject', subject);
    const encryptedBody = encryptColumns('body', body);
    const result = db.prepare(`
      INSERT INTO messages (
        account_id, thread_id, external_id, sent_at,
        sender_ciphertext, sender_nonce, sender_tag,
        recipients_ciphertext, recipients_nonce, recipients_tag,
        subject_ciphertext, subject_nonce, subject_tag,
        body_ciphertext, body_nonce, body_tag
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, external_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        sent_at = excluded.sent_at,
        sender_ciphertext = excluded.sender_ciphertext,
        sender_nonce = excluded.sender_nonce,
        sender_tag = excluded.sender_tag,
        recipients_ciphertext = excluded.recipients_ciphertext,
        recipients_nonce = excluded.recipients_nonce,
        recipients_tag = excluded.recipients_tag,
        subject_ciphertext = excluded.subject_ciphertext,
        subject_nonce = excluded.subject_nonce,
        subject_tag = excluded.subject_tag,
        body_ciphertext = excluded.body_ciphertext,
        body_nonce = excluded.body_nonce,
        body_tag = excluded.body_tag
      RETURNING id
    `).get(
      accountId,
      threadId,
      externalId,
      sentAt,
      encryptedSender.sender_ciphertext,
      encryptedSender.sender_nonce,
      encryptedSender.sender_tag,
      encryptedRecipients.recipients_ciphertext,
      encryptedRecipients.recipients_nonce,
      encryptedRecipients.recipients_tag,
      encryptedSubject.subject_ciphertext,
      encryptedSubject.subject_nonce,
      encryptedSubject.subject_tag,
      encryptedBody.body_ciphertext,
      encryptedBody.body_nonce,
      encryptedBody.body_tag,
    );

    const messageId = result.id;
    db.prepare('DELETE FROM messages_fts WHERE rowid = ?').run(messageId);
    db.prepare(`
      INSERT INTO messages_fts (rowid, subject, body, sender, recipients)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, subject, body, sender, recipients.join(' '));
    return messageId;
  }

  function insertAttachment({ messageId, filename, mimeType, byteSize, contentId = null }) {
    const result = db.prepare(`
      INSERT INTO attachments (message_id, filename, mime_type, byte_size, content_id)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `).get(messageId, filename, mimeType, byteSize, contentId);
    return result.id;
  }

  function searchMessages(query, { limit = 20 } = {}) {
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];
    const rows = db.prepare(`
      SELECT
        m.id AS message_id,
        m.thread_id,
        m.sent_at,
        a.email AS account_email,
        m.sender_ciphertext,
        m.sender_nonce,
        m.sender_tag,
        m.recipients_ciphertext,
        m.recipients_nonce,
        m.recipients_tag,
        m.subject_ciphertext,
        m.subject_nonce,
        m.subject_tag,
        m.body_ciphertext,
        m.body_nonce,
        m.body_tag,
        snippet(messages_fts, 1, '[', ']', '…', 12) AS snippet,
        bm25(messages_fts) AS rank
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.rowid
      JOIN accounts a ON a.id = m.account_id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit);

    return rows.map((row) => {
      const body = decrypt(row.body_ciphertext, row.body_nonce, row.body_tag);
      const attachments = db.prepare(`
        SELECT id, filename, mime_type AS mimeType, byte_size AS byteSize, content_id AS contentId
        FROM attachments
        WHERE message_id = ?
        ORDER BY id
      `).all(row.message_id);
      return {
        messageId: row.message_id,
        threadId: row.thread_id,
        accountEmail: row.account_email,
        sentAt: row.sent_at,
        sender: decrypt(row.sender_ciphertext, row.sender_nonce, row.sender_tag),
        recipients: JSON.parse(decrypt(row.recipients_ciphertext, row.recipients_nonce, row.recipients_tag)),
        subject: decrypt(row.subject_ciphertext, row.subject_nonce, row.subject_tag),
        body,
        snippet: row.snippet || body.slice(0, 160),
        rank: row.rank,
        attachments,
      };
    });
  }

  return {
    databasePath,
    insertAccount,
    insertThread,
    insertMessage,
    insertAttachment,
    searchMessages,
    close() { db.close(); },
  };
}

export function seedSampleEmails(store) {
  const accountId = store.insertAccount({ email: 'pip@example.test', displayName: 'Pip Keeper' });
  const travelThreadId = store.insertThread({
    accountId,
    externalId: 'sample-thread-travel',
    subject: 'Boarding pass for Portland',
  });
  store.insertMessage({
    accountId,
    threadId: travelThreadId,
    externalId: 'sample-message-travel',
    sentAt: '2026-05-26T08:30:00.000Z',
    sender: 'tickets@example.test',
    recipients: ['pip@example.test'],
    subject: 'Boarding pass for Portland',
    body: 'Your boarding pass is ready. Save it locally before your morning flight.',
  });

  const invoiceThreadId = store.insertThread({
    accountId,
    externalId: 'sample-thread-invoice',
    subject: 'Studio invoice paid',
  });
  const invoiceMessageId = store.insertMessage({
    accountId,
    threadId: invoiceThreadId,
    externalId: 'sample-message-invoice',
    sentAt: '2026-05-25T15:00:00.000Z',
    sender: 'billing@example.test',
    recipients: ['pip@example.test', 'bookkeeping@example.test'],
    subject: 'Studio invoice paid',
    body: 'The studio invoice has been paid. Keep this receipt for tax prep.',
  });
  store.insertAttachment({
    messageId: invoiceMessageId,
    filename: 'studio-invoice.pdf',
    mimeType: 'application/pdf',
    byteSize: 128_500,
  });

  return { accountId, travelThreadId, invoiceThreadId, invoiceMessageId };
}

function toFtsQuery(query) {
  return String(query)
    .toLowerCase()
    .match(/[\p{L}\p{N}_@.-]+/gu)
    ?.map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' AND ') || '';
}
