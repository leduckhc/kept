import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
vi.mock('../src/db', () => ({
  db: {
    select: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
  },
}));

// Mock gmail module
vi.mock('../src/gmail', () => ({
  searchGmail: vi.fn().mockResolvedValue({ threadIds: [], totalEstimate: 0 }),
  syncThreadById: vi.fn().mockResolvedValue(undefined),
}));

describe('switchView', () => {
  let switchView: typeof import('../src/solid/store').switchView;
  let appState: typeof import('../src/solid/store').appState;
  let setAppState: typeof import('../src/solid/store').setAppState;
  let setSearchQuery: typeof import('../src/solid/store').setSearchQuery;

  beforeEach(async () => {
    vi.resetModules();
    const store = await import('../src/solid/store');
    switchView = store.switchView;
    appState = store.appState;
    setAppState = store.setAppState;
    setSearchQuery = store.setSearchQuery;
  });

  it('changes currentView to the target view', () => {
    expect(appState.currentView).toBe('Inbox');
    switchView('Starred');
    expect(appState.currentView).toBe('Starred');
  });

  it('clears selectedThreadId on view switch', () => {
    setAppState('selectedThreadId', 'thread-123');
    expect(appState.selectedThreadId).toBe('thread-123');
    switchView('Trash');
    expect(appState.selectedThreadId).toBeNull();
  });

  it('clears searchQuery on view switch', () => {
    setSearchQuery('from:alice');
    expect(appState.searchQuery).toBe('from:alice');
    switchView('Archive');
    expect(appState.searchQuery).toBe('');
  });

  it('clears categoryFilter on view switch', () => {
    setAppState('categoryFilter', 'Finance');
    expect(appState.categoryFilter).toBe('Finance');
    switchView('Sent');
    expect(appState.categoryFilter).toBeNull();
  });

  it('clears senderFilter on view switch', () => {
    setAppState('senderFilter', 'bob@example.com');
    switchView('Drafts');
    expect(appState.senderFilter).toBeNull();
  });

  it('clears domainFilter on view switch', () => {
    setAppState('domainFilter', 'example.com');
    switchView('Scheduled');
    expect(appState.domainFilter).toBeNull();
  });

  it('clears bulk selection on view switch', () => {
    setAppState('selectedIds', ['id1', 'id2', 'id3']);
    expect(appState.selectedIds.length).toBe(3);
    switchView('Reminders');
    expect(appState.selectedIds.length).toBe(0);
  });

  it('switching to same view still resets state', () => {
    setAppState('selectedThreadId', 'thread-456');
    setAppState('categoryFilter', 'Travel');
    switchView('Inbox');
    expect(appState.selectedThreadId).toBeNull();
    expect(appState.categoryFilter).toBeNull();
  });

  it('supports all defined view names', () => {
    const views = ['Inbox', 'Snoozed', 'Sent', 'Drafts', 'Starred', 'Scheduled', 'Reminders', 'Trash', 'Archive', 'SetAside', 'Triage'] as const;
    for (const view of views) {
      switchView(view);
      expect(appState.currentView).toBe(view);
    }
  });
});
