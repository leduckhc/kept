// db.ts — SQLite schema + migrations via @tauri-apps/plugin-sql
import Database from '@tauri-apps/plugin-sql';

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load('sqlite:kept.db');
  await migrate(_db);
  return _db;
}

async function migrate(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      token_expiry INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      subject TEXT,
      snippet TEXT,
      sender_name TEXT,
      sender_email TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      is_unread INTEGER DEFAULT 1,
      is_archived INTEGER DEFAULT 0,
      is_blocked INTEGER DEFAULT 0,
      has_attachment INTEGER DEFAULT 0,
      gmail_thread_id TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      from_name TEXT,
      from_email TEXT NOT NULL,
      to_addresses TEXT,
      subject TEXT,
      body_text TEXT,
      body_html TEXT,
      received_at INTEGER NOT NULL,
      gmail_message_id TEXT,
      FOREIGN KEY (thread_id) REFERENCES threads(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS blocked_senders (
      email TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      blocked_at INTEGER DEFAULT (unixepoch())
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL,
      account_id TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (key, account_id)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_threads_received ON threads(received_at DESC)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_threads_sender ON threads(sender_email)
  `);

  // Additive migrations — safe to re-run (ALTER TABLE IF NOT EXISTS column not supported in SQLite,
  // so we catch the "duplicate column" error and ignore it)
  await db.execute(`ALTER TABLE threads ADD COLUMN has_attachment INTEGER DEFAULT 0`).catch(() => {});
  await db.execute(`ALTER TABLE threads ADD COLUMN snoozed_until INTEGER NULL`).catch(() => {});
  await db.execute(`ALTER TABLE threads ADD COLUMN snooze_label TEXT NULL`).catch(() => {});
  await db.execute(`ALTER TABLE threads ADD COLUMN message_count INTEGER NULL`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_threads_snooze ON threads(snoozed_until)`).catch(() => {});

  // KPT-023: label column for Sent/Draft/Starred/Inbox routing
  await db.execute(`ALTER TABLE threads ADD COLUMN label TEXT NOT NULL DEFAULT 'INBOX'`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_threads_label ON threads(account_id, label, received_at DESC)`).catch(() => {});

  // FTS5 full-text search on threads
  // content= means FTS5 reads from the threads table; content_rowid= points at the sqlite rowid.
  // We use sender_name (the actual column name) not from_name.
  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS threads_fts
    USING fts5(subject, sender_name, snippet, content='threads', content_rowid='rowid')
  `).catch(() => {}); // no-op if fts5 module unavailable (older SQLite)

  // Keep FTS in sync on INSERT
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS threads_ai AFTER INSERT ON threads BEGIN
      INSERT INTO threads_fts(rowid, subject, sender_name, snippet)
        VALUES (new.rowid, new.subject, new.sender_name, new.snippet);
    END
  `).catch(() => {});

  // Keep FTS in sync on UPDATE
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS threads_au AFTER UPDATE ON threads BEGIN
      INSERT INTO threads_fts(threads_fts, rowid, subject, sender_name, snippet)
        VALUES ('delete', old.rowid, old.subject, old.sender_name, old.snippet);
      INSERT INTO threads_fts(rowid, subject, sender_name, snippet)
        VALUES (new.rowid, new.subject, new.sender_name, new.snippet);
    END
  `).catch(() => {});

  // Keep FTS in sync on DELETE
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS threads_ad AFTER DELETE ON threads BEGIN
      INSERT INTO threads_fts(threads_fts, rowid, subject, sender_name, snippet)
        VALUES ('delete', old.rowid, old.subject, old.sender_name, old.snippet);
    END
  `).catch(() => {});

  // Backfill existing rows — idempotent for content= tables; fast on small datasets
  await db.execute(`INSERT INTO threads_fts(threads_fts) VALUES('rebuild')`).catch(() => {});

  // KPT-029: star toggle
  await db.execute(`ALTER TABLE threads ADD COLUMN is_starred INTEGER DEFAULT 0`).catch(() => {});

  // KPT-040: thread mute
  await db.execute(`ALTER TABLE threads ADD COLUMN is_muted INTEGER DEFAULT 0`).catch(() => {});

  // KPT-074: per-account email signature
  await db.execute(`ALTER TABLE accounts ADD COLUMN signature TEXT`).catch(() => {});
}
