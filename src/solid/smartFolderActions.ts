/**
 * Smart Folder actions — bridges UI events to store + DB persistence.
 * Single Responsibility: coordinate store updates with DB writes.
 */
import { appState, addSmartFolder as storeAdd, removeSmartFolder as storeRemove, setSmartFolders as storeSet } from './store';
import {
  createSmartFolder as dbCreate,
  deleteSmartFolder as dbDelete,
  getSmartFolders as dbGet,
  type SmartFolderInput,
} from '../smartFolderDb';

/** Load smart folders from DB into store (call on auth / account switch) */
export async function loadSmartFolders(): Promise<void> {
  const accountId = appState.account?.id;
  if (!accountId) return;
  const folders = await dbGet(accountId);
  storeSet(folders);
}

/** Alias for store's setSmartFolders (used in direct imports) */
export { storeSet as setSmartFolders };

/** Create a smart folder (DB + store) */
export async function createSmartFolder(input: SmartFolderInput): Promise<void> {
  const folder = await dbCreate(input);
  storeAdd(folder);
}

/** Delete a smart folder (DB + store) */
export async function deleteSmartFolder(id: string): Promise<void> {
  await dbDelete(id);
  storeRemove(id);
}

/** Get smart folders from DB (passthrough for tests) */
export { dbGet as getSmartFolders };
