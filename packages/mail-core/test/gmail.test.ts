import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createLocalMailRepository,
  createBrowserLocalMailRepository,
  createFakeGmailConnector,
  createGmailApiConnector,
  createGmailOAuthUrl,
  createJsonMailStore,
  buildGmailScopes,
  gmailModifyScopes,
  gmailTriageActionTypes,
  gmailTriageActionStatuses,
  gmailTriageActionToModifyPayload,
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

async function withTempRepo(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'kept-gmail-sync-'));
  try {
    return await fn(join(dir, 'mail-store.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('gmail OAuth URL uses desktop-safe PKCE parameters and minimal readonly scope', () => {
  const url = createGmailOAuthUrl({
    clientId: 'desktop-client-id.apps.googleusercontent.com',
    redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
    state: 'state-123',
    codeChallenge: 'challenge-abc',
  } as any);

  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), gmailMinimalScopes.join(' '));
  assert.deepEqual(gmailMinimalScopes, ['https://www.googleapis.com/auth/gmail.readonly']);
});

test('gmail scope builder keeps readonly default and adds modify only for triage actions', () => {
  assert.deepEqual(buildGmailScopes(), gmailMinimalScopes);
  assert.deepEqual(buildGmailScopes({ enableModify: false }), gmailMinimalScopes);
  assert.deepEqual(buildGmailScopes({ enableModify: true }), [...gmailMinimalScopes, ...gmailModifyScopes]);

  const modifyUrl = createGmailOAuthUrl({
    clientId: 'desktop-client-id.apps.googleusercontent.com',
    redirectUri: 'http://127.0.0.1:49210/oauth/google/callback',
    state: 'state-123',
    codeChallenge: 'challenge-abc',
    enableModify: true,
  } as any);
  assert.match(modifyUrl.searchParams.get('scope'), /gmail\.readonly/);
  assert.match(modifyUrl.searchParams.get('scope'), /gmail\.modify/);
});

test('triage action contract is explicit and maps to Gmail label modify payloads', () => {
  assert.deepEqual(gmailTriageActionTypes, ['archive', 'mark-read', 'mark-unread', 'star', 'unstar']);
  assert.deepEqual(gmailTriageActionStatuses, ['queued', 'syncing', 'synced', 'error', 'needs-reconnect']);
  assert.deepEqual(gmailTriageActionToModifyPayload('archive'), { addLabelIds: [], removeLabelIds: ['INBOX'] });
  assert.deepEqual(gmailTriageActionToModifyPayload('mark-read'), { addLabelIds: [], removeLabelIds: ['UNREAD'] });
  assert.deepEqual(gmailTriageActionToModifyPayload('mark-unread'), { addLabelIds: ['UNREAD'], removeLabelIds: [] });
  assert.deepEqual(gmailTriageActionToModifyPayload('star'), { addLabelIds: ['STARRED'], removeLabelIds: [] });
  assert.deepEqual(gmailTriageActionToModifyPayload('unstar'), { addLabelIds: [], removeLabelIds: ['STARRED'] });
  assert.throws(() => gmailTriageActionToModifyPayload('trash'), /Unsupported Gmail triage action/);
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
  const tokenStore = createKeychainTokenStore({ keychain } as any);

  await tokenStore.saveTokens('acct_local_gmail', {
    accessToken: 'ya29.access-token',
    refreshToken: '1//refresh-token',
    expiresAt: '2026-05-27T09:00:00Z',
  });

  assert.deepEqual(await tokenStore.loadTokens('acct_local_gmail'), {
    accessToken: 'ya29.access-token',
    refreshToken: '1//refresh-token',
    expiresAt: '2026-05-27T09:00:00Z',
    tokenType: 'Bearer',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
  });
  assert.equal(keychain.entries.size, 1);
  assert.equal([...keychain.entries.keys()][0], 'kept.gmail.oauth:acct_local_gmail');
});

