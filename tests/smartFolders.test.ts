/**
 * Tests for Smart Folders (KPT-083) — CRUD, query execution, UI dialog behavior
 * Covers: create/read/update/delete, JSON persistence, color selection,
 * dialog validation, and integration with search/thread filtering.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock DB layer ─────────────────────────────────────────

let settingsStore: Record<string, string> = {};

vi.mock('../src/db', () => ({
  getDb: () => ({
    select: async (sql: string, params: any[]) => {
      const key = `${params[0]}:${params[1]}`;
      const value = settingsStore[key] || null;
      return value ? [{ value }] : [];
    },
    execute: async (sql: string, params: any[]) => {
      if (sql.includes('INSERT OR REPLACE INTO settings')) {
        const key = `${params[0]}:${params[1]}`;
        settingsStore[key] = params[2];
      }
    },
  }),
}));

vi.mock('../src/solid/store', () => ({
  appState: { account: { id: 'acc-1', email: 'test@gmail.com', name: 'Test' } },
  setAppState: vi.fn(),
}));

vi.mock('../src/store', () => ({
  loadThreads: async () => [],
}));

import {
  loadSmartFolders,
  saveSmartFolders,
  createSmartFolder,
  deleteSmartFolder,
  updateSmartFolder,
  runSmartFolder,
  showCreateSmartFolderDialog,
  type SmartFolder,
} from '../src/smartFolders';

// ── Unit tests: CRUD operations ───────────────────────────

describe('Smart Folders — CRUD', () => {
  beforeEach(() => {
    settingsStore = {};
  });

  it('loadSmartFolders returns empty array when none exist', async () => {
    const folders = await loadSmartFolders('acc-1');
    expect(folders).toEqual([]);
  });

  it('createSmartFolder persists to settings store', async () => {
    const folder = await createSmartFolder('acc-1', 'Receipts', 'invoice OR receipt');
    expect(folder.name).toBe('Receipts');
    expect(folder.query).toBe('invoice OR receipt');
    expect(folder.color).toBe('#6366f1'); // default
    expect(folder.id).toMatch(/^sf-/);
    expect(folder.createdAt).toBeGreaterThan(0);

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Receipts');
  });

  it('createSmartFolder accepts custom color', async () => {
    const folder = await createSmartFolder('acc-1', 'Work', 'from:boss', '#ec4899');
    expect(folder.color).toBe('#ec4899');
  });

  it('multiple folders are stored together', async () => {
    await createSmartFolder('acc-1', 'A', 'query-a');
    await createSmartFolder('acc-1', 'B', 'query-b');
    await createSmartFolder('acc-1', 'C', 'query-c');

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded).toHaveLength(3);
    expect(loaded.map(f => f.name)).toEqual(['A', 'B', 'C']);
  });

  it('deleteSmartFolder removes by ID', async () => {
    const f1 = await createSmartFolder('acc-1', 'Keep', 'q1');
    const f2 = await createSmartFolder('acc-1', 'Delete', 'q2');

    await deleteSmartFolder('acc-1', f2.id);

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(f1.id);
  });

  it('deleteSmartFolder is no-op for non-existent ID', async () => {
    await createSmartFolder('acc-1', 'A', 'q');
    await deleteSmartFolder('acc-1', 'nonexistent-id');

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded).toHaveLength(1);
  });

  it('updateSmartFolder patches name', async () => {
    const folder = await createSmartFolder('acc-1', 'Old Name', 'query');
    await updateSmartFolder('acc-1', folder.id, { name: 'New Name' });

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded[0].name).toBe('New Name');
    expect(loaded[0].query).toBe('query'); // unchanged
  });

  it('updateSmartFolder patches query', async () => {
    const folder = await createSmartFolder('acc-1', 'Folder', 'old-query');
    await updateSmartFolder('acc-1', folder.id, { query: 'new-query' });

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded[0].query).toBe('new-query');
  });

  it('updateSmartFolder patches color', async () => {
    const folder = await createSmartFolder('acc-1', 'F', 'q', '#6366f1');
    await updateSmartFolder('acc-1', folder.id, { color: '#ef4444' });

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded[0].color).toBe('#ef4444');
  });

  it('updateSmartFolder is no-op for non-existent folder', async () => {
    await createSmartFolder('acc-1', 'Existing', 'q');
    await updateSmartFolder('acc-1', 'ghost-id', { name: 'Nope' });

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded[0].name).toBe('Existing');
  });

  it('folders are per-account (isolation)', async () => {
    await createSmartFolder('acc-1', 'Account 1 Folder', 'q1');
    await createSmartFolder('acc-2', 'Account 2 Folder', 'q2');

    const acc1 = await loadSmartFolders('acc-1');
    const acc2 = await loadSmartFolders('acc-2');
    expect(acc1).toHaveLength(1);
    expect(acc1[0].name).toBe('Account 1 Folder');
    expect(acc2).toHaveLength(1);
    expect(acc2[0].name).toBe('Account 2 Folder');
  });
});

// ── Resilience tests ──────────────────────────────────────

describe('Smart Folders — resilience', () => {
  beforeEach(() => {
    settingsStore = {};
  });

  it('handles corrupted JSON gracefully', async () => {
    settingsStore['smart-folders:acc-1'] = '{not valid json[';
    const folders = await loadSmartFolders('acc-1');
    expect(folders).toEqual([]);
  });

  it('handles null value in settings', async () => {
    // Simulate a row where value is the string "null"
    settingsStore['smart-folders:acc-1'] = 'null';
    const folders = await loadSmartFolders('acc-1');
    expect(folders).toEqual([]);
  });

  it('saveSmartFolders with empty array clears all folders', async () => {
    await createSmartFolder('acc-1', 'Temp', 'q');
    await saveSmartFolders('acc-1', []);

    const loaded = await loadSmartFolders('acc-1');
    expect(loaded).toEqual([]);
  });
});

// ── Query execution ───────────────────────────────────────

describe('Smart Folders — runSmartFolder', () => {
  it('delegates to loadThreads with folder query', async () => {
    const store = await import('../src/store');
    const spy = vi.spyOn(store, 'loadThreads');

    const folder: SmartFolder = {
      id: 'sf-1',
      name: 'Test',
      query: 'from:alice invoice',
      color: '#6366f1',
      createdAt: Date.now(),
    };

    await runSmartFolder('acc-1', folder);
    expect(spy).toHaveBeenCalledWith('acc-1', 'from:alice invoice');
    spy.mockRestore();
  });
});

// ── UI dialog tests ───────────────────────────────────────

describe('Smart Folders — create dialog UI', () => {
  it('renders dialog with correct structure', () => {
    // Start the dialog (don't await — it's interactive)
    const promise = showCreateSmartFolderDialog();

    const overlay = document.querySelector('.smart-folder-dialog-overlay');
    expect(overlay).not.toBeNull();

    const title = overlay?.querySelector('.smart-folder-dialog-title');
    expect(title?.textContent).toBe('New Smart Folder');

    const nameInput = overlay?.querySelector('#sf-name') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.placeholder).toBe('e.g. Receipts');

    const queryInput = overlay?.querySelector('#sf-query') as HTMLInputElement;
    expect(queryInput).not.toBeNull();

    // Clean up
    overlay?.remove();
  });

  it('prefills query when provided', () => {
    showCreateSmartFolderDialog('from:boss');

    const overlay = document.querySelector('.smart-folder-dialog-overlay');
    const queryInput = overlay?.querySelector('#sf-query') as HTMLInputElement;
    expect(queryInput.value).toBe('from:boss');

    overlay?.remove();
  });

  it('renders 8 color preset buttons', () => {
    showCreateSmartFolderDialog();

    const overlay = document.querySelector('.smart-folder-dialog-overlay');
    const colorBtns = overlay?.querySelectorAll('.sf-color-btn');
    expect(colorBtns?.length).toBe(8);

    // First button should be active by default
    expect(colorBtns?.[0].classList.contains('active')).toBe(true);

    overlay?.remove();
  });

  it('cancel button closes dialog and resolves null', async () => {
    const promise = showCreateSmartFolderDialog();

    const overlay = document.querySelector('.smart-folder-dialog-overlay');
    const cancelBtn = overlay?.querySelector('#sf-cancel') as HTMLButtonElement;
    cancelBtn.click();

    const result = await promise;
    expect(result).toBeNull();
    expect(document.querySelector('.smart-folder-dialog-overlay')).toBeNull();
  });

  it('clicking overlay background closes dialog', async () => {
    const promise = showCreateSmartFolderDialog();

    const overlay = document.querySelector('.smart-folder-dialog-overlay') as HTMLElement;
    // Simulate click on the overlay itself (not the dialog content)
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = await promise;
    expect(result).toBeNull();
  });

  it('save button does nothing when name is empty', async () => {
    showCreateSmartFolderDialog();

    const overlay = document.querySelector('.smart-folder-dialog-overlay');
    const queryInput = overlay?.querySelector('#sf-query') as HTMLInputElement;
    queryInput.value = 'some query';

    // Name is empty — click save
    const saveBtn = overlay?.querySelector('#sf-save') as HTMLButtonElement;
    saveBtn.click();

    // Dialog should still be open
    await new Promise(r => setTimeout(r, 10));
    expect(document.querySelector('.smart-folder-dialog-overlay')).not.toBeNull();

    overlay?.remove();
  });

  it('save button does nothing when query is empty', async () => {
    showCreateSmartFolderDialog();

    const overlay = document.querySelector('.smart-folder-dialog-overlay');
    const nameInput = overlay?.querySelector('#sf-name') as HTMLInputElement;
    nameInput.value = 'My Folder';

    // Query is empty — click save
    const saveBtn = overlay?.querySelector('#sf-save') as HTMLButtonElement;
    saveBtn.click();

    await new Promise(r => setTimeout(r, 10));
    expect(document.querySelector('.smart-folder-dialog-overlay')).not.toBeNull();

    overlay?.remove();
  });

  it('color selection updates active class', () => {
    showCreateSmartFolderDialog();

    const overlay = document.querySelector('.smart-folder-dialog-overlay');
    const colorBtns = overlay?.querySelectorAll('.sf-color-btn') as NodeListOf<HTMLButtonElement>;

    // Click second color
    colorBtns[1].click();

    expect(colorBtns[0].classList.contains('active')).toBe(false);
    expect(colorBtns[1].classList.contains('active')).toBe(true);

    overlay?.remove();
  });

  it('Enter on name input focuses query input', () => {
    showCreateSmartFolderDialog();

    const overlay = document.querySelector('.smart-folder-dialog-overlay');
    const nameInput = overlay?.querySelector('#sf-name') as HTMLInputElement;
    const queryInput = overlay?.querySelector('#sf-query') as HTMLInputElement;

    nameInput.focus();
    nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(document.activeElement).toBe(queryInput);

    overlay?.remove();
  });
});
