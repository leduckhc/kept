// replyFrom.test.ts — Phase 2: Multi-account From selection tests
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { Account } from '../src/auth';

// ── Mocks ──
vi.mock('../src/store', () => ({
  loadSenderEmails: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/gmail', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  createDraft: vi.fn().mockResolvedValue('draft-123'),
  updateDraft: vi.fn().mockResolvedValue(undefined),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/db', () => ({
  getDb: vi.fn().mockResolvedValue({ execute: vi.fn(), select: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('../src/localDrafts', () => ({
  saveLocalDraft: vi.fn().mockResolvedValue(undefined),
  deleteLocalDraft: vi.fn().mockResolvedValue(undefined),
  linkGmailDraft: vi.fn().mockResolvedValue(undefined),
  newDraftId: vi.fn().mockReturnValue('local-draft-1'),
}));

vi.mock('../src/toasts', () => ({
  showToast: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('../src/scheduledSend', () => ({
  scheduleEmail: vi.fn(),
}));

vi.mock('../src/followupReminders', () => ({
  saveReminder: vi.fn(),
  reminderPresets: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/icons', () => ({
  icon: new Proxy({}, {
    get: () => () => '<svg></svg>',
  }),
}));

import { loadSenderEmails } from '../src/store';
import { sendEmail } from '../src/gmail';
import { state } from '../src/state';
import { openCompose, openComposeReply, openComposeReplyAll, openComposeForward, openComposeNew, closeCompose } from '../src/compose';
import { ACCOUNT_BADGE_COLORS } from '../src/avatar';

// ── Test accounts ──
function makeAccount(id: string, email: string, signature = ''): Account {
  return {
    id,
    email,
    accessToken: 'tok-' + id,
    refreshToken: 'rtok-' + id,
    tokenExpiry: Date.now() + 3_600_000,
    signature,
    colorIndex: 0,
    provider: 'gmail',
  };
}

const acct1 = makeAccount('acct-1', 'alice@example.com', 'Best, Alice');
const acct2 = makeAccount('acct-2', 'bob@work.com', 'Regards, Bob');
const acct3 = makeAccount('acct-3', 'carol@personal.org');

describe('Phase 2: Multi-account From selection', () => {
  beforeEach(() => {
    // Reset state
    state.account = acct1;
    state.accounts = [acct1, acct2, acct3];
    state.lastUsedAccountId = null;
    // Clean DOM
    document.body.innerHTML = '';
    // Close any open panels
    closeCompose();
    // Reset mocks
    vi.clearAllMocks();
  });

  it('1. Reply to thread → From = receiving account (accountId passed)', async () => {
    await openComposeReply({
      to: 'sender@test.com',
      subject: 'Test',
      threadId: 'thread-1',
      accountId: 'acct-2',
    });

    expect(loadSenderEmails).toHaveBeenCalledWith('acct-2');
    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('bob@work.com');
  });

  it('2. Reply-all to thread → From = receiving account', async () => {
    await openComposeReplyAll({
      to: 'sender@test.com',
      cc: 'other@test.com',
      subject: 'Group thread',
      threadId: 'thread-2',
      accountId: 'acct-2',
    });

    expect(loadSenderEmails).toHaveBeenCalledWith('acct-2');
    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('bob@work.com');
  });

  it('3. Forward from thread → From = receiving account', async () => {
    await openComposeForward({
      subject: 'Fwd test',
      quotedText: 'original text',
      accountId: 'acct-3',
    });

    expect(loadSenderEmails).toHaveBeenCalledWith('acct-3');
    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('carol@personal.org');
  });

  it('4. Compose new → From = last-used account (state.lastUsedAccountId)', async () => {
    state.lastUsedAccountId = 'acct-2';
    await openComposeNew('', () => {}, () => {});

    expect(loadSenderEmails).toHaveBeenCalledWith('acct-2');
    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('bob@work.com');
  });

  it('5. Compose new, switch account via picker → From updates', async () => {
    await openComposeNew('', () => {}, () => {}, 'acct-1');

    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('alice@example.com');

    // Click the From badge to open picker
    const fromBadge = document.querySelector<HTMLButtonElement>('.compose-from-badge')!;
    fromBadge.click();

    const picker = document.querySelector('.compose-from-picker') as HTMLElement;
    expect(picker.style.display).toBe('block');

    // Click on acct-2
    const items = picker.querySelectorAll<HTMLElement>('.compose-from-picker-item');
    items[1].click(); // acct-2 is second

    expect(badge?.textContent).toBe('bob@work.com');
    expect(state.lastUsedAccountId).toBe('acct-2');
  });

  it('6. Quick-reply from thread list → From = receiving account', async () => {
    // Simulates passing accountId from thread reader
    await openComposeReply({
      to: 'someone@test.com',
      subject: 'Quick reply',
      threadId: 'thread-inline',
      accountId: 'acct-3',
    });

    expect(loadSenderEmails).toHaveBeenCalledWith('acct-3');
    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('carol@personal.org');
  });

  it('7. Thread in unified view → correct From auto-selected', async () => {
    // In unified mode, thread belongs to acct-2
    state.unifiedMode = true;
    await openCompose({
      mode: 'reply',
      to: 'someone@test.com',
      subject: 'Unified test',
      threadId: 'unified-thread',
      accountId: 'acct-2',
    });

    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('bob@work.com');
  });

  it('8. Thread in filtered view → correct From auto-selected', async () => {
    // Account filter active for acct-3
    state.accountFilter = 'acct-3';
    await openCompose({
      mode: 'reply',
      to: 'test@test.com',
      subject: 'Filtered',
      threadId: 'filtered-thread',
      accountId: 'acct-3',
    });

    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('carol@personal.org');
  });

  it('9. Draft saved → resumes with original From account (accountId in LocalDraft)', async () => {
    const { saveLocalDraft } = await import('../src/localDrafts');
    // Open compose for acct-2, then trigger close (which saves draft)
    await openCompose({
      mode: 'new',
      subject: 'Draft test',
      accountId: 'acct-2',
    });

    // Simulate typing content so draft save triggers
    const editor = document.querySelector<HTMLElement>('.compose-editor-new')!;
    editor.innerText = 'Some content';
    const toEl = document.querySelector<HTMLInputElement>('.compose-to')!;
    toEl.value = 'someone@test.com';

    // Trigger close button
    const closeBtn = document.querySelector<HTMLButtonElement>('.compose-panel-close')!;
    closeBtn.click();

    // Wait for async handler
    await new Promise(r => setTimeout(r, 50));

    expect(saveLocalDraft).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct-2' })
    );
  });

  it('10. Account removed → no stale From references when account not found', async () => {
    // Try to open compose with a removed account ID
    await openCompose({
      mode: 'new',
      subject: 'Stale account',
      accountId: 'acct-removed',
    });

    // Should fall back to state.account (acct-1)
    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('alice@example.com');
  });

  it('11. Reply from filtered view matches filter account', async () => {
    state.accountFilter = 'acct-2';
    await openComposeReply({
      to: 'reply-target@test.com',
      subject: 'Filtered reply',
      threadId: 'thread-filtered',
      accountId: 'acct-2',
    });

    expect(loadSenderEmails).toHaveBeenCalledWith('acct-2');
    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('bob@work.com');
  });

  it('12. From badge is always present in compose DOM (never hidden)', async () => {
    // Single account scenario
    state.accounts = [acct1];
    await openCompose({ mode: 'new', accountId: 'acct-1' });

    const fromRow = document.querySelector('.compose-from-row');
    expect(fromRow).not.toBeNull();
    const badge = document.querySelector('.compose-from-badge');
    expect(badge).not.toBeNull();
    // No chevron when single account
    const chevron = document.querySelector('.compose-from-chevron');
    expect(chevron).toBeNull();
  });

  it('13. From badge text matches the actual send account', async () => {
    await openCompose({
      mode: 'new',
      accountId: 'acct-3',
    });

    const badge = document.querySelector('.compose-from-email');
    expect(badge?.textContent).toBe('carol@personal.org');

    // Verify the dot color matches account index 2
    const dot = document.querySelector<HTMLElement>('.compose-from-dot');
    const expectedColor = ACCOUNT_BADGE_COLORS[2 % ACCOUNT_BADGE_COLORS.length];
    expect(dot?.style.background).toBe(expectedColor);
  });
});
