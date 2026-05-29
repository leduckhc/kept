import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMboxToThreads } from '../src/index.js';

const fixture = `From sender@example.com Tue May 26 10:20:00 2026
From: Real Sender <sender@example.com>
To: Milan <milan@example.com>
Subject: Real Gmail Takeout import
Date: Tue, 26 May 2026 10:20:00 +0000
Message-ID: <real-1@example.com>

This is a real exported message body from a local mbox file.
It should stay on this device.

From second@example.com Mon May 25 09:00:00 2026
From: second@example.com
Subject: Follow up from takeout
Date: Mon, 25 May 2026 09:00:00 +0000
Message-ID: <real-2@example.com>

Second message body with useful inbox preview text.
`;

test('parseMboxToThreads converts local Gmail Takeout mbox into inbox threads', () => {
  const threads = parseMboxToThreads(fixture, { accountId: 'acct_local_import' });

  assert.equal(threads.length, 2);
  assert.equal(threads[0].accountId, 'acct_local_import');
  assert.equal(threads[0].sender, 'Real Sender');
  assert.equal(threads[0].senderEmail, 'sender@example.com');
  assert.equal(threads[0].subject, 'Real Gmail Takeout import');
  assert.match(threads[0].snippet, /real exported message body/);
  assert.equal(threads[0].receivedAt, '2026-05-26T10:20:00.000Z');
  assert.equal(threads[0].isSynthetic, false);
  assert.equal(threads[1].sender, 'second@example.com');
});

test('parseMboxToThreads returns an empty list for empty or headerless input', () => {
  assert.deepEqual(parseMboxToThreads('', { accountId: 'acct_local_import' }), []);
  assert.deepEqual(parseMboxToThreads('not an mbox', { accountId: 'acct_local_import' }), []);
});
