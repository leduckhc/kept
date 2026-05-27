import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  canonicalMailStateMatrix,
  createLocalMailRepository,
  createRepositoryCorruptionError,
  normalizeLocalAccount,
  normalizeLocalMessage,
} from '../src/index.js';

async function withTempRepo(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'kept-local-mail-repo-'));
  try {
    return await fn(join(dir, 'mail-store.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('durable local mail repository persists account, thread, message body, attachments, flags, sync state, and AI audit after restart', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    await repo.upsertAccount({ id: 'acct_gmail', provider: 'gmail', email: 'milan@example.com' });
    await repo.saveSyncState('acct_gmail', { provider: 'gmail', historyId: 'hist-1', syncedAt: '2026-05-27T12:00:00Z' });
    await repo.upsertThread({ id: 'thr_1', accountId: 'acct_gmail', subject: 'Dinner contract', updatedAt: '2026-05-27T12:00:00Z' });
    await repo.upsertMessage({
      id: 'msg_1',
      accountId: 'acct_gmail',
      threadId: 'thr_1',
      providerMessageId: 'gmail-msg-1',
      sender: { name: 'Mara Vale', email: 'mara@example.com' },
      recipients: [{ name: 'Milan', email: 'milan@example.com' }],
      subject: 'Dinner contract',
      body: 'Private body must survive restart for local reader.',
      snippet: 'Private body must survive restart',
      receivedAt: '2026-05-27T11:59:00Z',
      attachments: [{ id: 'att_1', filename: 'menu.pdf', mimeType: 'application/pdf', byteSize: 42 }],
      flags: { read: false, starred: true, archived: false },
    });
    await repo.recordAiAudit({ id: 'audit_1', threadId: 'thr_1', provider: 'ollama', purpose: 'summary', approved: false, contentDescription: 'selected thread excerpt' });
    await repo.close();

    const rawStore = await readFile(storePath, 'utf8');
    assert.doesNotMatch(rawStore, /Private body must survive restart|Private body must survive restart for local reader/);
    assert.match(rawStore, /bodyCiphertext|snippetCiphertext/);

    const reopened = await createLocalMailRepository({ path: storePath });
    const message = await reopened.getMessage('msg_1');

    assert.equal((await reopened.listAccounts())[0].email, 'milan@example.com');
    assert.equal((await reopened.getSyncState('acct_gmail')).historyId, 'hist-1');
    assert.equal(message.body, 'Private body must survive restart for local reader.');
    assert.equal(message.attachments[0].filename, 'menu.pdf');
    assert.deepEqual(message.flags, { read: false, starred: true, archived: false });
    assert.equal((await reopened.listAiAuditEntries({ threadId: 'thr_1' }))[0].requiresExplicitApproval, true);
  });
});

test('duplicate provider message ids are idempotent per account and do not create duplicate messages', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    await repo.upsertAccount({ id: 'acct_gmail', provider: 'gmail', email: 'owner@example.com' });
    await repo.upsertThread({ id: 'thr_1', accountId: 'acct_gmail', subject: 'First subject', updatedAt: '2026-05-27T10:00:00Z' });
    await repo.upsertThread({ id: 'thr_2', accountId: 'acct_gmail', subject: 'Moved subject', updatedAt: '2026-05-27T10:00:30Z' });
    await repo.upsertMessage({ id: 'msg_a', accountId: 'acct_gmail', threadId: 'thr_1', providerMessageId: 'provider-123', sender: 'a@example.com', recipients: ['owner@example.com'], subject: 'First subject', body: 'old body', receivedAt: '2026-05-27T10:00:00Z' });
    await repo.upsertMessage({ id: 'msg_b', accountId: 'acct_gmail', threadId: 'thr_2', providerMessageId: 'provider-123', sender: 'a@example.com', recipients: ['owner@example.com'], subject: 'Updated subject', body: 'new body', receivedAt: '2026-05-27T10:01:00Z' });

    const messages = await repo.listMessages({ accountId: 'acct_gmail' });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, 'msg_a');
    assert.equal(messages[0].threadId, 'thr_2');
    assert.equal(messages[0].subject, 'Updated subject');
    assert.equal(messages[0].body, 'new body');
    assert.deepEqual((await repo.getThread('thr_1')).messageIds, []);
    assert.deepEqual((await repo.getThread('thr_2')).messageIds, ['msg_a']);
  });
});

