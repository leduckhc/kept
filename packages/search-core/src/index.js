export const sqliteSchema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  subject TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  sender TEXT NOT NULL,
  recipients_json TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_ciphertext TEXT NOT NULL,
  body_preview TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachment_metadata (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(subject, sender, recipients, body_preview, content='');
`;

export const encryptionDecision = {
  choice: 'SQLCipher preferred for v1 desktop; app-layer encrypted body blobs as fallback',
  why: [
    'SQLCipher gives whole-database at-rest protection and keeps FTS/migrations simpler.',
    'Fallback blob encryption limits build friction if SQLCipher packaging blocks Tauri releases.',
    'Never log plaintext bodies, provider tokens, API keys, or private prompts.',
  ],
};

export function createInMemorySearchIndex() {
  const rows = [];
  return {
    addThread(thread) { rows.push(normalizeThread(thread)); },
    seed(threads) { threads.forEach((thread) => this.addThread(thread)); },
    search(query) {
      const terms = normalizeSearchTerms(query);
      if (terms.length === 0) return [];
      return rows
        .map((thread) => {
          const haystack = `${thread.subject} ${thread.sender} ${thread.senderEmail} ${thread.recipients.join(' ')} ${thread.snippet} ${thread.body}`.toLowerCase();
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
          return { ...thread, score, snippet: (thread.snippet || thread.body).slice(0, 140) };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score || b.receivedAt.localeCompare(a.receivedAt));
    },
  };
}

export function normalizeSearchTerms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}@._-]+|[^\p{L}\p{N}@._-]+$/gu, ''))
    .filter(Boolean);
}

export function normalizeThread(thread) {
  return {
    id: thread.id,
    accountId: thread.accountId || 'acct_demo_gmail',
    subject: thread.subject || '(no subject)',
    sender: thread.sender || 'unknown sender',
    senderEmail: thread.senderEmail || '',
    recipients: Array.isArray(thread.recipients) ? thread.recipients : [],
    snippet: thread.snippet || '',
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
      subject: normalized.subject,
      updated_at: normalized.receivedAt,
    },
    message: {
      id: `${normalized.id}:msg0`,
      thread_id: normalized.id,
      sender: normalized.sender,
      recipients_json: JSON.stringify(normalized.recipients),
      subject: normalized.subject,
      body_ciphertext: '[encrypted-body-placeholder]',
      body_preview: normalized.body.slice(0, 512),
      received_at: normalized.receivedAt,
    },
    fts: {
      subject: normalized.subject,
      sender: normalized.senderEmail ? `${normalized.sender} <${normalized.senderEmail}>` : normalized.sender,
      recipients: normalized.recipients.join(' '),
      body_preview: (normalized.snippet || normalized.body).slice(0, 512),
    },
  };
}
