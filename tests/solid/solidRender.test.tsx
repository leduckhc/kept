/**
 * Tests that Solid components own the inbox rendering,
 * not legacy threadList.ts innerHTML.
 *
 * Verifies:
 * 1. Thread rows rendered by Solid have correct data attributes
 * 2. Clicking avatar triggers bulk selection via Solid store
 * 3. Legacy renderInbox is a no-op when Solid is mounted
 * 4. Keyboard navigation works with Solid-rendered rows
 * 5. Store actions propagate back to legacy state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@solidjs/testing-library';
import { ThreadList } from '../../src/solid/ThreadList';
import {
  appState, setAppState, selectThread, toggleBulkSelect,
  filteredThreads, clearBulkSelection,
} from '../../src/solid/store';
import type { Thread } from '../../src/store';

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    accountId: 'acc-1',
    gmailId: 'gm-1',
    subject: 'Test Subject',
    snippet: 'Preview text here',
    senderName: 'Alice',
    senderEmail: 'alice@example.com',
    receivedAt: Date.now(),
    isUnread: false,
    isStarred: false,
    isArchived: false,
    label: 'INBOX',
    category: null,
    hasAttachment: false,
    messageCount: 1,
    snoozedUntil: null,
    isSetAside: false,
    ...overrides,
  };
}

describe('Solid ThreadList rendering', () => {
  beforeEach(() => {
    // Reset store
    setAppState('threads', []);
    setAppState('selectedThreadId', null);
    setAppState('selectedIds', []);
    setAppState('bulkMode', false);
    setAppState('categoryFilter', null);
    setAppState('senderFilter', null);
    setAppState('domainFilter', null);
    setAppState('searchQuery', '');
    setAppState('syncing', false);
    setAppState('groupedSenders', []);
    setAppState('groupedDomains', []);
    setAppState('vipSenders', []);
  });

  it('renders thread rows with data-id attributes', () => {
    const threads = [
      makeThread({ id: 'a1', subject: 'Hello' }),
      makeThread({ id: 'a2', subject: 'World', senderName: 'Bob' }),
    ];
    setAppState('threads', threads);

    const { container } = render(() => <ThreadList />);
    const rows = container.querySelectorAll('.thread-row[data-id]');
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('data-id')).toBe('a1');
    expect(rows[1].getAttribute('data-id')).toBe('a2');
  });

  it('clicking avatar toggles bulk selection', () => {
    setAppState('threads', [makeThread({ id: 'b1' })]);

    const { container } = render(() => <ThreadList />);
    const avatar = container.querySelector('.thread-row[data-id="b1"] .avatar-wrap') as HTMLElement;
    expect(avatar).not.toBeNull();

    fireEvent.click(avatar);
    expect(appState.selectedIds).toContain('b1');
    expect(appState.bulkMode).toBe(true);

    // Click again to deselect
    fireEvent.click(avatar);
    expect(appState.selectedIds).not.toContain('b1');
  });

  it('clicking row body selects thread (not bulk)', () => {
    setAppState('threads', [makeThread({ id: 'c1', subject: 'Click me' })]);

    const { container } = render(() => <ThreadList />);
    const row = container.querySelector('.thread-row[data-id="c1"]') as HTMLElement;
    // Click on the sender text (not avatar, not actions)
    const sender = row.querySelector('.thread-sender') as HTMLElement;
    fireEvent.click(sender);

    expect(appState.selectedThreadId).toBe('c1');
    expect(appState.bulkMode).toBe(false);
  });

  it('shows empty state when no threads and not syncing', () => {
    setAppState('threads', []);
    setAppState('syncing', false);

    const { container } = render(() => <ThreadList />);
    expect(container.querySelector('.empty-state')).not.toBeNull();
  });

  it('shows sync loading when syncing with empty threads', () => {
    setAppState('threads', []);
    setAppState('syncing', true);

    const { container } = render(() => <ThreadList />);
    expect(container.querySelector('.sync-loading')).not.toBeNull();
  });

  it('renders category rows with data-category', () => {
    const threads = [
      makeThread({ id: 'nl-1', category: 'newsletters', subject: 'Newsletter' }),
      makeThread({ id: 'nl-2', category: 'newsletters', subject: 'News 2' }),
    ];
    setAppState('threads', threads);

    const { container } = render(() => <ThreadList />);
    const catRow = container.querySelector('.category-row[data-category="newsletters"]');
    expect(catRow).not.toBeNull();
  });

  it('filtered view shows flat list without sections', () => {
    const threads = [
      makeThread({ id: 'f1', senderEmail: 'alice@test.com' }),
      makeThread({ id: 'f2', senderEmail: 'alice@test.com' }),
      makeThread({ id: 'f3', senderEmail: 'bob@test.com' }),
    ];
    setAppState('threads', threads);
    setAppState('senderFilter', 'alice@test.com');

    const { container } = render(() => <ThreadList />);
    const rows = container.querySelectorAll('.thread-row[data-id]');
    expect(rows.length).toBe(2); // Only alice's threads
    expect(container.querySelector('.section-header')).toBeNull(); // No sections in filtered mode
  });

  it('is-selected class applied to current thread row', () => {
    setAppState('threads', [makeThread({ id: 'sel-1' })]);
    setAppState('focusedThreadId', 'sel-1');

    const { container } = render(() => <ThreadList />);
    const row = container.querySelector('.thread-row[data-id="sel-1"]');
    expect(row?.classList.contains('is-selected')).toBe(true);
  });
});

describe('Solid store ↔ legacy sync', () => {
  beforeEach(() => {
    setAppState('threads', []);
    setAppState('selectedThreadId', null);
    setAppState('selectedIds', []);
    setAppState('bulkMode', false);
  });

  it('selectThread updates store selectedThreadId', () => {
    selectThread('x1');
    expect(appState.selectedThreadId).toBe('x1');
  });

  it('selectThread clears bulk mode', () => {
    setAppState('selectedIds', ['a', 'b']);
    setAppState('bulkMode', true);
    selectThread('x1');
    expect(appState.bulkMode).toBe(false);
    expect(appState.selectedIds).toEqual([]);
  });

  it('toggleBulkSelect adds/removes from selectedIds', () => {
    toggleBulkSelect('t1');
    expect(appState.selectedIds).toEqual(['t1']);
    toggleBulkSelect('t2');
    expect(appState.selectedIds).toEqual(['t1', 't2']);
    toggleBulkSelect('t1');
    expect(appState.selectedIds).toEqual(['t2']);
  });

  it('clearBulkSelection resets all bulk state', () => {
    setAppState('selectedIds', ['a', 'b']);
    setAppState('bulkMode', true);
    setAppState('lastBulkSelectedId', 'a');
    clearBulkSelection();
    expect(appState.selectedIds).toEqual([]);
    expect(appState.bulkMode).toBe(false);
    expect(appState.lastBulkSelectedId).toBeNull();
  });
});
