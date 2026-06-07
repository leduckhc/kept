/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  appState, setAppState, setThreads,
  selectThread, toggleBulkSelect, clearBulkSelection,
  switchView, setSearchQuery, setCategoryFilter,
  setSenderFilter, setDomainFilter,
} from '../../src/solid/store';
import type { Thread } from '../../src/store';

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 't01',
    subject: 'Test subject',
    snippet: 'Test snippet',
    senderName: 'Alice',
    senderEmail: 'alice@example.com',
    receivedAt: Date.now(),
    isUnread: false,
    isArchived: false,
    isStarred: false,
    hasAttachment: false,
    gmailThreadId: 'gm01',
    snoozedUntil: null,
    snoozeLabel: null,
    messageCount: 1,
    label: 'INBOX',
    accountId: 'acc1',
    isMuted: false,
    isSetAside: false,
    category: 'personal',
    userLabels: '',
    ...overrides,
  };
}

beforeEach(() => {
  setThreads([]);
  switchView('Inbox');
  setSearchQuery('');
  clearBulkSelection();
  setAppState('selectedThreadId', null);
});

describe('solid/store — state mutations', () => {
  it('initial state is correct', () => {
    expect(appState.currentView).toBe('Inbox');
    expect(appState.selectedThreadId).toBe(null);
    expect(appState.bulkMode).toBe(false);
    expect(appState.selectedIds).toEqual([]);
    expect(appState.threads).toEqual([]);
  });

  it('setThreads updates threads array', () => {
    const threads = [makeThread({ id: 't1' }), makeThread({ id: 't2' })];
    setThreads(threads);
    expect(appState.threads).toHaveLength(2);
    expect(appState.threads[0].id).toBe('t1');
    expect(appState.threads[1].id).toBe('t2');
  });

  it('selectThread sets selectedThreadId', () => {
    selectThread('t1');
    expect(appState.selectedThreadId).toBe('t1');
    selectThread(null);
    expect(appState.selectedThreadId).toBe(null);
  });

  it('selectThread clears bulk mode', () => {
    toggleBulkSelect('t1');
    expect(appState.bulkMode).toBe(true);
    selectThread('t2');
    expect(appState.bulkMode).toBe(false);
    expect(appState.selectedIds).toEqual([]);
  });

  it('toggleBulkSelect adds/removes ids', () => {
    toggleBulkSelect('t1');
    expect(appState.selectedIds).toContain('t1');
    expect(appState.bulkMode).toBe(true);

    toggleBulkSelect('t2');
    expect(appState.selectedIds).toContain('t2');
    expect(appState.selectedIds).toHaveLength(2);

    toggleBulkSelect('t1');
    expect(appState.selectedIds).not.toContain('t1');
    expect(appState.selectedIds).toHaveLength(1);
  });

  it('clearBulkSelection resets everything', () => {
    toggleBulkSelect('t1');
    toggleBulkSelect('t2');
    clearBulkSelection();
    expect(appState.selectedIds).toHaveLength(0);
    expect(appState.bulkMode).toBe(false);
    expect(appState.lastBulkSelectedId).toBe(null);
  });

  it('switchView resets selection, bulk, and filters', () => {
    setAppState('selectedThreadId', 't1');
    setAppState('categoryFilter', 'newsletters');
    setAppState('senderFilter', 'bob@x.com');
    setAppState('domainFilter', 'x.com');
    toggleBulkSelect('t1');

    switchView('Sent');
    expect(appState.currentView).toBe('Sent');
    expect(appState.selectedThreadId).toBeNull();
    expect(appState.bulkMode).toBe(false);
    expect(appState.categoryFilter).toBeNull();
    expect(appState.senderFilter).toBeNull();
    expect(appState.domainFilter).toBeNull();
  });

  it('setSearchQuery updates searchQuery', () => {
    setSearchQuery('hello');
    expect(appState.searchQuery).toBe('hello');
  });

  it('setCategoryFilter / setSenderFilter / setDomainFilter', () => {
    setCategoryFilter('newsletters');
    expect(appState.categoryFilter).toBe('newsletters');
    setSenderFilter('bob@x.com');
    expect(appState.senderFilter).toBe('bob@x.com');
    setDomainFilter('x.com');
    expect(appState.domainFilter).toBe('x.com');
  });
});

describe('solid/store — filteredThreads (integration via component)', () => {
  // Memos in SolidJS only update inside a reactive tracking scope (component render).
  // These are tested implicitly via component E2E tests.
  // Here we verify the raw store data that feeds memos.

  it('store holds correct threads after setThreads', () => {
    const threads = [
      makeThread({ id: 't1', subject: 'Meeting', label: 'INBOX', isStarred: true }),
      makeThread({ id: 't2', subject: 'Newsletter', label: 'INBOX', category: 'newsletters' }),
      makeThread({ id: 't3', subject: 'Outbound', label: 'SENT' }),
    ];
    setThreads(threads);
    expect(appState.threads).toHaveLength(3);

    // Verify the filtering logic works on raw data
    const sent = appState.threads.filter(t => t.label === 'SENT');
    expect(sent).toHaveLength(1);
    expect(sent[0].id).toBe('t3');

    const starred = appState.threads.filter(t => t.isStarred);
    expect(starred).toHaveLength(1);
    expect(starred[0].id).toBe('t1');

    const newsletters = appState.threads.filter(t => t.category === 'newsletters');
    expect(newsletters).toHaveLength(1);
    expect(newsletters[0].id).toBe('t2');
  });
});
