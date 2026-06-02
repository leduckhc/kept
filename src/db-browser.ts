// db-browser.ts — sql.js (WASM) shim for browser E2E mode.
// Implements the subset of @tauri-apps/plugin-sql's Database API that Kept uses.
import initSqlJs, { type Database as SqlJsDb } from 'sql.js';

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export default class Database {
  path: string;
  private db: SqlJsDb | null = null;

  constructor(path: string) {
    this.path = path;
  }

  static async load(path: string): Promise<Database> {
    const instance = new Database(path);

    // Fetch WASM binary manually to avoid MIME type issues with Vite dev server
    const wasmResp = await fetch('/sql-wasm.wasm');
    const wasmBinary = await wasmResp.arrayBuffer();

    const SQL = await initSqlJs({
      wasmBinary,
    });

    // Try loading pre-seeded DB from e2e/kept.db via fetch
    try {
      const resp = await fetch('/kept.db');
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        instance.db = new SQL.Database(new Uint8Array(buf));
      } else {
        instance.db = new SQL.Database();
      }
    } catch {
      instance.db = new SQL.Database();
    }

    return instance;
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
    return { rowsAffected: changes, lastInsertId: undefined };
  }

  async close(): Promise<boolean> {
    this.db?.close();
    this.db = null;
    return true;
  }
}
