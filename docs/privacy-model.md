# Kept Privacy Model

## Commitments

- No Kept server receives message bodies by default.
- Search operates on a local encrypted SQLite cache.
- AI is disabled until the user adds a provider key and approves a prompt.
- Logs redact mail bodies, email addresses, tokens, API keys, and private prompts.

## Local storage baseline

The MVP spike in `packages/search-core` uses SQLite with FTS5 and app-layer AES-256-GCM encrypted blobs for canonical message fields. The default local DB path is documented in `docs/storage-search.md`; tests and demos use temporary DB files.

Encryption decision: prefer SQLCipher before production if Tauri packaging can absorb the native dependency, because it protects FTS terms, WAL pages, and metadata together. The current spike keeps message bodies, subjects, senders, and recipients encrypted in the main tables, while acknowledging that local FTS5 stores searchable derived text in the same device-local DB file.

## Prompt audit

Before any BYO AI call, Kept must show:

- Provider name
- Purpose
- Exact content category being sent
- User approval state
- Timestamp and local audit record
