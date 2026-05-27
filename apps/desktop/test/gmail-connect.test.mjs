import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineInboxThreads,
  filterInboxThreads,
  getInboxSearchState,
  getSyncedGmailThreads,
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

test('getInboxSearchState exposes user-facing search states', () => {
  assert.equal(getInboxSearchState({ totalCount: 0 }).status, 'disabled');
  assert.equal(getInboxSearchState({ totalCount: 2, indexing: true }).status, 'indexing');
  assert.equal(getInboxSearchState({ totalCount: 2, visibleCount: 2 }).status, 'ready');
  assert.equal(getInboxSearchState({ totalCount: 2, stale: true }).status, 'stale');
  assert.equal(getInboxSearchState({ totalCount: 2, query: 'missing', visibleCount: 0 }).status, 'no-results');
  assert.equal(getInboxSearchState({ totalCount: 2, errorMessage: 'Could not search local mail.' }).status, 'error');
});
