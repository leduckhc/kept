import test from 'node:test';
import assert from 'node:assert/strict';
import { redactForLogs } from '../src/index.js';

test('redacts email addresses before logs', () => {
  assert.equal(redactForLogs('hello milan@example.com'), 'hello [email-redacted]');
});
