/**
 * Smart Folder DB persistence (CRUD).
 * Single Responsibility: read/write smart folders to SQLite.
 * Filter logic lives in smartFolders.ts.
 */
import { getDb } from './db';
import type { SmartFolder, SmartFolderCondition } from './smartFolders';

// ── Types ─────────────────────────────────────────────────────

export type SmartFolderInput = {
  name: string;
  accountId: string;
  conditions: SmartFolderCondition[];
  matchMode: 'all' | 'any';
};

export type SmartFolderUpdate = {
  name: string;
  conditions: SmartFolderCondition[];
  matchMode: 'all' | 'any';
};

// ── DB row shape ──────────────────────────────────────────────

interface SmartFolderRow {
  id: string;
  name: string;
  account_id: string;
  conditions: string; // JSON
  match_mode: 'all' | 'any';
  created_at: number;
}

// ── Helpers ───────────────────────────────────────────────────

function generateId(): string {
  return `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rowToFolder(row: SmartFolderRow): SmartFolder {
  return {
    id: row.id,
    name: row.name,
    accountId: row.account_id,
    conditions: JSON.parse(row.conditions) as SmartFolderCondition[],
    matchMode: row.match_mode,
    createdAt: row.created_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────

export async function createSmartFolder(input: SmartFolderInput): Promise<SmartFolder> {
  const db = await getDb();
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  await db.execute(
    `INSERT INTO smart_folders (id, name, account_id, conditions, match_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.accountId, JSON.stringify(input.conditions), input.matchMode, now]
  );

  return {
    id,
    name: input.name,
    accountId: input.accountId,
    conditions: input.conditions,
    matchMode: input.matchMode,
    createdAt: now,
  };
}

export async function getSmartFolders(accountId: string): Promise<SmartFolder[]> {
  const db = await getDb();
  const rows = await db.select<SmartFolderRow[]>(
    `SELECT id, name, account_id, conditions, match_mode, created_at
     FROM smart_folders WHERE account_id = ? ORDER BY created_at ASC`,
    [accountId]
  );
  return rows.map(rowToFolder);
}

export async function deleteSmartFolder(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM smart_folders WHERE id = ?`, [id]);
}

export async function updateSmartFolder(id: string, update: SmartFolderUpdate): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE smart_folders SET name = ?, conditions = ?, match_mode = ? WHERE id = ?`,
    [update.name, JSON.stringify(update.conditions), update.matchMode, id]
  );
}
