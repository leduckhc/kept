# Kept Privacy Model

## Commitments

- No Kept server receives message bodies by default.
- Search operates on a local encrypted SQLite cache.
- AI is disabled until the user adds a provider key and approves a prompt.
- Logs redact mail bodies, email addresses, tokens, API keys, and private prompts.

## Local storage baseline

The MVP uses SQLite with FTS5. Encryption decision is tracked in the storage spike: prefer SQLCipher if build/distribution friction is acceptable; otherwise encrypt sensitive message blobs at the application layer and keep searchable derived terms scoped to the local device.

## Prompt audit

Before any BYO AI call, Kept must show:

- Provider name
- Purpose
- Exact content category being sent
- User approval state
- Timestamp and local audit record
