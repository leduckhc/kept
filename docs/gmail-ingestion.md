# Gmail OAuth and ingestion spike

Kept connects Gmail from the desktop app with a local OAuth callback. The important product boundary: Gmail tokens and message bodies stay on the user's device. Kept's app server is not in the OAuth redirect path and never receives mail content.

## Dev OAuth flow

1. Create a Google OAuth client for a desktop/local development app.
2. Add a loopback redirect URI such as `http://127.0.0.1:49210/oauth/google/callback`.
3. Generate a PKCE verifier/challenge and random `state` in the Tauri app.
4. Open the Google authorization URL from `createGmailOAuthUrl` in the system browser.
5. Listen on the loopback callback, verify `state`, exchange the code for tokens directly from the desktop app, then store tokens in the OS keychain/secure Tauri store.
6. Start ingestion with `ingestGmailMessages`, writing rows into the local SQLite/search interface.

Dev URL shape:

```js
import { createGmailOAuthUrl } from '../packages/mail-core/src/index.js';

const url = createGmailOAuthUrl({
  clientId: process.env.GMAIL_CLIENT_ID,
  redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
  state: '<random-state>',
  codeChallenge: '<pkce-s256-challenge>',
});
```

## Minimal scopes

Kept asks for one Gmail scope first:

- `https://www.googleapis.com/auth/gmail.readonly`

Product copy: “Kept can read mail so it can build your private local search index. Kept cannot send, delete, move, or modify messages.”

We should not request compose, modify, send, settings, or broad Google account scopes for this milestone.

## Incremental sync cursor

- Store the newest Gmail `historyId` after each successful ingestion batch.
- Next sync uses `users.history.list` from that cursor.
- Fetch changed message ids with `users.messages.get` in `metadata/full` format only as needed.
- If Gmail expires the cursor, perform a bounded full resync for recent mail and dedupe by immutable Gmail message id.
- Store cursor state only in the local encrypted DB.

## Local ingestion contract

`ingestGmailMessages` maps Gmail messages into provider-neutral local thread rows and search rows. Bodies are represented as local plaintext only in memory during ingestion, then persisted behind the existing encrypted-body placeholder/search-preview boundary from KPT-002.

For CI and demos without credentials, `createFakeGmailConnector` returns deterministic Gmail-shaped samples. This lets the full ingest path run without real tokens.

## Logging and redaction

Allowed logs:

- Provider name (`gmail`)
- Counts (`messages=25`, `threads=20`)
- Cursor presence (`historyId` exists) but not token values
- Timing and non-content errors

Never log:

- Message bodies, raw MIME payloads, snippets that may contain private content
- Email addresses before redaction
- OAuth access/refresh/id tokens
- PKCE verifier, client secret, authorization code
- AI prompts or prompt excerpts containing mail content

Use `redactForLogs` before anything from the connector reaches console output.

## Real Gmail sample verification

With credentials configured locally, the manual verification path is:

1. Run the Tauri/dev shell.
2. Click Connect Gmail.
3. Complete Google consent for the readonly scope.
4. Ingest the latest small batch.
5. Search locally for a known subject/sender.
6. Inspect terminal/browser logs and confirm no message body or token value appears.

In CI, run the fake connector tests instead; they exercise the same local mapping and cursor code without external Gmail access.