test('token store skips redundant keychain writes when OAuth tokens are unchanged', async () => {
  const baseKeychain = createMemoryKeychain();
  let setCalls = 0;
  const keychain = {
    async setPassword(service, account, secret) {
      setCalls += 1;
      return baseKeychain.setPassword(service, account, secret);
    },
    async getPassword(service, account) {
      return baseKeychain.getPassword(service, account);
    },
    async deletePassword(service, account) {
      return baseKeychain.deletePassword(service, account);
    },
  };
  const tokenStore = createKeychainTokenStore({ keychain } as any);

  const tokens = {
    accessToken: 'ya29.access-token',
    refreshToken: '1//refresh-token',
    expiresAt: '2026-05-27T09:00:00Z',
    tokenType: 'Bearer',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
  };
  await tokenStore.saveTokens('acct_local_gmail', tokens);
  await tokenStore.saveTokens('acct_local_gmail', tokens);

  assert.equal(setCalls, 1);
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

test('Gmail API connector modifies message labels for every supported triage action', async () => {
  const tokenStore = { async loadTokens() { return { accessToken: 'ya29.access-token' }; } };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ id: 'msg-1', labelIds: options.body ? JSON.parse(options.body).addLabelIds || [] : [] });
  };
  const connector = createGmailApiConnector({ tokenStore, fetchImpl, accountId: 'acct_local_gmail' });

  await connector.archiveMessage('msg-1');
  await connector.markMessageRead('msg-1');
  await connector.markMessageUnread('msg-1');
  await connector.starMessage('msg-1');
  await connector.unstarMessage('msg-1');

  assert.deepEqual(calls.map((call) => JSON.parse(call.options.body)), [
    { addLabelIds: [], removeLabelIds: ['INBOX'] },
    { addLabelIds: [], removeLabelIds: ['UNREAD'] },
    { addLabelIds: ['UNREAD'], removeLabelIds: [] },
    { addLabelIds: ['STARRED'], removeLabelIds: [] },
    { addLabelIds: [], removeLabelIds: ['STARRED'] },
  ]);
  assert.ok(calls.every((call) => call.options.method === 'POST'));
  assert.ok(calls.every((call) => call.url.endsWith('/gmail/v1/users/me/messages/msg-1/modify')));
  assert.ok(calls.every((call) => call.options.headers.Authorization === 'Bearer ya29.access-token'));
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

test('Gmail label ids are preserved and normalized into local read/star/archive flags', async () => {
  const unreadStarredArchived = normalizeGmailApiMessage({
    ...gmailApiMessageFixture(),
    labelIds: ['UNREAD', 'STARRED'],
  });
  assert.deepEqual(unreadStarredArchived.labelIds, ['UNREAD', 'STARRED']);
  assert.deepEqual(unreadStarredArchived.flags, { read: false, starred: true, archived: true });

  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    await syncGmailInbox({
      connector: createFakeGmailConnector([unreadStarredArchived]),
      accountId: 'acct_local_gmail',
      repository: repo,
      maxResults: 1,
    } as any);
    const saved = await repo.getMessage('msg-1');
    assert.deepEqual(saved.flags, { read: false, starred: true, archived: true });
    assert.deepEqual(saved.metadata.gmailLabelIds, ['UNREAD', 'STARRED']);
  });
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
      snippet: 'Dinner plan preview',
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
  assert.equal(reopened.accounts.acct_local_gmail.threads[0].snippet, 'Dinner plan preview');
  assert.equal(reopened.accounts.acct_local_gmail.threads[0].body, undefined);
  assert.equal(reopened.accounts.acct_local_gmail.threads[0].textBody, undefined);
  assert.ok(reopened.accounts.acct_local_gmail.threads[0].searchTokens.includes('secret'));
  assert.ok(reopened.accounts.acct_local_gmail.threads[0].searchTokens.includes('body'));
  assert.doesNotMatch(raw, /Secret body/);
  assert.doesNotMatch(raw, /ya29|refresh-token/);
});