test('search index can be rebuilt from the durable store and queries message body after reload', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    await repo.upsertAccount({ id: 'acct', provider: 'local', email: 'you@example.com' });
    await repo.upsertThread({ id: 'thr_invoice', accountId: 'acct', subject: 'Invoice', updatedAt: '2026-05-27T10:00:00Z' });
    await repo.upsertMessage({ id: 'msg_invoice', accountId: 'acct', threadId: 'thr_invoice', providerMessageId: 'local-1', sender: 'bookkeeper@example.com', recipients: ['you@example.com'], subject: 'Invoice', body: 'The private catering invoice arrives next week.', receivedAt: '2026-05-27T10:00:00Z' });
    await repo.close();

    const reopened = await createLocalMailRepository({ path: storePath });
    const rebuilt = await reopened.rebuildSearchIndex();
    const results = await rebuilt.search('catering invoice');

    assert.equal(results[0].messageId, 'msg_invoice');
    assert.equal(results[0].threadId, 'thr_invoice');
    assert.equal(results[0].score, 2);
  });
});

test('repository file never stores tokens or API keys and redacts sensitive corrupt-store errors', async () => {
  await withTempRepo(async (storePath) => {
    const repo = await createLocalMailRepository({ path: storePath });
    await repo.upsertAccount({ id: 'acct', provider: 'gmail', email: 'owner@example.com', accessToken: 'ya29.must-not-store', apiKey: 'super-secret-api-key' });
    await repo.saveSyncState('acct', { provider: 'gmail', historyId: 'hist-ok', accessToken: 'ya29.must-not-store-either', refreshToken: '1//refresh-secret' });
    const raw = await readFile(storePath, 'utf8');

    assert.doesNotMatch(raw, /ya29|refresh-secret|super-secret-api-key|accessToken|apiKey|refreshToken/);

    await writeFile(storePath, '{"accounts":{"acct":{"email":"owner@example.com","accessToken":"ya29.secret"}},');
    await assert.rejects(
      () => createLocalMailRepository({ path: storePath }),
      (error) => {
        assert.equal(error.code, 'KEPT_LOCAL_STORE_CORRUPT');
        assert.doesNotMatch(error.message, /owner@example.com|ya29\.secret/);
        assert.match(error.message, /local mail store is corrupt/i);
        return true;
      },
    );
  });
});

test('normalized state contract exposes stable local shapes and canonical cross-system state matrix', () => {
  const account = normalizeLocalAccount({ id: 'acct', provider: 'gmail', email: 'you@example.com', accessToken: 'secret' });
  const message = normalizeLocalMessage({ id: 'msg', accountId: 'acct', threadId: 'thr', providerMessageId: 'provider-msg', sender: 'Mara <mara@example.com>', recipients: ['you@example.com'], subject: 'Hello', body: 'Body', receivedAt: '2026-05-27T10:00:00Z' });

  assert.deepEqual(Object.keys(account), ['id', 'provider', 'email', 'displayName', 'createdAt', 'updatedAt']);
  assert.deepEqual(Object.keys(message), ['id', 'accountId', 'threadId', 'providerMessageId', 'sender', 'recipients', 'subject', 'snippet', 'body', 'receivedAt', 'attachments', 'flags', 'metadata']);
  assert.equal(account.accessToken, undefined);
  assert.equal(message.sender.email, 'mara@example.com');
  assert.deepEqual(canonicalMailStateMatrix.map((row) => row.system), ['gmail', 'localStore', 'search', 'reader', 'ai']);
  assert.ok(canonicalMailStateMatrix.every((row) => row.sourceOfTruth && row.staleDataBehavior && row.tokenPolicy));
  const corruptionError = createRepositoryCorruptionError('broken ya29.secret owner@example.com');
  assert.equal(corruptionError.code, 'KEPT_LOCAL_STORE_CORRUPT');
  assert.doesNotMatch(corruptionError.message, /ya29\.secret|owner@example.com/);
});
