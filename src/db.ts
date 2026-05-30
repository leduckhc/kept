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
  await db.execute(`ALTER TABLE threads ADD COLUMN is_starred INTEGER DEFAULT 0`).catch(() => {});
}
