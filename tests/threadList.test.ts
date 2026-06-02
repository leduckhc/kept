// threadList.test.ts — Ensure all action buttons on category/group rows are wired
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { categoryRow, senderGroupRow, domainGroupRow, wireCategoryAndGroupRows, type ThreadListDeps } from '../src/threadList';
import type { Thread } from '../src/gmail';
import { state } from '../src/state';

// Minimal thread fixture
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
    category: 'newsletters',
    ...overrides,
  } as Thread;
}

describe('Category row action buttons', () => {
  it('renders Archive All button with .btn-archive-all class', () => {
    const threads = [makeThread(), makeThread({ id: 'th_2' })];
    const html = categoryRow('newsletters', threads);
    const div = document.createElement('div');
    div.innerHTML = html;
    const btn = div.querySelector('.btn-archive-all');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('title')).toBe('Archive all');
  });

  it('renders Delete All button with .btn-trash-all class', () => {
    const threads = [makeThread()];
    const html = categoryRow('newsletters', threads);
    const div = document.createElement('div');
    div.innerHTML = html;
    const btn = div.querySelector('.btn-trash-all');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('title')).toBe('Delete all');
  });

  it('renders Mark All Read button with .btn-read-all class', () => {
    const threads = [makeThread()];
    const html = categoryRow('newsletters', threads);
    const div = document.createElement('div');
    div.innerHTML = html;
    const btn = div.querySelector('.btn-read-all');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('title')).toBe('Mark all read');
  });
});

describe('Sender group row action buttons', () => {
  it('renders Archive button with .btn-archive class', () => {
    const threads = [makeThread()];
    const html = senderGroupRow('test@example.com', 'Test', threads);
    const div = document.createElement('div');
    div.innerHTML = html;
    const btn = div.querySelector('.btn-archive');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('title')).toBe('Archive all');
  });

  it('renders Trash button with .btn-trash class', () => {
    const threads = [makeThread()];
    const html = senderGroupRow('test@example.com', 'Test', threads);
    const div = document.createElement('div');
    div.innerHTML = html;
    const btn = div.querySelector('.btn-trash');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('title')).toBe('Delete all');
  });
});

describe('Domain group row action buttons', () => {
  it('renders Archive button with .btn-archive class', () => {
    const threads = [makeThread()];
    const html = domainGroupRow('example.com', threads);
    const div = document.createElement('div');
    div.innerHTML = html;
    const btn = div.querySelector('.btn-archive');
    expect(btn).not.toBeNull();
  });

  it('renders Trash button with .btn-trash class', () => {
    const threads = [makeThread()];
    const html = domainGroupRow('example.com', threads);
    const div = document.createElement('div');
    div.innerHTML = html;
    const btn = div.querySelector('.btn-trash');
    expect(btn).not.toBeNull();
  });
});

describe('Category row wiring — Archive All actually fires', () => {
  it('clicking .btn-archive-all removes category threads from state', async () => {
    const t1 = makeThread({ id: 'th_nl_1', category: 'newsletters' });
    const t2 = makeThread({ id: 'th_nl_2', category: 'newsletters' });
    const t3 = makeThread({ id: 'th_personal', category: 'personal' });
    state.threads = [t1, t2, t3];
    state.account = { id: 'acc_1', email: 'x@x.com', accessToken: '', refreshToken: '', tokenExpiry: 0, signature: '' } as any;
    state.accounts = [state.account];

    const container = document.createElement('div');
    container.innerHTML = categoryRow('newsletters', [t1, t2]);

    const mockRenderInbox = vi.fn();
    const deps: ThreadListDeps = {
      renderInbox: mockRenderInbox,
      openThread: vi.fn(),
      openInlineReply: vi.fn(),
      getActionDeps: () => ({ renderInbox: mockRenderInbox, loadUnifiedThreads: vi.fn() }),
    };

    wireCategoryAndGroupRows(container, deps);

    const btn = container.querySelector('.btn-archive-all') as HTMLElement;
    expect(btn).not.toBeNull();
    btn.click();

    // Give the async handler a tick
    await new Promise(r => setTimeout(r, 10));

    // Newsletter threads should be removed from state.threads
    expect(state.threads.find(t => t.id === 'th_nl_1')).toBeUndefined();
    expect(state.threads.find(t => t.id === 'th_nl_2')).toBeUndefined();
    // Personal thread should remain
    expect(state.threads.find(t => t.id === 'th_personal')).toBeDefined();
    // renderInbox should have been called
    expect(mockRenderInbox).toHaveBeenCalled();
  });
});
