/**
 * Unit tests for Smart Folder DB operations (CRUD).
 * Tests use an in-memory mock — no real SQLite needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSmartFolder,
  getSmartFolders,
  deleteSmartFolder,
  updateSmartFolder,
  type SmartFolderInput,
} from '../src/smartFolderDb';

// ── Mock database ─────────────────────────────────────────────
const mockDb = {
  execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
  select: vi.fn().mockResolvedValue([]),
};

vi.mock('../src/db', () => ({
  getDb: () => Promise.resolve(mockDb),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createSmartFolder ─────────────────────────────────────────

describe('createSmartFolder', () => {
  it('inserts with correct SQL and serialized conditions', async () => {
    const input: SmartFolderInput = {
      name: 'Work emails',
      accountId: 'acct-1',
      conditions: [{ field: 'domain', operator: 'equals', value: 'company.com' }],
      matchMode: 'all',
    };

    const result = await createSmartFolder(input);

    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain('INSERT');
    expect(sql).toContain('smart_folders');
    expect(params[1]).toBe('Work emails');
    expect(params[2]).toBe('acct-1');
    // conditions serialized as JSON
    expect(JSON.parse(params[3])).toEqual(input.conditions);
    expect(params[4]).toBe('all');
    // Returns the created folder with generated id
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Work emails');
  });

  it('generates a unique id', async () => {
    const input: SmartFolderInput = {
      name: 'Test',
      accountId: 'acct-1',
      conditions: [],
      matchMode: 'all',
    };

    const r1 = await createSmartFolder(input);
    const r2 = await createSmartFolder(input);
    expect(r1.id).not.toBe(r2.id);
  });
});

// ── getSmartFolders ───────────────────────────────────────────

describe('getSmartFolders', () => {
  it('queries by account_id and deserializes conditions', async () => {
    mockDb.select.mockResolvedValueOnce([
      {
        id: 'sf-1',
        name: 'Newsletters',
        account_id: 'acct-1',
        conditions: JSON.stringify([{ field: 'category', operator: 'equals', value: 'newsletters' }]),
        match_mode: 'all',
        created_at: 1700000000,
      },
    ]);

    const folders = await getSmartFolders('acct-1');

    expect(mockDb.select).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.select.mock.calls[0];
    expect(sql).toContain('smart_folders');
    expect(params).toContain('acct-1');
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Newsletters');
    expect(folders[0].conditions).toEqual([{ field: 'category', operator: 'equals', value: 'newsletters' }]);
    expect(folders[0].matchMode).toBe('all');
  });

  it('returns empty array when no folders', async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const folders = await getSmartFolders('acct-1');
    expect(folders).toEqual([]);
  });
});

// ── deleteSmartFolder ─────────────────────────────────────────

describe('deleteSmartFolder', () => {
  it('deletes by id', async () => {
    await deleteSmartFolder('sf-1');

    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain('DELETE');
    expect(sql).toContain('smart_folders');
    expect(params).toContain('sf-1');
  });
});

// ── updateSmartFolder ─────────────────────────────────────────

describe('updateSmartFolder', () => {
  it('updates name, conditions, matchMode', async () => {
    await updateSmartFolder('sf-1', {
      name: 'Renamed',
      conditions: [{ field: 'from', operator: 'contains', value: 'boss' }],
      matchMode: 'any',
    });

    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain('UPDATE');
    expect(sql).toContain('smart_folders');
    expect(params[0]).toBe('Renamed');
    expect(JSON.parse(params[1])).toEqual([{ field: 'from', operator: 'contains', value: 'boss' }]);
    expect(params[2]).toBe('any');
    expect(params[3]).toBe('sf-1');
  });
});