test('browser-safe local repository persists Gmail readonly sync without plaintext body or tokens in storage', async () => {
  const storage = createMemoryJsonStorage();
  const repo = await createBrowserLocalMailRepository({
    storage,
    key: 'kept.browser.repo.test',
    cryptoImpl: webcrypto,
  });
  const connector = createFakeGmailConnector([
    {
      id: 'gmail_msg_browser_1',
      threadId: 'gmail_thr_browser_1',
      historyId: 'history-browser-1',
      subject: 'Desktop browser repository sync',
      from: 'Mara Vale <mara@example.com>',
      to: 'you@example.com',
      textBody: 'Browser repository body stays encrypted at rest.',
      snippet: 'Browser repository body stays encrypted at rest.',
      receivedAt: '2026-05-27T09:00:00Z',
    },
  ]);

  await syncGmailInbox({ connector, accountId: 'acct_local_gmail', repository: repo, accountEmail: 'you@example.com' });
  const raw = storage.entries.get('kept.browser.repo.test');
  assert.doesNotMatch(raw, /Browser repository body stays encrypted/);
  assert.doesNotMatch(raw, /ya29|refresh-token|access_token|refresh_token/);

  const reopened = await createBrowserLocalMailRepository({ storage, key: 'kept.browser.repo.test', cryptoImpl: webcrypto });
  assert.equal((await reopened.getMessage('gmail_msg_browser_1')).body, 'Browser repository body stays encrypted at rest.');
  assert.equal((await reopened.getSyncState('acct_local_gmail')).historyId, 'history-browser-1');
});

test('gmail sync writes real messages into the durable local repository and reloads as inbox rows', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    const connector = createFakeGmailConnector([
      {
        id: 'gmail_msg_real_1',
        threadId: 'gmail_thr_real_1',
        historyId: 'history-real-1',
        subject: 'Actual Gmail dinner plan',
        from: 'Mara Vale <mara@example.com>',
        to: 'you@example.com',
        textBody: 'Real readonly Gmail body saved into the local repository.',
        snippet: 'Real readonly Gmail body saved into the local repository.',
        receivedAt: '2026-05-27T09:00:00Z',
      },
    ]);

    const result = await syncGmailInbox({
      connector,
      accountId: 'acct_local_gmail',
      repository: repo,
      accountEmail: 'you@example.com',
      maxResults: 5,
    } as any);
    await repo.close();

    assert.equal(result.status, 'connected');
    assert.equal(result.threads[0].id, 'gmail_thr_real_1');
    assert.equal(result.threads[0].messageIds[0], 'gmail_msg_real_1');

    const reopened = await createLocalMailRepository({ path: storePath });
    assert.equal((await reopened.listAccounts())[0].email, 'you@example.com');
    assert.equal((await reopened.getSyncState('acct_local_gmail')).historyId, 'history-real-1');
    assert.equal((await reopened.getMessage('gmail_msg_real_1')).body, 'Real readonly Gmail body saved into the local repository.');
    assert.equal((await reopened.listThreads({ accountId: 'acct_local_gmail' }))[0].messageIds[0], 'gmail_msg_real_1');
  });
});

test('gmail sync deduplicates duplicate provider message ids inside one account', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    const connector = createFakeGmailConnector([
      { id: 'gmail_dup', threadId: 'thr_old', historyId: 'h1', subject: 'Older duplicate', from: 'A <a@example.com>', to: 'you@example.com', textBody: 'old', receivedAt: '2026-05-27T08:00:00Z' },
      { id: 'gmail_dup', threadId: 'thr_new', historyId: 'h2', subject: 'New duplicate', from: 'A <a@example.com>', to: 'you@example.com', textBody: 'new', receivedAt: '2026-05-27T09:00:00Z' },
    ]);

    await syncGmailInbox({ connector, accountId: 'acct_local_gmail', repository: repo, maxResults: 10 });

    const messages = await repo.listMessages({ accountId: 'acct_local_gmail' });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].providerMessageId, 'gmail_dup');
    assert.equal(messages[0].threadId, 'thr_new');
    assert.equal(messages[0].subject, 'New duplicate');
  });
});

