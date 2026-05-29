import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INBOX_SECTIONS_KEY,
  loadInboxSectionsState,
  saveInboxSectionsState,
} from '../src/inbox-sections-state.js';

// Minimal synchronous storage stub
function makeStorage(initial: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    length: 0,
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (index: number) => Object.keys(store)[index] ?? null,
  } as unknown as Storage;
}

test('loadInboxSectionsState defaults both sections to collapsed when storage is empty', () => {
  const storage = makeStorage();
  const state = loadInboxSectionsState(storage);
  assert.deepEqual(state, { newsletters: true, updates: true });
});

test('loadInboxSectionsState defaults both sections to collapsed when no storage provided', () => {
  const state = loadInboxSectionsState(null);
  assert.deepEqual(state, { newsletters: true, updates: true });
});

test('loadInboxSectionsState restores persisted collapsed state', () => {
  const storage = makeStorage({
    [INBOX_SECTIONS_KEY]: JSON.stringify({ newsletters: false, updates: true }),
  });
  const state = loadInboxSectionsState(storage);
  assert.deepEqual(state, { newsletters: false, updates: true });
});

test('loadInboxSectionsState treats explicit false as expanded', () => {
  const storage = makeStorage({
    [INBOX_SECTIONS_KEY]: JSON.stringify({ newsletters: false, updates: false }),
  });
  const state = loadInboxSectionsState(storage);
  assert.deepEqual(state, { newsletters: false, updates: false });
});

test('loadInboxSectionsState defaults missing keys to collapsed', () => {
  const storage = makeStorage({
    [INBOX_SECTIONS_KEY]: JSON.stringify({ newsletters: false }),
  });
  const state = loadInboxSectionsState(storage);
  assert.equal(state.updates, true, 'missing updates key defaults to collapsed');
});

test('saveInboxSectionsState writes state to storage', () => {
  const storage = makeStorage();
  saveInboxSectionsState({ newsletters: false, updates: true }, storage);
  const raw = storage.getItem(INBOX_SECTIONS_KEY);
  assert.ok(raw, 'value was written');
  assert.deepEqual(JSON.parse(raw), { newsletters: false, updates: true });
});

test('loadInboxSectionsState round-trips through saveInboxSectionsState', () => {
  const storage = makeStorage();
  saveInboxSectionsState({ newsletters: false, updates: false }, storage);
  const state = loadInboxSectionsState(storage);
  assert.deepEqual(state, { newsletters: false, updates: false });
});

test('loadInboxSectionsState handles corrupt storage gracefully', () => {
  const storage = makeStorage({ [INBOX_SECTIONS_KEY]: 'not valid json' });
  const state = loadInboxSectionsState(storage);
  assert.deepEqual(state, { newsletters: true, updates: true });
});

test('saveInboxSectionsState silently ignores storage errors', () => {
  const brokenStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
  };
  // Should not throw
  assert.doesNotThrow(() => saveInboxSectionsState({ newsletters: true, updates: true }, brokenStorage));
});
