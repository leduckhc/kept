# KPT-002 Local encrypted storage and FTS spike

## Schema

The MVP local model is SQLite-first:

- `accounts`: local mail account identity.
- `threads`: provider thread IDs and encrypted thread subject.
- `messages`: provider message IDs, timestamps, encrypted sender, recipients, subject, and body.
- `attachments`: metadata only: filename, MIME type, size, optional content ID. Attachment bytes are not in the MVP search index.
- `messages_fts`: FTS5 index over subject, body, sender, and recipients for local-only lookup.

The SQL text is exported from `packages/search-core/src/index.js` as `sqliteSchema` so docs/tests can check the real schema surface.

## Local DB location

The search package exposes `getDefaultKeptDatabasePath()` for the desktop app to use:

- macOS: `~/Library/Application Support/Kept/kept.sqlite`
- Windows: `%APPDATA%\Kept\kept.sqlite`
- Linux: `~/.local/share/Kept/kept.sqlite`

Tests and the demo command use temporary database files so they do not touch a real mailbox.

## Encryption decision

Decision for this JS-only spike: use app-layer AES-256-GCM encrypted blobs for canonical message fields, while keeping FTS5 derived text local to the same SQLite file.

Production preference remains **SQLCipher** if Tauri packaging can absorb the native dependency.

Tradeoff:

- SQLCipher: strongest trust story; protects tables, FTS terms, WAL pages, and metadata together; requires native packaging work.
- App-layer blobs: no new dependency for the spike; message bodies/subjects/senders/recipients are encrypted in canonical tables; FTS terms remain plaintext-derived inside the local DB and must be disclosed/audited.

## Demo

```bash
npm --workspace @kept/search-core run demo -- "boarding pass"
# legacy alias also works:
npm run seed:demo -w @kept/search-core -- "boarding pass"
```

The demo seeds synthetic non-sensitive mail into a temporary SQLite database and returns ranked results. There is no network dependency.