test('gmail sync records connected-empty and preserves existing repository mail after API error', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    await repo.upsertAccount({ id: 'acct_local_gmail', provider: 'gmail', email: 'you@example.com' });
    await repo.upsertMessage({ id: 'existing', accountId: 'acct_local_gmail', threadId: 'existing-thread', providerMessageId: 'existing-provider-id', sender: 'Mara <mara@example.com>', recipients: ['you@example.com'], subject: 'Existing local mail', body: 'keep me', receivedAt: '2026-05-26T09:00:00Z' });

    const empty = await syncGmailInbox({ connector: createFakeGmailConnector([]), accountId: 'acct_local_gmail', repository: repo });
    assert.equal(empty.status, 'connected-empty');
    assert.equal((await repo.getSyncState('acct_local_gmail')).status, 'connected-empty');

    const failingConnector = { provider: 'gmail', async listRecentMessages() { throw new Error('Gmail API request failed with 503 status'); } };
    await assert.rejects(
      () => syncGmailInbox({ connector: failingConnector, accountId: 'acct_local_gmail', repository: repo }),
      /503/,
    );

    assert.equal((await repo.getMessage('existing')).body, 'keep me');
    assert.equal((await repo.getSyncState('acct_local_gmail')).status, 'sync-error');
  });
});

test('local action queue records status transitions and redacts durable action errors', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    await repo.upsertMessage({ id: 'msg-1', accountId: 'acct_local_gmail', threadId: 'thr-1', providerMessageId: 'gmail-msg-1', sender: 'Mara <mara@example.com>', recipients: ['you@example.com'], subject: 'Private action', body: 'secret body text', snippet: 'secret snippet preview', receivedAt: '2026-05-27T09:00:00Z', flags: { read: false, starred: false, archived: false } });

    const queued = await repo.queueTriageAction({ id: 'act-1', accountId: 'acct_local_gmail', messageId: 'msg-1', providerMessageId: 'gmail-msg-1', action: 'archive', desiredFlags: { archived: true }, error: { access_token: 'ya29.secret-token', body: 'secret body text', snippet: 'secret snippet preview', responseBody: 'raw private response' } });
    assert.equal(queued.status, 'queued');
    assert.deepEqual((await repo.getMessage('msg-1')).flags, { read: false, starred: false, archived: true });
    assert.doesNotMatch(JSON.stringify(queued), /secret-token|secret body text|secret snippet preview|raw private response/);

    const syncing = await repo.updateTriageActionStatus('act-1', { status: 'syncing', attemptedAt: '2026-05-27T10:00:00Z' });
    assert.equal(syncing.status, 'syncing');
    const failed = await repo.updateTriageActionStatus('act-1', { status: 'needs-reconnect', error: 'refresh_token 1//secret failed with responseBody private payload' });
    assert.equal(failed.status, 'needs-reconnect');
    assert.doesNotMatch(failed.error, /1\/\/secret|private payload|responseBody/);

    const reopened = await createLocalMailRepository({ path: storePath });
    assert.equal((await reopened.listTriageActions({ status: 'needs-reconnect' })).length, 1);
  });
});

test('browser local action queue persists optimistic triage actions and safe errors', async () => {
  const storage = createMemoryJsonStorage();
  const repo = await createBrowserLocalMailRepository({ storage, key: 'kept.browser.actions.test', cryptoImpl: webcrypto });
  await repo.upsertMessage({ id: 'msg-browser', accountId: 'acct_local_gmail', threadId: 'thr-browser', providerMessageId: 'gmail-browser', sender: 'Mara <mara@example.com>', recipients: ['you@example.com'], subject: 'Browser action', body: 'private browser body', snippet: 'private browser snippet', receivedAt: '2026-05-27T09:00:00Z', flags: { read: true, starred: false, archived: false } });

  await repo.queueTriageAction({ id: 'act-browser', accountId: 'acct_local_gmail', messageId: 'msg-browser', providerMessageId: 'gmail-browser', action: 'star', error: { refresh_token: '1//secret', responseBody: 'private response body' } });
  assert.deepEqual((await repo.getMessage('msg-browser')).flags, { read: true, starred: true, archived: false });

  const raw = storage.entries.get('kept.browser.actions.test');
  assert.doesNotMatch(raw, /1\/\/secret|private response body|private browser body|private browser snippet/);
  const reopened = await createBrowserLocalMailRepository({ storage, key: 'kept.browser.actions.test', cryptoImpl: webcrypto });
  const [action] = await reopened.listTriageActions({ status: 'queued' });
  assert.equal(action.id, 'act-browser');
  assert.doesNotMatch(JSON.stringify(action), /1\/\/secret|private response body/);
});

