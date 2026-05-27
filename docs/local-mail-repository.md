# KPT-A0 Durable local mail repository

Kept's real-mail tracks share a normalized local repository contract exported from `packages/mail-core/src/index.js`.

## Repository API

`createLocalMailRepository({ path })` opens a durable local store and exposes:

- accounts: `upsertAccount`, `getAccount`, `listAccounts`
- threads: `upsertThread`, `getThread`, `listThreads`
- messages and attachments: `upsertMessage`, `getMessage`, `listMessages`
- local flags: `setFlags`
- sync state: `saveSyncState`, `getSyncState`
- AI audit trail: `recordAiAudit`, `listAiAuditEntries`
- search hook: `rebuildSearchIndex`

The current implementation uses an atomic JSON file with `schemaVersion: 1` as the durable path so the desktop app can move quickly without native SQLite packaging risk. The API boundary is intentionally repository-shaped so a SQLCipher/SQLite implementation can replace the backing file without changing Gmail, reader, search, or AI callers.

## Stable shapes

The exported normalizers define the v1 data contract:

- `LocalAccount`: `id`, `provider`, `email`, `displayName`, `createdAt`, `updatedAt`
- `LocalThread`: `id`, `accountId`, `subject`, `updatedAt`, `messageIds`, `metadata`
- `LocalMessage`: `id`, `accountId`, `threadId`, `providerMessageId`, `sender`, `recipients`, `subject`, `snippet`, `body`, `receivedAt`, `attachments`, `flags`, `metadata`
- `AttachmentMetadata`: `id`, `messageId`, `filename`, `mimeType`, `byteSize`, `metadata`
- `AiAuditEntry`: `id`, `threadId`, `messageId`, `provider`, `purpose`, `approved`, `requiresExplicitApproval`, `contentDescription`, `createdAt`, `metadata`

Secret-like fields are stripped at repository boundaries. OAuth tokens, API keys, client secrets, authorization codes, passwords, and code verifiers belong in the keychain/provider adapter layer, not the local mail repository.

## State matrix

`canonicalMailStateMatrix` is the canonical cross-system state contract for Gmail, local store, search, reader, and AI:

- Gmail is source of truth for provider ids and remote history; local store keeps only non-secret cursors plus normalized mail snapshots.
- Local store is source of truth for offline reader bodies, local flags, attachment metadata, sync state, and AI audit entries.
- Search is rebuildable from local store and must not become an independent body authority.
- Reader renders local snapshots by message id and does not receive credentials.
- AI only receives user-approved excerpts and records an audit entry tied to local content.

## Encryption fallback

Preferred v1 desktop backing remains SQLCipher/SQLite for whole-database at-rest protection and native FTS. If SQLCipher packaging blocks shipping speed, keep the repository API and use the durable JSON fallback with app-layer encrypted body blobs before writing the file. Search indexes must remain rebuildable from the decrypted local store, and secrets still stay out of repository rows.
