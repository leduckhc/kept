import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createInMemorySearchIndex,
  createKeptSearchStore,
  createLocalEncryptionKey,
  getDefaultKeptDatabasePath,
  seedSampleEmails,
} from '../src/index.js';

const key = createLocalEncryptionKey('test passphrase');

async function withTempStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'kept-search-'));
  const dbPath = join(dir, 'kept.sqlite');
  const store = createKeptSearchStore({ databasePath: dbPath, encryptionKey: key });
  try {
    await fn(store, dbPath);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test('legacy in-memory search ranks matching local threads', () => {
  const index = createInMemorySearchIndex();
  index.addThread({ subject: 'Invoice next week', sender: 'a', body: 'contract invoice next week' });
  index.addThread({ subject: 'Dinner', sender: 'b', body: 'restaurant list' });
  const [first] = index.search('invoice next week');
  assert.equal(first.subject, 'Invoice next week');
  assert.equal(first.score, 3);
});

test('store inserts accounts, threads, messages, attachment metadata, and searches FTS locally', async () => {
  await withTempStore((store) => {
    const accountId = store.insertAccount({ email: 'keeper@example.test', displayName: 'Keeper' });
    const threadId = store.insertThread({ accountId, externalId: 'thread-1', subject: 'Quarterly invoice' });
    const messageId = store.insertMessage({
      accountId,
      threadId,
      externalId: 'message-1',
      sentAt: '2026-05-26T09:00:00.000Z',
      sender: 'billing@example.test',
      recipients: ['keeper@example.test', 'ops@example.test'],
      subject: 'Quarterly invoice',
      body: 'The renewal invoice and contract are attached for local review.',
    });
    store.insertAttachment({
      messageId,
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      byteSize: 42_000,
      contentId: 'cid-invoice',
    });

    const [result] = store.searchMessages('renewal invoice');

    assert.equal(result.messageId, messageId);
    assert.equal(result.threadId, threadId);
    assert.equal(result.accountEmail, 'keeper@example.test');
    assert.equal(result.subject, 'Quarterly invoice');
    assert.equal(result.sender, 'billing@example.test');
    assert.deepEqual(result.recipients, ['keeper@example.test', 'ops@example.test']);
    assert.match(result.snippet, /renewal invoice/);
    assert.equal(result.attachments.length, 1);
    assert.equal(result.attachments[0].filename, 'invoice.pdf');
  });
});

test('message subject and body are encrypted at rest while FTS can search local derived text', async () => {
  await withTempStore(async (store, dbPath) => {
    const accountId = store.insertAccount({ email: 'private@example.test', displayName: 'Private' });
    const threadId = store.insertThread({ accountId, externalId: 'thread-secret', subject: 'Vault topic' });
    store.insertMessage({
      accountId,
      threadId,
      externalId: 'message-secret',
      sentAt: '2026-05-26T10:00:00.000Z',
      sender: 'sender@example.test',
      recipients: ['private@example.test'],
      subject: 'Pip secret phrase',
      body: 'owl keeps this sensitive body searchable only on device',
    });

    const dbBytes = await readFile(dbPath);
    assert.equal(dbBytes.includes(Buffer.from('Pip secret phrase')), false);
    assert.equal(dbBytes.includes(Buffer.from('sensitive body')), false);
    assert.equal(store.searchMessages('sensitive body').length, 1);
  });
});

test('search returns empty results when no seeded message matches', async () => {
  await withTempStore((store) => {
    seedSampleEmails(store);
    assert.deepEqual(store.searchMessages('nonexistent armadillo'), []);
  });
});

test('seeded messages can be searched without network dependencies', async () => {
  await withTempStore((store) => {
    seedSampleEmails(store);
    const results = store.searchMessages('boarding pass');
    assert.equal(results.length, 1);
    assert.equal(results[0].subject, 'Boarding pass for Portland');
  });
});

test('default DB path is explicit and local to user data', () => {
  assert.match(getDefaultKeptDatabasePath('linux'), /\.local\/share\/Kept\/kept\.sqlite$/);
  assert.match(getDefaultKeptDatabasePath('darwin'), /Library\/Application Support\/Kept\/kept\.sqlite$/);
  assert.match(getDefaultKeptDatabasePath('win32'), /AppData\\Roaming\\Kept\\kept\.sqlite$/);
});
