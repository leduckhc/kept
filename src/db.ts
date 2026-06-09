// db.ts — SQLite schema + migrations via @tauri-apps/plugin-sql (Tauri) or HTTP proxy (browser E2E)

type Database = {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
};

let _db: Database | null = null;

async function loadDatabase(): Promise<Database> {
  const isTauri = '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    const { default: TauriDatabase } = await import('@tauri-apps/plugin-sql');
    return TauriDatabase.load('sqlite:kept.db');
  } else {
    const { default: BrowserDatabase } = await import('./db-browser');
    return BrowserDatabase.load('sqlite:kept.db');
  }
}

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await loadDatabase();
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

  // Only create FTS triggers if the virtual table actually exists (graceful fallback)
  const ftsExists = await db.select<{cnt: number}[]>(
    `SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='threads_fts'`
  );
  if (ftsExists[0]?.cnt > 0) {
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
  } else {
    // Drop stale triggers that reference non-existent threads_fts (e.g. from prior seed DB)
    await db.execute(`DROP TRIGGER IF EXISTS threads_ai`).catch(() => {});
    await db.execute(`DROP TRIGGER IF EXISTS threads_au`).catch(() => {});
    await db.execute(`DROP TRIGGER IF EXISTS threads_ad`).catch(() => {});
  }

  // KPT-029: star toggle
  await db.execute(`ALTER TABLE threads ADD COLUMN is_starred INTEGER DEFAULT 0`).catch(() => {});

  // KPT-040: thread mute
  await db.execute(`ALTER TABLE threads ADD COLUMN is_muted INTEGER DEFAULT 0`).catch(() => {});

  // Performance: cache sanitized HTML to avoid re-sanitizing on every open
  await db.execute(`ALTER TABLE messages ADD COLUMN sanitized_html TEXT`).catch(() => {});

  // KPT-074: per-account email signature
  await db.execute(`ALTER TABLE accounts ADD COLUMN signature TEXT`).catch(() => {});

  // KPT-080: Set Aside (shelf — not snoozed, not archived)
  await db.execute(`ALTER TABLE threads ADD COLUMN is_set_aside INTEGER DEFAULT 0`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_threads_set_aside ON threads(account_id, is_set_aside, received_at DESC)`).catch(() => {});

  // Newsletters & Updates: category column
  await db.execute(`ALTER TABLE threads ADD COLUMN category TEXT DEFAULT 'personal'`).catch(() => {});

  // Group by sender table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grouped_senders (
      email TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      group_type TEXT NOT NULL DEFAULT 'sender',
      created_at INTEGER DEFAULT (unixepoch())
    )
  `).catch(() => {});

  // KPT-081: VIP / Priority Senders
  await db.execute(`
    CREATE TABLE IF NOT EXISTS vip_senders (
      email TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (email, account_id)
    )
  `).catch(() => {});

  // Attachment metadata
  await db.execute(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      attachment_id TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id)
    )
  `).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_attachments_thread ON attachments(thread_id)`).catch(() => {});

  // Sender photo cache (Google People API / Gravatar)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sender_photos (
      email TEXT PRIMARY KEY,
      photo_url TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    )
  `).catch(() => {});

  // KPT-085: Auto Labels — user_labels column on threads
  await db.execute(`ALTER TABLE threads ADD COLUMN user_labels TEXT DEFAULT ''`).catch(() => {});

  // KPT-085: Auto Label rules table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS auto_label_rules (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      label TEXT NOT NULL,
      conditions TEXT NOT NULL,
      match_mode TEXT NOT NULL DEFAULT 'all',
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `).catch(() => {});

  // Local drafts (offline-first compose persistence)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS local_drafts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      gmail_draft_id TEXT,
      mode TEXT NOT NULL DEFAULT 'new',
      "to" TEXT NOT NULL DEFAULT '',
      cc TEXT NOT NULL DEFAULT '',
      bcc TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      html_body TEXT NOT NULL DEFAULT '',
      thread_id TEXT,
      in_reply_to TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `).catch(() => {});

  // KPT-UNIFIED: Account color_index for multi-account visual identification
  await db.execute(`ALTER TABLE accounts ADD COLUMN color_index INTEGER`).catch(() => {});

  // KPT-UNIFIED: Optimized index for unified inbox query
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_threads_unified ON threads(label, is_archived, received_at DESC)`).catch(() => {});

  // Account provider field (gmail, outlook, m365)
  await db.execute(`ALTER TABLE accounts ADD COLUMN provider TEXT DEFAULT 'gmail'`).catch(() => {});

  // KPT-086: Priority Senders
  await db.execute(`
    CREATE TABLE IF NOT EXISTS priority_senders (
      account_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      added_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, email)
    )
  `).catch(() => {});

  // KPT-090: Smart Folders (saved searches)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS smart_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_id TEXT NOT NULL,
      conditions TEXT NOT NULL DEFAULT '[]',
      match_mode TEXT NOT NULL DEFAULT 'all',
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `).catch(() => {});
}
