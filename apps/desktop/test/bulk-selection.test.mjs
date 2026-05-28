import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleThreadSelection,
  selectSection,
  clearSelection,
  getBulkDominantReadState,
  getSectionCheckboxState,
} from '../src/bulk-selection.js';

// ── toggleThreadSelection ────────────────────────────────────────────────────

test('toggleThreadSelection adds a thread that is not yet selected', () => {
  const before = new Set(['a', 'b']);
  const after = toggleThreadSelection(before, 'c');
  assert.ok(after.has('c'), 'c should be added');
  assert.equal(after.size, 3);
});

test('toggleThreadSelection removes a thread that is already selected', () => {
  const before = new Set(['a', 'b', 'c']);
  const after = toggleThreadSelection(before, 'b');
  assert.ok(!after.has('b'), 'b should be removed');
  assert.equal(after.size, 2);
});

test('toggleThreadSelection does not mutate the original Set', () => {
  const before = new Set(['a']);
  const after = toggleThreadSelection(before, 'b');
  assert.equal(before.size, 1, 'original should be unchanged');
  assert.equal(after.size, 2);
});

// ── selectSection ────────────────────────────────────────────────────────────

test('selectSection selects all threads when none are selected', () => {
  const selected = new Set();
  const after = selectSection(selected, ['t1', 't2', 't3']);
  assert.deepEqual([...after].sort(), ['t1', 't2', 't3']);
});

test('selectSection deselects all threads in section when all are selected', () => {
  const selected = new Set(['t1', 't2', 't3', 'other']);
  const after = selectSection(selected, ['t1', 't2', 't3']);
  assert.ok(!after.has('t1'));
  assert.ok(!after.has('t2'));
  assert.ok(!after.has('t3'));
  // threads outside the section are untouched
  assert.ok(after.has('other'));
});

test('selectSection selects remaining threads when only some are selected', () => {
  const selected = new Set(['t1']);
  const after = selectSection(selected, ['t1', 't2', 't3']);
  assert.ok(after.has('t1'));
  assert.ok(after.has('t2'));
  assert.ok(after.has('t3'));
});

// ── clearSelection ───────────────────────────────────────────────────────────

test('clearSelection returns an empty Set', () => {
  const before = new Set(['a', 'b', 'c']);
  const after = clearSelection(before);
  assert.equal(after.size, 0);
});

// ── getBulkDominantReadState ─────────────────────────────────────────────────

test('getBulkDominantReadState returns unread when majority are unread', () => {
  const threads = [
    { id: 't1', flags: { read: false } },
    { id: 't2', flags: { read: false } },
    { id: 't3', flags: { read: true } },
  ];
  const result = getBulkDominantReadState(threads, new Set(['t1', 't2', 't3']));
  assert.equal(result, 'unread');
});

test('getBulkDominantReadState returns read when majority are read', () => {
  const threads = [
    { id: 't1', flags: { read: true } },
    { id: 't2', flags: { read: true } },
    { id: 't3', flags: { read: false } },
  ];
  const result = getBulkDominantReadState(threads, new Set(['t1', 't2', 't3']));
  assert.equal(result, 'read');
});

test('getBulkDominantReadState falls back to unread when selection is empty', () => {
  const result = getBulkDominantReadState([], new Set());
  assert.equal(result, 'unread');
});

test('getBulkDominantReadState uses isUnread when flags.read is absent', () => {
  const threads = [
    { id: 't1', isUnread: true },
    { id: 't2', isUnread: true },
  ];
  const result = getBulkDominantReadState(threads, new Set(['t1', 't2']));
  assert.equal(result, 'unread');
});

// ── getSectionCheckboxState ──────────────────────────────────────────────────

test('getSectionCheckboxState returns none when no threads are selected', () => {
  const state = getSectionCheckboxState(['t1', 't2', 't3'], new Set());
  assert.equal(state, 'none');
});

test('getSectionCheckboxState returns all when all threads are selected', () => {
  const state = getSectionCheckboxState(['t1', 't2'], new Set(['t1', 't2', 'other']));
  assert.equal(state, 'all');
});

test('getSectionCheckboxState returns indeterminate when some threads are selected', () => {
  const state = getSectionCheckboxState(['t1', 't2', 't3'], new Set(['t1']));
  assert.equal(state, 'indeterminate');
});

test('getSectionCheckboxState returns none for empty section', () => {
  const state = getSectionCheckboxState([], new Set(['t1']));
  assert.equal(state, 'none');
});
