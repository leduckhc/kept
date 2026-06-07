// db-browser.ts — HTTP proxy to Vite's better-sqlite3 middleware for E2E mode.
// Replaces the old sql.js WASM shim. All queries go to the real SQLite engine
// running server-side (with FTS5 support).

const BASE = '/__e2e_sql';

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export default class Database {
  path: string;

  constructor(path: string) {
    this.path = path;
  }

  static async load(path: string): Promise<Database> {
    const instance = new Database(path);

    // Expose reset helper on window for E2E test harness
    (window as unknown as Record<string, unknown>).__e2e_db = instance;
    (window as unknown as Record<string, unknown>).__e2e_reset = async () => {
      await fetch(`${BASE}/reset`, { method: 'POST' });
      location.reload();
    };

    return instance;
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    const resp = await fetch(`${BASE}/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, params: bindValues ?? [] }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `SQL select failed: ${resp.status}`);
    }
    const { rows } = await resp.json();
    return rows as T;
  }

  async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
    const resp = await fetch(`${BASE}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, params: bindValues ?? [] }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `SQL execute failed: ${resp.status}`);
    }
    return await resp.json();
  }

  async close(): Promise<boolean> {
    return true;
  }
}
