import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createJsonMailStore,
  createMemoryJsonStorage,
} from '../../../packages/mail-core/src/index.js';
import {
  combineInboxThreads,
  filterInboxThreads,
  getGmailSyncStatus,
  getInboxSearchState,
  getSyncedGmailThreads,
  repositoryMessagesToInboxThreads,
} from '../src/gmail-connect.js';

const gmailThread = {
  id: 'gmail-thread',
  providerMessageId: 'gmail-message-1',
  sender: 'Mara Vale',
  senderEmail: 'mara@example.com',
  subject: 'Gmail alpha sync',
  snippet: 'Local readonly Gmail message',
  recipients: ['you@example.com'],
  receivedAt: '2026-05-27T09:00:00Z',
};

const localThread = {
  id: 'local-thread',
  sender: 'Local Import',
  senderEmail: 'local@example.com',
  subject: 'Takeout fallback',
  snippet: 'Imported mbox message',
  recipients: ['you@example.com'],
  receivedAt: '2026-05-26T09:00:00Z',
};

test('getSyncedGmailThreads loads Gmail account threads newest first', () => {
  const syncState = {
    version: 1,
    accounts: {
      acct_local_gmail: {
        provider: 'gmail',
        threads: [
          { ...gmailThread, id: 'older', receivedAt: '2026-05-25T09:00:00Z' },
          gmailThread,
        ],
      },
    },
  };

  const threads = getSyncedGmailThreads(syncState);

  assert.deepEqual(threads.map((thread) => thread.id), ['gmail-thread', 'older']);
  assert.ok(threads.every((thread) => thread.source === 'gmail'));
});


test('getGmailSyncStatus exposes the canonical Gmail connection states', () => {
  assert.equal(getGmailSyncStatus(null), 'never-connected');
  assert.equal(getGmailSyncStatus({ accounts: { acct_local_gmail: { provider: 'gmail', threads: [] } } }), 'connected-empty');
  assert.equal(getGmailSyncStatus({ accounts: { acct_local_gmail: { provider: 'gmail', status: 'sync-error', threads: [gmailThread] } } }), 'sync-error');
  assert.equal(getGmailSyncStatus({ accounts: { acct_local_gmail: { provider: 'gmail', status: 'auth-revoked', threads: [] } } }), 'auth-revoked');
});

test('combineInboxThreads keeps real synced Gmail rows before local import rows and dedupes', () => {
  const rows = combineInboxThreads([gmailThread], [{ ...localThread, providerMessageId: 'gmail-message-1' }, localThread]);

  assert.deepEqual(rows.map((thread) => thread.id), ['gmail-thread', 'local-thread']);
});

test('filterInboxThreads searches synced local inbox fields without remote calls', () => {
  const rows = [gmailThread, localThread, { ...localThread, id: 'unicode-thread', sender: 'José Bento', senderEmail: 'jose@example.com', subject: 'Crème brûlée', snippet: 'Café receipt', body: 'Torch invoice body' }];

  assert.deepEqual(filterInboxThreads(rows, 'mara alpha').map((thread) => thread.id), ['gmail-thread']);
  assert.deepEqual(filterInboxThreads(rows, 'takeout').map((thread) => thread.id), ['local-thread']);
  assert.deepEqual(filterInboxThreads(rows, 'jose@example.com café').map((thread) => thread.id), ['unicode-thread']);
  assert.deepEqual(filterInboxThreads(rows, 'invoice?').map((thread) => thread.id), ['unicode-thread']);
  assert.deepEqual(filterInboxThreads(rows, '').map((thread) => thread.id), ['gmail-thread', 'local-thread', 'unicode-thread']);
});

