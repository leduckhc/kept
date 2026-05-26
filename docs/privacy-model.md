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

## Gmail OAuth and ingestion security notes

- Use a desktop/local loopback OAuth flow with PKCE and `state` verification.
- Request only `https://www.googleapis.com/auth/gmail.readonly` for the MVP.
- Store Gmail access/refresh tokens in OS keychain or secure Tauri storage, never in plaintext app settings.
- Persist Gmail history cursors and message content only in the encrypted local database.
- Do not route Gmail message bodies through a Kept server.
- Redact message bodies, snippets, raw MIME payloads, email addresses, OAuth tokens, PKCE verifier, auth code, API keys, and AI prompts from logs.
