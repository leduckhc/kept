// smartFolders.ts — KPT-083: Smart Folders (saved searches as virtual folders)
// Stored per-account in SQLite settings as JSON array.

import { getDb } from './db';
import { loadThreads, type Thread } from './store';
import { appState } from './solid/store';

export interface SmartFolder {
  id: string;
  name: string;
  query: string;       // Gmail-style search string (FTS5 / LIKE fallback)
  color: string;       // hex color for the sidebar dot
  createdAt: number;   // unix ms
}

const SETTINGS_KEY = 'smart-folders';

// ── CRUD ──────────────────────────────────────────────────

export async function loadSmartFolders(accountId: string): Promise<SmartFolder[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string | null }>>(
    'SELECT value FROM settings WHERE key = ? AND account_id = ?',
    [SETTINGS_KEY, accountId]
  );
  if (!rows[0]?.value) return [];
  try { return JSON.parse(rows[0].value) || []; } catch { return []; }
}

export async function saveSmartFolders(accountId: string, folders: SmartFolder[]): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR REPLACE INTO settings (key, account_id, value) VALUES (?, ?, ?)',
    [SETTINGS_KEY, accountId, JSON.stringify(folders)]
  );
}

export async function createSmartFolder(accountId: string, name: string, query: string, color = '#6366f1'): Promise<SmartFolder> {
  const folders = await loadSmartFolders(accountId);
  const folder: SmartFolder = {
    id: `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    query,
    color,
    createdAt: Date.now(),
  };
  folders.push(folder);
  await saveSmartFolders(accountId, folders);
  return folder;
}

export async function deleteSmartFolder(accountId: string, folderId: string): Promise<void> {
  const folders = await loadSmartFolders(accountId);
  await saveSmartFolders(accountId, folders.filter(f => f.id !== folderId));
}

export async function updateSmartFolder(accountId: string, folderId: string, patch: Partial<Pick<SmartFolder, 'name' | 'query' | 'color'>>): Promise<void> {
  const folders = await loadSmartFolders(accountId);
  const idx = folders.findIndex(f => f.id === folderId);
  if (idx < 0) return;
  if (patch.name !== undefined) folders[idx].name = patch.name;
  if (patch.query !== undefined) folders[idx].query = patch.query;
  if (patch.color !== undefined) folders[idx].color = patch.color;
  await saveSmartFolders(accountId, folders);
}

// ── Query execution ───────────────────────────────────────

export async function runSmartFolder(accountId: string, folder: SmartFolder): Promise<Thread[]> {
  return loadThreads(accountId, folder.query);
}

// ── UI: Create dialog ─────────────────────────────────────

const PRESET_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b'];

export function showCreateSmartFolderDialog(prefillQuery?: string): Promise<SmartFolder | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'smart-folder-dialog-overlay';
    overlay.innerHTML = `
      <div class="smart-folder-dialog">
        <div class="smart-folder-dialog-title">New Smart Folder</div>
        <label class="smart-folder-label">Name</label>
        <input class="smart-folder-input" id="sf-name" type="text" placeholder="e.g. Receipts" autofocus />
        <label class="smart-folder-label">Search query</label>
        <input class="smart-folder-input" id="sf-query" type="text" placeholder="e.g. invoice OR receipt" value="${escHtml(prefillQuery || '')}" />
        <label class="smart-folder-label">Color</label>
        <div class="smart-folder-colors" id="sf-colors">
          ${PRESET_COLORS.map((c, i) => `<button class="sf-color-btn${i === 0 ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="smart-folder-actions">
          <button class="sf-btn sf-btn-cancel" id="sf-cancel">Cancel</button>
          <button class="sf-btn sf-btn-save" id="sf-save">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let selectedColor = PRESET_COLORS[0];

    overlay.querySelectorAll<HTMLButtonElement>('.sf-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.sf-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedColor = btn.dataset.color!;
      });
    });

    const close = () => { overlay.remove(); resolve(null); };
    overlay.querySelector('#sf-cancel')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#sf-save')!.addEventListener('click', async () => {
      const name = (overlay.querySelector('#sf-name') as HTMLInputElement).value.trim();
      const query = (overlay.querySelector('#sf-query') as HTMLInputElement).value.trim();
      if (!name || !query) return;
      if (!appState.account) { close(); return; }
      const folder = await createSmartFolder(appState.account.id, name, query, selectedColor);
      overlay.remove();
      resolve(folder);
    });

    // Enter key shortcut
    overlay.querySelector('#sf-query')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        (overlay.querySelector('#sf-save') as HTMLButtonElement).click();
      }
    });
    overlay.querySelector('#sf-name')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        (overlay.querySelector('#sf-query') as HTMLInputElement).focus();
      }
    });
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
