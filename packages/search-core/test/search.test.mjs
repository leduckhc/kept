import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemorySearchIndex } from '../src/index.js';

test('search ranks matching local threads', () => {
  const index = createInMemorySearchIndex();
  index.addThread({ subject: 'Invoice next week', sender: 'a', body: 'contract invoice next week' });
  index.addThread({ subject: 'Dinner', sender: 'b', body: 'restaurant list' });
  const [first] = index.search('invoice next week');
  assert.equal(first.subject, 'Invoice next week');
  assert.equal(first.score, 3);
});
