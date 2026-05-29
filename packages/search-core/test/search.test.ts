import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchRows, createInMemorySearchIndex, encryptionDecision, normalizeSearchTerms, sqliteSchema } from '../src/index.js';

test('search ranks matching local threads', () => {
  const index = createInMemorySearchIndex();
  index.addThread({ id: 'a', subject: 'Invoice next week', sender: 'a', recipients: ['you@kept.local'], body: 'contract invoice next week', receivedAt: '2026-05-25T00:00:00Z' });
  index.addThread({ id: 'b', subject: 'Dinner', sender: 'b', recipients: ['you@kept.local'], body: 'restaurant list', receivedAt: '2026-05-24T00:00:00Z' });
  const [first] = index.search('invoice next week');
  assert.equal(first.subject, 'Invoice next week');
  assert.equal(first.score, 3);
});

test('empty query returns no local results', () => {
  const index = createInMemorySearchIndex();
  index.addThread({ id: 'a', subject: 'Invoice', sender: 'a', body: 'body' });
  assert.deepEqual(index.search('   '), []);
});

test('search is case-insensitive and includes sender email, snippet, unicode, and trimmed query punctuation', () => {
  const index = createInMemorySearchIndex();
  index.addThread({ id: 'a', subject: 'Crème brûlée receipt', sender: 'José Bento', senderEmail: 'jose@example.com', snippet: 'Café torch notes', recipients: ['you@kept.local'], body: 'Dessert invoice body', receivedAt: '2026-05-25T00:00:00Z' });

  assert.equal(index.search('JOSÉ')[0].id, 'a');
  assert.equal(index.search('jose@example.com')[0].id, 'a');
  assert.equal(index.search('café')[0].id, 'a');
  assert.equal(index.search('invoice?')[0].id, 'a');
  assert.deepEqual(normalizeSearchTerms('  (invoice?) café!  '), ['invoice', 'café']);
});

test('schema includes local email storage and FTS5 tables', () => {
  for (const name of ['accounts', 'threads', 'messages', 'attachment_metadata', 'messages_fts']) {
    assert.match(sqliteSchema, new RegExp(name));
  }
  assert.match(sqliteSchema, /fts5/i);
});

test('buildSearchRows keeps ciphertext placeholder separate from preview index', () => {
  const rows = buildSearchRows({ id: 'thr1', subject: 'Subject', sender: 'sender@example.com', recipients: ['you@example.com'], body: 'private message body' });
  assert.equal(rows.message.body_ciphertext, '[encrypted-body-placeholder]');
  assert.equal(rows.fts.body_preview, 'private message body');
});

test('encryption decision records SQLCipher preference and fallback', () => {
  assert.match(encryptionDecision.choice, /SQLCipher/);
  assert.match(encryptionDecision.choice, /fallback/);
});