test('filterInboxThreads searches sender, email, subject, snippet, and body after persisted reload', async () => {
  const storage = createMemoryJsonStorage();
  const store = createJsonMailStore({ storage });
  await store.saveSyncResult({
    accountId: 'acct_local_gmail',
    provider: 'gmail',
    cursor: { provider: 'gmail', historyId: 'history-search' },
    threads: [{
      ...gmailThread,
      sender: 'Reload Sender',
      senderEmail: 'reload@example.com',
      subject: 'Persisted subject phrase',
      snippet: 'Durable snippet phrase',
      body: 'Body-only ledger keyword',
      textBody: 'Text body reimbursement keyword',
    }],
  });

  const reopened = await createJsonMailStore({ storage }).loadSyncState();
  const threads = getSyncedGmailThreads(reopened);

  assert.equal(threads[0].body, undefined);
  assert.equal(threads[0].textBody, undefined);
  assert.equal(threads[0].snippet, 'Durable snippet phrase');
  assert.deepEqual(filterInboxThreads(threads, 'Reload Sender').map((thread) => thread.id), ['gmail-thread']);
  assert.deepEqual(filterInboxThreads(threads, 'reload@example.com').map((thread) => thread.id), ['gmail-thread']);
  assert.deepEqual(filterInboxThreads(threads, 'persisted subject').map((thread) => thread.id), ['gmail-thread']);
  assert.deepEqual(filterInboxThreads(threads, 'durable snippet').map((thread) => thread.id), ['gmail-thread']);
  assert.deepEqual(filterInboxThreads(threads, 'ledger reimbursement').map((thread) => thread.id), ['gmail-thread']);
});

test('getInboxSearchState exposes user-facing search states', () => {
  assert.equal(getInboxSearchState({ totalCount: 0 }).status, 'disabled');
  assert.equal(getInboxSearchState({ totalCount: 2, indexing: true }).status, 'indexing');
  assert.equal(getInboxSearchState({ totalCount: 2, visibleCount: 2 }).status, 'ready');
  assert.equal(getInboxSearchState({ totalCount: 2, stale: true }).status, 'stale');
  assert.equal(getInboxSearchState({ totalCount: 2, query: 'missing', visibleCount: 0 }).status, 'no-results');
  assert.equal(getInboxSearchState({ totalCount: 2, errorMessage: 'Could not search local mail.' }).status, 'error');
  assert.equal(getInboxSearchState({ enabled: false, indexing: true, totalCount: 0 }).status, 'indexing');
  assert.equal(getInboxSearchState({ enabled: false, errorMessage: 'Could not search local mail.', totalCount: 0 }).status, 'error');
  assert.equal(getInboxSearchState({ enabled: false, stale: true, totalCount: 0 }).status, 'stale');
});

test('repositoryMessagesToInboxThreads lets desktop render repository-backed Gmail sync rows without body leakage', () => {
  const rows = repositoryMessagesToInboxThreads([
    {
      id: 'gmail-message-1',
      threadId: 'gmail-thread',
      providerMessageId: 'gmail-message-1',
      providerThreadId: 'gmail-thread-provider',
      accountId: 'acct_local_gmail',
      sender: { name: 'Mara Vale', email: 'mara@example.com' },
      recipients: [{ email: 'you@example.com' }],
      subject: 'Repository-backed Gmail',
      body: 'Body should remain behind the repository boundary',
      snippet: 'Repository-backed preview',
      receivedAt: '2026-05-27T09:00:00Z',
      flags: { read: false, starred: true, archived: false },
    },
  ]);

  assert.deepEqual(rows, [{
    id: 'gmail-thread',
    localMessageId: 'gmail-message-1',
    providerMessageId: 'gmail-message-1',
    providerThreadId: 'gmail-thread-provider',
    accountId: 'acct_local_gmail',
    sender: 'Mara Vale',
    senderEmail: 'mara@example.com',
    subject: 'Repository-backed Gmail',
    snippet: 'Repository-backed preview',
    recipients: ['you@example.com'],
    receivedAt: '2026-05-27T09:00:00Z',
    flags: { read: false, starred: true, archived: false },
    isPriority: true,
    isUnread: true,
    isStarred: true,
    isArchived: false,
    isNewSender: false,
    source: 'gmail',
  }]);
  assert.equal(JSON.stringify(rows).includes('Body should remain'), false);
});

test('desktop Gmail sync passes the durable repository into syncGmailInbox', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(source, /createBrowserLocalMailRepository\(/);
  assert.match(source, /syncGmailInbox\(\{[^}]*repository[^}]*mailStore[^}]*maxResults: 25/s);
  assert.match(source, /from '\.\/triage-actions\.js'/);
  assert.match(source, /filterArchivedInboxThreads\(/);
  assert.match(source, /createTriageActionController\(/);
  assert.match(source, /data-triage-intent/);
  assert.match(source, /statusCopyForTriage\(/);
  assert.match(source, /retryQueuedTriageActions\(repository, connector\)/);
  assert.match(source, /retryQueuedActions\(\)/);
});
