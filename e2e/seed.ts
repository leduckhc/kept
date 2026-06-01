#!/usr/bin/env node
/**
 * E2E seed script — creates a pre-populated kept.db for testing.
 * Usage: node e2e/seed.ts (or: bun e2e/seed.ts)
 *
 * Requires: better-sqlite3 (dev dependency)
 * Output: creates e2e/kept.db ready to be used by Tauri
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'kept.db');

// Schema from src/db.ts — replicated here so seed is standalone
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry INTEGER,
    signature TEXT DEFAULT '',
    created_at INTEGER DEFAULT (unixepoch())
  );

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
    is_starred INTEGER DEFAULT 0,
    snoozed_until INTEGER NULL,
    snooze_label TEXT NULL,
    message_count INTEGER NULL,
    label TEXT DEFAULT 'INBOX',
    category TEXT DEFAULT 'personal',
    is_muted INTEGER DEFAULT 0,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

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
  );

  CREATE TABLE IF NOT EXISTS blocked_senders (
    email TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    blocked_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL,
    account_id TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (key, account_id)
  );

  CREATE INDEX IF NOT EXISTS idx_threads_received ON threads(received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_threads_sender ON threads(sender_email);
`;

console.log(`Creating seeded database at: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create schema
db.exec(SCHEMA);

// Load and execute seed SQL
const seedSql = readFileSync(join(__dirname, 'seed.sql'), 'utf-8');
db.exec(seedSql);

db.close();

console.log(`✓ Seeded database created: ${DB_PATH}`);
console.log(`  - 1 account (testuser@gmail.com)`);
console.log(`  - 22 threads (20 inbox + 2 sent)`);
console.log(`  - 20 messages (including multi-message threads)`);
console.log(`  - 2 blocked senders`);
console.log(`\nTo use: copy to Tauri's app data dir, or run with VITE_E2E=1`);
