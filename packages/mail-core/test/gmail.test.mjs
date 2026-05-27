import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFakeGmailConnector,
  createGmailApiConnector,
  createGmailOAuthUrl,
  createJsonMailStore,
  createKeychainTokenStore,
  createMemoryJsonStorage,
  createMemoryKeychain,
  createPkcePair,
  gmailMinimalScopes,
  gmailSyncCursorPlan,
  ingestGmailMessages,
  normalizeGmailApiMessage,
  parseGmailOAuthCallback,
  redactForLogs,
  syncGmailInbox,
} from '../src/index.js';

test('gmail OAuth URL uses desktop-safe PKCE parameters and minimal readonly scope', () => {
  const url = createGmailOAuthUrl({
    clientId: 'desktop-client-id.apps.googleusercontent.com',
    redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
    state: 'state-123',
    codeChallenge: 'challenge-abc',
  });

  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), gmailMinimalScopes.join(' '));
  assert.deepEqual(gmailMinimalScopes, ['https://www.googleapis.com/auth/gmail.readonly']);
});

test('PKCE helper creates verifier and S256 challenge without reserved URL characters', async () => {
  const pair = await createPkcePair();

  assert.equal(pair.method, 'S256');
  assert.match(pair.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(pair.challenge, /^[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(pair.challenge, /[+/=]/);
});

test('OAuth callback parser validates loopback state and extracts authorization code', () => {
  const parsed = parseGmailOAuthCallback('http://127.0.0.1:49210/oauth/google/callback?state=state-123&code=4/0-auth-code-secret', {
    expectedState: 'state-123',
  });

  assert.deepEqual(parsed, { ok: true, state: 'state-123', code: '4/0-auth-code-secret' });
  assert.throws(
    () => parseGmailOAuthCallback('http://127.0.0.1:49210/oauth/google/callback?state=attacker&code=bad', { expectedState: 'state-123' }),
    /state mismatch/,
  );
});

test('fake Gmail connector returns deterministic recent messages without credentials', async () => {
  const connector = createFakeGmailConnector();
  const page = await connector.listRecentMessages({ maxResults: 2 });

  assert.equal(page.messages.length, 2);
  assert.equal(page.historyId, 'fake-history-002');
  assert.match(page.messages[0].subject, /Welcome/);
});

test('gmail ingestion maps recent messages into local thread rows and sync cursor', async () => {
  const connector = createFakeGmailConnector();
  const result = await ingestGmailMessages({ connector, accountId: 'acct_local_gmail', maxResults: 2 });

  assert.equal(result.threads.length, 2);
  assert.equal(result.cursor.provider, 'gmail');
  assert.equal(result.cursor.historyId, 'fake-history-002');
  assert.equal(result.rows[0].message.body_ciphertext, '[encrypted-body-placeholder]');
  assert.match(result.rows[0].message.body_preview, /Welcome to Kept/);
});

test('redaction removes message bodies, snippets, and OAuth secrets from logs', () => {
  const body = 'private phrase about payroll and medical mail';
  const snippet = 'short inbox preview about medical mail';
  const logLine = redactForLogs({
    email: 'milan@example.com',
    access_token: 'ya29.secret-token',
    refresh_token: '1//refresh-secret',
    authorization_code: '4/0-auth-code-secret',
    code_verifier: 'pkce-verifier-secret',
    body,
    snippet,
  });

  assert.doesNotMatch(logLine, /milan@example.com/);
  assert.doesNotMatch(logLine, /secret-token/);
  assert.doesNotMatch(logLine, /refresh-secret/);
  assert.doesNotMatch(logLine, /auth-code-secret/);
  assert.doesNotMatch(logLine, /pkce-verifier-secret/);
  assert.doesNotMatch(logLine, /payroll and medical/);
  assert.doesNotMatch(logLine, /short inbox preview/);
  assert.match(logLine, /\[email-redacted\]/);
  assert.match(logLine, /\[secret-redacted\]/);
  assert.match(logLine, /\[body-redacted\]/);
});

test('sync cursor plan prefers Gmail history id then bounded full resync fallback', () => {
  assert.match(gmailSyncCursorPlan.primary, /historyId/);
  assert.match(gmailSyncCursorPlan.fallback, /bounded full resync/);
});

test('token store keeps OAuth tokens behind injected keychain adapter', async () => {
  const keychain = createMemoryKeychain();
  const tokenStore = createKeychainTokenStore({ keychain });

  await tokenStore.saveTokens('acct_local_gmail', {
    accessToken: 'ya29.access-token',
    refreshToken: '1//refresh-token',
    expiresAt: '2026-05-27T10:00:00Z',
  });

  assert.deepEqual(await tokenStore.loadTokens('acct_local_gmail'), {
    accessToken: 'ya29.access-token',
    refreshToken: '1//refresh-token',
    expiresAt: '2026-05-27T10:00:00Z',
    scope: gmailMinimalScopes.join(' '),
    tokenType: 'Bearer',
  });
  assert.equal(keychain.entries.size, 1);
  assert.equal([...keychain.entries.keys()][0], 'kept.gmail.oauth:acct_local_gmail');
});

test('Gmail API connector fetches inbox list, loads full messages, and normalizes safely', async () => {
  const tokenStore = { async loadTokens() { return { accessToken: 'ya29.access-token' }; } };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization });
    if (url.includes('/messages?')) {
      return jsonResponse({ historyId: '12345', messages: [{ id: 'msg-1' }] });
    }
    return jsonResponse(gmailApiMessageFixture());
  };

  const connector = createGmailApiConnector({ tokenStore, fetchImpl, accountId: 'acct_local_gmail' });
  const page = await connector.listRecentMessages({ maxResults: 1 });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].authorization, 'Bearer ya29.access-token');
  assert.match(calls[0].url, /labelIds=INBOX/);
  assert.equal(page.historyId, '12345');
  assert.equal(page.messages[0].subject, 'Gmail alpha sync');
  assert.equal(page.messages[0].textBody, 'Private Gmail body for local sync only.');
});

