import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFakeGmailConnector,
  createGmailOAuthUrl,
  gmailMinimalScopes,
  gmailSyncCursorPlan,
  ingestGmailMessages,
  redactForLogs,
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
