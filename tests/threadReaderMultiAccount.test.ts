/**
 * threadReaderMultiAccount.test.ts
 *
 * Tests that openThread() resolves the correct account for cross-account threads
 * and passes it to all Gmail API calls (fetchMessageBody, markRead, archiveThread, etc.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock modules ──────────────────────────────────────────────────────────────

vi.mock('../src/auth', () => ({
  getAccountById: vi.fn(),
}));

vi.mock('../src/gmail', () => ({
  fetchMessageBody: vi.fn().mockResolvedValue({ lastMessageId: 'msg-1', messages: [] }),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  markRead: vi.fn().mockResolvedValue(undefined),
  archiveThread: vi.fn().mockResolvedValue(undefined),
  blockSender: vi.fn().mockResolvedValue(undefined),
  loadAttachments: vi.fn().mockResolvedValue([]),
  downloadAttachment: vi.fn().mockResolvedValue(new Uint8Array()),
  markThreadUnread: vi.fn().mockResolvedValue(undefined),
  reportSpam: vi.fn().mockResolvedValue(undefined),
  moveToLabel: vi.fn().mockResolvedValue(undefined),
  fetchLabels: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/db', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../src/toasts', () => ({
  showToast: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('../src/sanitize', () => ({
  sanitizeEmailHtml: vi.fn((html: string) => html),
}));

vi.mock('../src/compose', () => ({
  openComposeReply: vi.fn(),
  openComposeReplyAll: vi.fn(),
  openComposeForward: vi.fn(),
}));

vi.mock('../src/icons', () => ({
  icon: new Proxy({}, { get: () => () => '<svg></svg>' }),
}));

vi.mock('../src/followupReminders', () => ({
  saveReminder: vi.fn(),
  reminderPresets: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/helpers', () => ({
  esc: (s: string) => s,
  formatDate: () => 'Jan 1',
}));

import { getAccountById } from '../src/auth';
import { fetchMessageBody, markRead, archiveThread } from '../src/gmail';
import { state } from '../src/state';
import type { Thread } from '../src/store';
import type { Account } from '../src/auth';

const mockedGetAccountById = vi.mocked(getAccountById);
const mockedFetchMessageBody = vi.mocked(fetchMessageBody);
const mockedMarkRead = vi.mocked(markRead);
const mockedArchiveThread = vi.mocked(archiveThread);

function makeAccount(id: string, email: string): Account {
  return {
    id,
    email,
    accessToken: 'tok-' + id,
    refreshToken: 'rtok-' + id,
    tokenExpiry: Date.now() + 3_600_000,
    signature: '',
    colorIndex: 0,
    provider: 'gmail',
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    subject: 'Test Subject',
    snippet: 'snippet',
    senderName: 'Sender',
    senderEmail: 'sender@example.com',
    receivedAt: Date.now(),
    isUnread: false,
    isArchived: false,
    isStarred: false,
    hasAttachment: false,
    gmailThreadId: 'gmail-thread-1',
    snoozedUntil: null,
    snoozeLabel: null,
    messageCount: 1,
    label: 'INBOX',
    accountId: 'account-b',
    isMuted: false,
    isSetAside: false,
    category: 'personal',
    userLabels: '',
    ...overrides,
  };
}

function setupDOM() {
  document.body.innerHTML = `
    <div id="app-shell">
      <div id="reader-pane"></div>
    </div>
  `;
}

describe('openThread multi-account resolution', () => {
  const accountA = makeAccount('account-a', 'a@example.com');
  const accountB = makeAccount('account-b', 'b@example.com');

  beforeEach(() => {
    vi.clearAllMocks();
    setupDOM();
    state.account = accountA;
    state.threads = [];
  });

  it('resolves correct account when thread.accountId differs from state.account.id', async () => {
    mockedGetAccountById.mockResolvedValue(accountB);
    const thread = makeThread({ accountId: 'account-b', isUnread: false });

    const { openThread } = await import('../src/threadReader');
    await openThread(thread, () => {});

    expect(mockedGetAccountById).toHaveBeenCalledWith('account-b');
  });

  it('uses state.account when thread.accountId matches (no extra lookup)', async () => {
    const thread = makeThread({ accountId: 'account-a', isUnread: false });

    const { openThread } = await import('../src/threadReader');
    await openThread(thread, () => {});

    // getAccountById should NOT be called for resolution (may be called elsewhere)
    // The first call should not be for 'account-a' resolution
    const resolutionCalls = mockedGetAccountById.mock.calls.filter(c => c[0] === 'account-a');
    // No resolution call needed — state.account is used directly
    expect(resolutionCalls.length).toBe(0);
  });

  it('returns early (no crash) when getAccountById returns null for thread account', async () => {
    mockedGetAccountById.mockResolvedValue(null);
    const thread = makeThread({ accountId: 'account-b', isUnread: false });

    const { openThread } = await import('../src/threadReader');
    await openThread(thread, () => {});

    // fetchMessageBody should NOT be called since we returned early
    expect(mockedFetchMessageBody).not.toHaveBeenCalled();
  });

  it('fetchMessageBody is called with the thread account, not state.account', async () => {
    mockedGetAccountById.mockResolvedValue(accountB);
    const thread = makeThread({ accountId: 'account-b', isUnread: false });

    const { openThread } = await import('../src/threadReader');
    await openThread(thread, () => {});

    expect(mockedFetchMessageBody).toHaveBeenCalledWith(accountB, 'gmail-thread-1');
    // Ensure it was NOT called with accountA
    expect(mockedFetchMessageBody).not.toHaveBeenCalledWith(accountA, expect.anything());
  });

  it('markRead is called with the thread account for cross-account threads', async () => {
    mockedGetAccountById.mockResolvedValue(accountB);
    const thread = makeThread({ accountId: 'account-b', isUnread: true });

    const { openThread } = await import('../src/threadReader');
    await openThread(thread, () => {});

    expect(mockedMarkRead).toHaveBeenCalledWith(accountB, thread);
    expect(mockedMarkRead).not.toHaveBeenCalledWith(accountA, expect.anything());
  });

  it('archive action uses threadAccount not state.account', async () => {
    mockedGetAccountById.mockResolvedValue(accountB);
    const thread = makeThread({ accountId: 'account-b', isUnread: false });
    state.threads = [thread];

    const { openThread } = await import('../src/threadReader');
    await openThread(thread, () => {});

    // Simulate clicking the archive button
    const archiveBtn = document.getElementById('btn-archive-reader')!;
    expect(archiveBtn).toBeTruthy();

    // Reset mock to isolate the archive call
    mockedGetAccountById.mockResolvedValue(accountA); // for the "fresh" re-fetch after archive
    mockedArchiveThread.mockClear();

    archiveBtn.click();
    // Wait for the async handler
    await new Promise(r => setTimeout(r, 10));

    expect(mockedArchiveThread).toHaveBeenCalledWith(accountB, thread);
    expect(mockedArchiveThread).not.toHaveBeenCalledWith(accountA, expect.anything());
  });
});