test('Gmail API payload normalization maps headers, date, and nested text body', () => {
  const normalized = normalizeGmailApiMessage(gmailApiMessageFixture());

  assert.equal(normalized.id, 'msg-1');
  assert.equal(normalized.threadId, 'thr-1');
  assert.equal(normalized.from, 'Mara Vale <mara@example.com>');
  assert.equal(normalized.to, 'you@example.com');
  assert.equal(normalized.receivedAt, '2026-05-27T09:30:00.000Z');
  assert.equal(normalized.textBody, 'Private Gmail body for local sync only.');
  assert.equal(normalized.snippet, 'Private Gmail body for local sync only.');
});

test('local JSON mail store persists synced Gmail state and reloads without plaintext bodies or tokens', async () => {
  const connector = createFakeGmailConnector([
    {
      id: 'gmail_msg_private',
      threadId: 'gmail_thr_private',
      historyId: 'history-private',
      subject: 'Private dinner note',
      from: 'Mara Vale <mara@example.com>',
      to: 'you@example.com',
      textBody: 'Secret body that should not be persisted in this UI store',
      receivedAt: '2026-05-27T09:00:00Z',
    },
  ]);
  const storage = createMemoryJsonStorage();
  const store = createJsonMailStore({ storage });

  await syncGmailInbox({ connector, accountId: 'acct_local_gmail', mailStore: store, maxResults: 1 });
  const reopenedStore = createJsonMailStore({ storage });
  const reopened = await reopenedStore.loadSyncState();
  const raw = [...storage.entries.values()][0];

  assert.equal(reopened.accounts.acct_local_gmail.cursor.historyId, 'history-private');
  assert.equal(reopened.accounts.acct_local_gmail.threads[0].subject, 'Private dinner note');
  assert.equal(reopened.accounts.acct_local_gmail.threads[0].body, undefined);
  assert.doesNotMatch(raw, /Secret body/);
  assert.doesNotMatch(raw, /ya29|refresh-token/);
});

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return body; } };
}

function gmailApiMessageFixture() {
  return {
    id: 'msg-1',
    threadId: 'thr-1',
    historyId: 'hist-1',
    internalDate: String(Date.UTC(2026, 4, 27, 9, 30, 0)),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'Subject', value: 'Gmail alpha sync' },
        { name: 'From', value: 'Mara Vale <mara@example.com>' },
        { name: 'To', value: 'you@example.com' },
      ],
      parts: [
        { mimeType: 'text/html', body: { data: btoa('<p>Ignore HTML</p>') } },
        { mimeType: 'text/plain', body: { data: btoa('Private Gmail body for local sync only.').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') } },
      ],
    },
  };
}
