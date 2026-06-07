/**
 * Vite plugin: SQLite proxy middleware for E2E testing.
 * Exposes POST /__e2e_sql endpoint that proxies queries to a real
 * better-sqlite3 database (with FTS5 support).
 *
 * Endpoints:
 *   POST /__e2e_sql/select  { query, params }  → { rows: [...] }
 *   POST /__e2e_sql/execute { query, params }  → { rowsAffected, lastInsertId }
 *   POST /__e2e_sql/reset                      → resets DB to seed state
 */
import type { Plugin, ViteDevServer } from 'vite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, existsSync } from 'fs';
import BetterSqlite3 from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DB = join(__dirname, 'kept.db');
const LIVE_DB = join(__dirname, 'kept-live.db');

export default function sqliteProxyPlugin(): Plugin {
  let db: BetterSqlite3.Database | null = null;

  function getDb(): BetterSqlite3.Database {
    if (db) return db;
    // Copy seed to live so tests start from known state
    if (!existsSync(LIVE_DB)) {
      copyFileSync(SEED_DB, LIVE_DB);
    }
    db = new BetterSqlite3(LIVE_DB);
    db.pragma('journal_mode = WAL');
    return db;
  }

  function resetDb() {
    if (db) {
      db.close();
      db = null;
    }
    copyFileSync(SEED_DB, LIVE_DB);
  }

  return {
    name: 'vite-plugin-sqlite-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__e2e_sql')) return next();

        // Parse body
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const path = req.url!.replace('/__e2e_sql', '');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');

            if (req.method === 'OPTIONS') {
              res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
              res.statusCode = 204;
              res.end();
              return;
            }

            if (path === '/reset' || path === '/reset/') {
              resetDb();
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            const { query, params } = body ? JSON.parse(body) : { query: '', params: [] };
            const database = getDb();

            if (path === '/select' || path === '/select/') {
              const stmt = database.prepare(query);
              const rows = params?.length ? stmt.all(...params) : stmt.all();
              res.statusCode = 200;
              res.end(JSON.stringify({ rows }));
            } else if (path === '/execute' || path === '/execute/') {
              const stmt = database.prepare(query);
              const result = params?.length ? stmt.run(...params) : stmt.run();
              res.statusCode = 200;
              res.end(JSON.stringify({
                rowsAffected: result.changes,
                lastInsertId: Number(result.lastInsertRowid) || undefined,
              }));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Unknown endpoint' }));
            }
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
    buildEnd() {
      if (db) {
        db.close();
        db = null;
      }
    },
  };
}