test('gmail sync reconciliation does not overwrite optimistic flags for unresolved queued actions', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    await repo.upsertMessage({ id: 'msg-1', accountId: 'acct_local_gmail', threadId: 'thr-1', providerMessageId: 'gmail-msg-1', sender: 'Mara <mara@example.com>', recipients: ['you@example.com'], subject: 'Queued archive', body: 'body', receivedAt: '2026-05-27T09:00:00Z', flags: { read: true, starred: false, archived: false } });
    await repo.queueTriageAction({ id: 'act-queued', accountId: 'acct_local_gmail', messageId: 'msg-1', providerMessageId: 'gmail-msg-1', action: 'archive', desiredFlags: { archived: true } });

    await syncGmailInbox({
      connector: createFakeGmailConnector([{ id: 'gmail-msg-1', threadId: 'thr-1', historyId: 'h2', subject: 'Queued archive', from: 'Mara <mara@example.com>', to: 'you@example.com', textBody: 'body from provider', labelIds: ['INBOX'], receivedAt: '2026-05-27T09:30:00Z' }]),
      accountId: 'acct_local_gmail',
      repository: repo,
      maxResults: 1,
    } as any);

    assert.equal((await repo.getMessage('msg-1')).flags.archived, true);
    assert.equal((await repo.getMessage('msg-1')).metadata.historyId, 'h2');
  });
});

test('Gmail API connector refreshes expired access tokens and clears revoked credentials', async () => {
  const savedTokens = [];
  const clearedAccounts = [];
  const tokenStore = {
    async loadTokens() { return { accessToken: 'expired-access', refreshToken: '1//refresh-token', expiresAt: '2026-05-27T08:00:00Z' }; },
    async saveTokens(accountId, tokens) { savedTokens.push({ accountId, tokens }); },
    async clearTokens(accountId) { clearedAccounts.push(accountId); },
  };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'fresh-access', expires_in: 3600, refresh_token: '1//refresh-token' });
    }
    return jsonResponse({}, { ok: false, status: 401 });
  };

  const connector = createGmailApiConnector({ tokenStore, fetchImpl, accountId: 'acct_local_gmail', clientId: 'client-id', clientSecret: 'client-secret', now: () => new Date('2026-05-27T09:00:00Z') });
  await assert.rejects(() => connector.listRecentMessages({ maxResults: 1 }), (error) => {
    assert.equal(error.code, 'GMAIL_AUTH_REVOKED');
    return true;
  });

  assert.equal(savedTokens[0].tokens.accessToken, 'fresh-access');
  assert.equal(calls.find((call) => call.url.includes('/messages?')).options.headers.Authorization, 'Bearer fresh-access');
  assert.deepEqual(clearedAccounts, ['acct_local_gmail']);
});

test('HTML-only Gmail messages fall back to Gmail snippet instead of rendering a blank malformed row', () => {
  const normalized = normalizeGmailApiMessage({
    id: 'html-msg',
    threadId: 'html-thread',
    internalDate: String(Date.UTC(2026, 4, 27, 10, 30, 0)),
    snippet: 'Gmail supplied HTML-only preview',
    payload: {
      mimeType: 'text/html',
      headers: [
        { name: 'Subject', value: 'HTML only' },
        { name: 'From', value: 'Html Sender <html@example.com>' },
      ],
      body: { data: btoa('<p>private html body</p>') },
    },
  });

  assert.equal(normalized.textBody, '');
  assert.equal(normalized.snippet, 'Gmail supplied HTML-only preview');
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
