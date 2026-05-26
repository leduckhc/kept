#!/usr/bin/env node
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createKeptSearchStore,
  createLocalEncryptionKey,
  seedSampleEmails,
} from '../src/index.js';

const query = process.argv.slice(2).join(' ') || 'boarding pass';
const dir = await mkdtemp(join(tmpdir(), 'kept-search-demo-'));
const databasePath = join(dir, 'kept.sqlite');
const encryptionKey = createLocalEncryptionKey('local demo key - do not use in production');
const store = createKeptSearchStore({ databasePath, encryptionKey });

try {
  seedSampleEmails(store);
  const results = store.searchMessages(query);
  console.log(JSON.stringify({ databasePath, query, results }, null, 2));
} finally {
  store.close();
}
