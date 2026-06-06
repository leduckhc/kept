// db-browser.ts — sql.js (WASM) shim for browser E2E mode.
// Implements the subset of @tauri-apps/plugin-sql's Database API that Kept uses.
// Persists the database to IndexedDB so data survives page refreshes.
import initSqlJs, { type Database as SqlJsDb } from 'sql.js';

const IDB_NAME = 'kept-e2e';
const IDB_STORE = 'database';
const IDB_KEY = 'main';

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

/** Read the persisted database bytes from IndexedDB */
function idbLoad(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const get = store.get(IDB_KEY);
        get.onsuccess = () => {
          db.close();
          resolve(get.result instanceof Uint8Array ? get.result : null);
        };
        get.onerror = () => { db.close(); resolve(null); };
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Persist the database bytes to IndexedDB */
function idbSave(data: Uint8Array): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(data, IDB_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Delete persisted database from IndexedDB (reset to seed) */
function idbClear(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(IDB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export default class Database {
  path: string;
  private db: SqlJsDb | null = null;
  private _persistScheduled = false;

  constructor(path: string) {
    this.path = path;
  }

  static async load(path: string): Promise<Database> {
    const instance = new Database(path);

    // Fetch WASM binary manually to avoid MIME type issues with Vite dev server
    const wasmResp = await fetch('/sql-wasm.wasm');
    const wasmBinary = await wasmResp.arrayBuffer();

    const SQL = await initSqlJs({ wasmBinary });

    // Priority: IndexedDB (persisted state) → seed file → empty
    const persisted = await idbLoad();
    if (persisted) {
      instance.db = new SQL.Database(persisted);
    } else {
      try {
        const resp = await fetch('/kept.db');
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          instance.db = new SQL.Database(new Uint8Array(buf));
          // Persist the seed so first load is captured
          instance._persistNow();
        } else {
          instance.db = new SQL.Database();
        }
      } catch {
        instance.db = new SQL.Database();
      }
    }

    // Expose reset helper on window for E2E test harness
    (window as unknown as Record<string, unknown>).__e2e_db = instance;
    (window as unknown as Record<string, unknown>).__e2e_reset = async () => {
      await idbClear();
      location.reload();
    };

    return instance;
  }

  /** Schedule a debounced persist (batches rapid-fire migrations into one write) */
  private _schedulePersist(): void {
    if (this._persistScheduled) return;
    this._persistScheduled = true;
    queueMicrotask(() => {
      this._persistScheduled = false;
      this._persistNow();
    });
  }

  /** Immediately persist current DB state to IndexedDB */
  private _persistNow(): void {
    if (!this.db) return;
    const data = this.db.export();
    idbSave(new Uint8Array(data));
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(query);
    if (bindValues?.length) stmt.bind(bindValues as (number | string | Uint8Array | null)[]);

    const results: Record<string, unknown>[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row as Record<string, unknown>);
    }
    stmt.free();
    return results as T;
  }

  async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
    if (!this.db) throw new Error('Database not initialized');
    if (bindValues?.length) {
      this.db.run(query, bindValues as (number | string | Uint8Array | null)[]);
    } else {
      this.db.run(query);
    }
    const changes = this.db.getRowsModified();
    this._schedulePersist();
    return { rowsAffected: changes, lastInsertId: undefined };
  }

  async close(): Promise<boolean> {
    this.db?.close();
    this.db = null;
    return true;
  }
}
