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

/**
 * UnifiedBar Design Contract Tests (TDD — Red Phase)
 *
 * Design: 3-zone layout (NAV / CONTEXT / ACTIONS)
 * Strategy pattern: each mode implements a ModeStrategy interface
 * that returns { nav, context, actions } zone descriptors.
 *
 * Modes: inbox, reader, folder, bulk
 * Key rule: Search + Compose are inbox-ONLY. Never leak to other modes.
 */

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
  setCategoryFilter(null);
  setSenderFilter(null);
  setDomainFilter(null);
});

// ── ModeStrategy interface tests ────────────────────────────────
describe('UnifiedBar — ModeStrategy contract', () => {
  it('deriveMode returns inbox by default', async () => {
    const { deriveMode } = await import('../../src/solid/UnifiedBar');
    expect(deriveMode()).toBe('inbox');
  });

  it('deriveMode returns folder when categoryFilter set', async () => {
    setCategoryFilter('newsletters');
    const { deriveMode } = await import('../../src/solid/UnifiedBar');
    expect(deriveMode()).toBe('folder');
  });

  it('deriveMode returns reader when selectedThread + 2-pane', async () => {
    setThreads([makeThread()]);
    setAppState('selectedThreadId', 't01');
    setAppState('layoutMode', '2-pane');
    const { deriveMode } = await import('../../src/solid/UnifiedBar');
    expect(deriveMode()).toBe('reader');
  });

  it('deriveMode returns bulk when selectedIds non-empty', async () => {
    setThreads([makeThread()]);
    toggleBulkSelect('t01');
    const { deriveMode } = await import('../../src/solid/UnifiedBar');
    expect(deriveMode()).toBe('bulk');
  });

  it('getModeStrategy returns object with nav, context, actions for each mode', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const modes = ['inbox', 'reader', 'folder', 'bulk'] as const;
    for (const mode of modes) {
      const strategy = getModeStrategy(mode);
      expect(strategy).toHaveProperty('nav');
      expect(strategy).toHaveProperty('context');
      expect(strategy).toHaveProperty('actions');
      expect(typeof strategy.nav).toBe('function');
      expect(typeof strategy.context).toBe('function');
      expect(typeof strategy.actions).toBe('function');
    }
  });
});

// ── Inbox mode: search + compose live here ──────────────────────
describe('UnifiedBar — Inbox mode strategy', () => {
  it('inbox nav zone renders hamburger menu button', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('inbox');
    expect(strategy.nav.id).toBe('hamburger');
  });

  it('inbox context zone renders search pill', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('inbox');
    expect(strategy.context.id).toBe('search-pill');
  });

  it('inbox actions zone renders compose button', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('inbox');
    expect(strategy.actions.id).toBe('compose');
  });
});

// ── Reader mode: NO search, NO compose ──────────────────────────
describe('UnifiedBar — Reader mode strategy', () => {
  it('reader nav zone renders breadcrumb', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('reader');
    expect(strategy.nav.id).toBe('breadcrumb');
  });

  it('reader context zone renders subject', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('reader');
    expect(strategy.context.id).toBe('subject');
  });

  it('reader actions zone renders thread actions', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('reader');
    expect(strategy.actions.id).toBe('thread-actions');
  });

  it('reader mode does NOT contain compose button', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('reader');
    expect(strategy.actions.id).not.toBe('compose');
    expect(strategy.nav.id).not.toBe('compose');
    expect(strategy.context.id).not.toBe('compose');
  });

  it('reader mode does NOT contain search pill', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('reader');
    expect(strategy.context.id).not.toBe('search-pill');
  });
});

// ── Folder mode: NO search, NO compose ──────────────────────────
describe('UnifiedBar — Folder mode strategy', () => {
  it('folder nav zone renders breadcrumb', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('folder');
    expect(strategy.nav.id).toBe('breadcrumb');
  });

  it('folder context zone renders folder info', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('folder');
    expect(strategy.context.id).toBe('folder-info');
  });

  it('folder actions zone renders folder bulk actions', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('folder');
    expect(strategy.actions.id).toBe('folder-actions');
  });

  it('folder mode does NOT contain compose', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('folder');
    expect(strategy.actions.id).not.toBe('compose');
  });

  it('folder mode does NOT contain search pill', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('folder');
    expect(strategy.context.id).not.toBe('search-pill');
  });
});

// ── Bulk mode: cancel + count + bulk actions ────────────────────
describe('UnifiedBar — Bulk mode strategy', () => {
  it('bulk nav zone renders cancel button', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('bulk');
    expect(strategy.nav.id).toBe('bulk-cancel');
  });

  it('bulk context zone renders selection count', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('bulk');
    expect(strategy.context.id).toBe('selection-count');
  });

  it('bulk actions zone renders bulk action buttons', async () => {
    const { getModeStrategy } = await import('../../src/solid/UnifiedBar');
    const strategy = getModeStrategy('bulk');
    expect(strategy.actions.id).toBe('bulk-actions');
  });
});

// ── 3-Zone Layout Contract ──────────────────────────────────────
describe('UnifiedBar — 3-zone layout', () => {
  it('exports ZONE_CLASSES with nav, context, actions class names', async () => {
    const { ZONE_CLASSES } = await import('../../src/solid/UnifiedBar');
    expect(ZONE_CLASSES).toEqual({
      nav: 'unified-bar-zone-nav',
      context: 'unified-bar-zone-context',
      actions: 'unified-bar-zone-actions',
    });
  });
});
