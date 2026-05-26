# KPT-002 Local encrypted storage and FTS spike

## Schema

The MVP local model is SQLite-first:

- `accounts`: provider account identity.
- `threads`: cross-message grouping and updated timestamp.
- `messages`: sender/recipients/subject plus encrypted body payload and a bounded preview for search.
- `attachment_metadata`: filename, MIME type, size only; attachment bytes are not in the MVP search index.
- `messages_fts`: FTS5 index over subject, sender, recipients, and bounded body preview.

The SQL text is exported from `packages/search-core/src/index.js` as `sqliteSchema` so the implementation and tests cannot drift from docs.

## Encryption decision

CEO call: prefer **SQLCipher** for the Tauri desktop app because full-database encryption is cleaner for user trust and operational simplicity. Keep an app-layer encrypted body blob fallback if SQLCipher packaging blocks release velocity.

Tradeoff:

- SQLCipher: strongest simple story, fewer accidental plaintext files, extra native packaging work.
- App-layer blobs: easier JS-only spike, but more surfaces to audit and FTS previews need stricter minimization.

## Demo

```bash
npm run seed:demo -w @kept/search-core
```

The demo seeds synthetic mail locally and returns ranked results for `invoice next week`. There is no network dependency.
