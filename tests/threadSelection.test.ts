/**
 * Integration test: thread selection after renderInbox + updateUnifiedBar cycle
 * Reproduces bug: "thread selection stopped working" after unified bar filter changes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderInbox, wireThreadRows, threadRow, type ThreadListDeps } from '../src/threadList';
import { renderUnifiedBar } from '../src/unifiedBar';
import { state } from '../src/state';
import type { Thread } from '../src/gmail';

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'th_1',
    accountId: 'acc_1',
    subject: 'Test Subject',
    snippet: 'Preview text',
    senderName: 'Test Sender',
    senderEmail: 'test@example.com',
    receivedAt: Date.now(),
    isUnread: false,
    isStarred: false,
    gmailThreadId: 'gm_1',
    hasAttachment: false,
    label: 'INBOX',
    messageCount: 1,
    snoozedUntil: null,
    snoozeLabel: null,
    isMuted: false,
    isArchived: false,
    isBlocked: false,
    category: null,
    ...overrides,
  } as Thread;
}

function setupShell() {
  document.body.innerHTML = `
    <div id="app-shell">
      <div class="main-area">
        <div class="unified-bar-slot" id="unified-bar-slot">
          ${renderUnifiedBar({ mode: 'inbox' })}
        </div>
        <div class="app-body">
          <div class="inbox" id="inbox"></div>
          <div class="reader-pane" id="reader-pane"></div>
        </div>
      </div>
    </div>
  `;
}

function makeDeps(openThread: ReturnType<typeof vi.fn>): ThreadListDeps {
  return {
    openThread,
    openInlineReply: vi.fn(),
    toggleBulkSelection: vi.fn(),
    removeBulkBar: vi.fn(),
    updateBulkBar: vi.fn(),
    getActionDeps: () => ({ renderInbox: vi.fn(), loadUnifiedThreads: vi.fn() }) as any,
    renderInbox: vi.fn(),
    renderScheduledView: vi.fn(),
  } as any;
}

describe('Thread selection after unified bar integration', () => {
  beforeEach(() => {
    state.categoryFilter = null;
    state.senderFilter = null;
    state.domainFilter = null;
    state.bulkMode = false;
    state.selectedIds = new Set();
    state.selectedThreadId = null;
    state.groupedSenders = [];
    state.groupedDomains = [];
  });

  it('clicking a thread row calls openThread (no filter)', () => {
    setupShell();
    const t1 = makeThread({ id: 'th_1', subject: 'Hello' });
    const t2 = makeThread({ id: 'th_2', subject: 'World' });
    state.threads = [t1, t2];

    const openThread = vi.fn();
    const deps = makeDeps(openThread);
    renderInbox(deps);

    // Simulate what main.ts does after _renderInbox:
    const slot = document.getElementById('unified-bar-slot')!;
    slot.innerHTML = renderUnifiedBar({ mode: 'inbox' });

    // Now try clicking a thread
    const row = document.querySelector('.thread-row[data-id="th_1"]') as HTMLElement;
    expect(row).not.toBeNull();
    row.click();
    expect(openThread).toHaveBeenCalledWith(t1);
  });

  it('clicking a thread row calls openThread (with category filter active)', () => {
    setupShell();
    const t1 = makeThread({ id: 'th_nl_1', subject: 'Newsletter 1', category: 'newsletters' });
    const t2 = makeThread({ id: 'th_nl_2', subject: 'Newsletter 2', category: 'newsletters' });
    const t3 = makeThread({ id: 'th_3', subject: 'Personal', category: null });
    state.threads = [t1, t2, t3];
    state.categoryFilter = 'newsletters';

    const openThread = vi.fn();
    const deps = makeDeps(openThread);
    renderInbox(deps);

    // Simulate unified bar switching to folder mode (what main.ts does)
    const slot = document.getElementById('unified-bar-slot')!;
    slot.innerHTML = renderUnifiedBar({
      mode: 'folder',
      folderName: 'Newsletters',
      folderColor: '#888',
      folderCount: 2,
    });

    // Try clicking a filtered thread
    const row = document.querySelector('.thread-row[data-id="th_nl_1"]') as HTMLElement;
    expect(row).not.toBeNull();
    row.click();
    expect(openThread).toHaveBeenCalledWith(t1);
  });

  it('clicking a thread works after multiple renderInbox cycles', () => {
    setupShell();
    const t1 = makeThread({ id: 'th_1', subject: 'Hello' });
    state.threads = [t1];

    const openThread = vi.fn();
    const deps = makeDeps(openThread);

    // Simulate multiple render cycles (what happens with updateUnifiedBar in renderInbox)
    renderInbox(deps);
    const slot = document.getElementById('unified-bar-slot')!;
    slot.innerHTML = renderUnifiedBar({ mode: 'inbox' });

    // Second render (e.g., from sync)
    renderInbox(deps);
    slot.innerHTML = renderUnifiedBar({ mode: 'inbox' });

    // Third render
    renderInbox(deps);
    slot.innerHTML = renderUnifiedBar({ mode: 'inbox' });

    const row = document.querySelector('.thread-row[data-id="th_1"]') as HTMLElement;
    expect(row).not.toBeNull();
    row.click();
    expect(openThread).toHaveBeenCalledWith(t1);
  });

  it('thread selection via keyboard (selectedThreadId) still highlights row', () => {
    setupShell();
    const t1 = makeThread({ id: 'th_1', subject: 'Hello' });
    const t2 = makeThread({ id: 'th_2', subject: 'World' });
    state.threads = [t1, t2];
    state.selectedThreadId = 'th_1';

    const openThread = vi.fn();
    const deps = makeDeps(openThread);
    renderInbox(deps);

    const row = document.querySelector('.thread-row[data-id="th_1"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.classList.contains('is-selected')).toBe(true);
  });

  it('renderInbox does not destroy thread handlers when called again with same threads', () => {
    setupShell();
    const t1 = makeThread({ id: 'th_1' });
    state.threads = [t1];

    const openThread = vi.fn();
    const deps = makeDeps(openThread);

    // First render
    renderInbox(deps);
    
    // Click should work
    let row = document.querySelector('.thread-row[data-id="th_1"]') as HTMLElement;
    row.click();
    expect(openThread).toHaveBeenCalledTimes(1);

    // Re-render (simulates what happens when updateUnifiedBar triggers)
    renderInbox(deps);

    // Click should still work (new row element after re-render)
    row = document.querySelector('.thread-row[data-id="th_1"]') as HTMLElement;
    expect(row).not.toBeNull();
    row.click();
    expect(openThread).toHaveBeenCalledTimes(2);
  });
});
