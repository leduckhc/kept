/**
 * Unit tests for getActionsForView — verifies each view returns
 * the correct set of action IDs in the correct order.
 */
import { describe, test, expect } from 'vitest';

// We can't import the real module (depends on solid store/icons), so we test the mapping logic.
// Approach: snapshot the expected action IDs per view, then import and verify.

// Mock solid-js reactive primitives
import { vi } from 'vitest';
vi.mock('solid-js', () => ({
  createSignal: (v: any) => [() => v, () => {}],
  createMemo: (fn: any) => fn,
  createEffect: () => {},
  onCleanup: () => {},
  onMount: () => {},
}));

// Mock the store module
vi.mock('../../src/solid/store', () => ({
  appState: { selectedThreadId: 't01', threads: [{ id: 't01', isStarred: false, isUnread: true }] },
}));

// Mock icons to return the icon name as-is
vi.mock('../../src/icons', () => ({
  icon: new Proxy({}, {
    get: (_target, prop) => () => `<svg data-icon="${String(prop)}" />`,
  }),
}));

// Mock actions to be no-ops
vi.mock('../../src/solid/actions', () => ({
  doArchive: vi.fn(),
  doTrash: vi.fn(),
  doToggleStar: vi.fn(),
  doMarkRead: vi.fn(),
  doMarkUnread: vi.fn(),
  doSetAside: vi.fn(),
  doUnsetAside: vi.fn(),
  doUnsnooze: vi.fn(),
  doRestoreToInbox: vi.fn(),
  doDeletePermanently: vi.fn(),
  doMoveToInbox: vi.fn(),
}));

import { getActionsForView } from '../../src/solid/viewActions';

describe('getActionsForView', () => {
  test('Inbox returns archive, trash, star, snooze, set-aside, mark-read-unread', () => {
    const ids = getActionsForView('Inbox').map(a => a.id);
    expect(ids).toEqual(['archive', 'trash', 'star', 'snooze', 'set-aside', 'mark-read-unread']);
  });

  test('Trash returns restore + delete-permanently only', () => {
    const ids = getActionsForView('Trash').map(a => a.id);
    expect(ids).toEqual(['restore', 'delete-permanently']);
  });

  test('Archive returns move-to-inbox, trash, star, snooze', () => {
    const ids = getActionsForView('Archive').map(a => a.id);
    expect(ids).toEqual(['move-to-inbox', 'trash', 'star', 'snooze']);
  });

  test('Starred returns unstar, archive, trash, snooze, set-aside, mark-read-unread', () => {
    const ids = getActionsForView('Starred').map(a => a.id);
    expect(ids).toEqual(['unstar', 'archive', 'trash', 'snooze', 'set-aside', 'mark-read-unread']);
  });

  test('Snoozed returns unsnooze, snooze, archive, trash, star', () => {
    const ids = getActionsForView('Snoozed').map(a => a.id);
    expect(ids).toEqual(['unsnooze', 'snooze', 'archive', 'trash', 'star']);
  });

  test('SetAside returns unset-aside, archive, trash, star, snooze', () => {
    const ids = getActionsForView('SetAside').map(a => a.id);
    expect(ids).toEqual(['unset-aside', 'archive', 'trash', 'star', 'snooze']);
  });

  test('Sent returns archive, trash, star', () => {
    const ids = getActionsForView('Sent').map(a => a.id);
    expect(ids).toEqual(['archive', 'trash', 'star']);
  });

  test('Drafts returns only trash', () => {
    const ids = getActionsForView('Drafts').map(a => a.id);
    expect(ids).toEqual(['trash']);
  });

  test('Scheduled returns empty (not yet implemented)', () => {
    const ids = getActionsForView('Scheduled').map(a => a.id);
    expect(ids).toEqual([]);
  });

  test('Reminders returns archive, trash, star', () => {
    const ids = getActionsForView('Reminders').map(a => a.id);
    expect(ids).toEqual(['archive', 'trash', 'star']);
  });

  test('Triage returns archive, trash, star, snooze, set-aside', () => {
    const ids = getActionsForView('Triage').map(a => a.id);
    expect(ids).toEqual(['archive', 'trash', 'star', 'snooze', 'set-aside']);
  });

  test('unknown view falls back to archive + star', () => {
    const ids = getActionsForView('SomethingElse' as any).map(a => a.id);
    expect(ids).toEqual(['archive', 'star']);
  });

  // Keyboard shortcut mapping tests
  test('Inbox: archive has key "e", trash has key "#", star has key "s"', () => {
    const actions = getActionsForView('Inbox');
    expect(actions.find(a => a.id === 'archive')?.key).toBe('e');
    expect(actions.find(a => a.id === 'trash')?.key).toBe('#');
    expect(actions.find(a => a.id === 'star')?.key).toBe('s');
    expect(actions.find(a => a.id === 'snooze')?.key).toBe('h');
    expect(actions.find(a => a.id === 'set-aside')?.key).toBe('v');
    expect(actions.find(a => a.id === 'mark-read-unread')?.key).toBe('u');
  });

  test('Trash: restore and delete-permanently have no keyboard shortcuts', () => {
    const actions = getActionsForView('Trash');
    expect(actions.find(a => a.id === 'restore')?.key).toBeUndefined();
    expect(actions.find(a => a.id === 'delete-permanently')?.key).toBeUndefined();
  });

  test('exitsReader is true for destructive/move actions', () => {
    const inbox = getActionsForView('Inbox');
    expect(inbox.find(a => a.id === 'archive')?.exitsReader).toBe(true);
    expect(inbox.find(a => a.id === 'trash')?.exitsReader).toBe(true);
    expect(inbox.find(a => a.id === 'set-aside')?.exitsReader).toBe(true);
    // Star and mark-read should NOT exit reader
    expect(inbox.find(a => a.id === 'star')?.exitsReader).toBeFalsy();
    expect(inbox.find(a => a.id === 'mark-read-unread')?.exitsReader).toBeFalsy();
  });
});
