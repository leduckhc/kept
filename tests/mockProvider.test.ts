/**
 * Tests using mock providers to verify the provider abstraction works
 * with multiple providers, the registry dispatches correctly, and
 * consumer code can work against any MailProvider without knowing
 * the underlying implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MailProvider, SyncResult, SendOptions, DraftOptions, MessageBody, AttachmentMeta } from '../src/provider';
import type { AuthProvider } from '../src/authProvider';
import type { Account } from '../src/auth';
import type { Thread } from '../src/store';
import { registerProvider, getProviderForAccount, resetRegistry } from '../src/providerRegistry';
import { registerAuthProvider, getAuthProvider, resetAuthRegistry } from '../src/authProviderRegistry';

// ── Mock Helpers ──────────────────────────────────────────

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    email: 'user@example.com',
    provider: 'gmail',
    accessToken: 'tok-123',
    refreshToken: 'ref-456',
    tokenExpiry: Date.now() + 3600_000,
    signature: '',
    colorIndex: 0,
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    accountId: 'acc-1',
    gmailThreadId: 'gt-1',
    subject: 'Test Subject',
    snippet: 'Preview text...',
    senderName: 'Alice',
    senderEmail: 'alice@example.com',
    receivedAt: Date.now(),
    isUnread: true,
    isArchived: false,
    isStarred: false,
    hasAttachment: false,
    label: 'INBOX',
    messageCount: 1,
    snoozedUntil: null,
    snoozeLabel: null,
    isMuted: false,
    isSetAside: false,
    category: 'personal',
    userLabels: '',
    ...overrides,
  };
}

function createMockMailProvider(id: string, displayName: string): MailProvider & { _calls: Record<string, any[][]> } {
  const _calls: Record<string, any[][]> = {};

  function track(method: string, ...args: any[]) {
    if (!_calls[method]) _calls[method] = [];
    _calls[method].push(args);
  }

  return {
    id,
    displayName,
    _calls,

    async sync(account, onProgress) {
      track('sync', account, onProgress);
      onProgress?.(5);
      return { threads: [], historyId: `${id}-history-1` };
    },
    async syncIncremental(account, historyId, onProgress) {
      track('syncIncremental', account, historyId, onProgress);
      return { threads: [], historyId: `${id}-history-2` };
    },
    async send(account, opts) { track('send', account, opts); },
    async reply(account, opts) { track('reply', account, opts); },
    async createDraft(account, opts) { track('createDraft', account, opts); return `${id}-draft-1`; },
    async updateDraft(account, draftId, opts) { track('updateDraft', account, draftId, opts); },
    async deleteDraft(account, draftId) { track('deleteDraft', account, draftId); },
    async fetchDraftByThread(account, threadId) {
      track('fetchDraftByThread', account, threadId);
      return { draftId: `${id}-draft-2`, to: 'bob@example.com', cc: '', bcc: '', subject: 'Re: Test', body: 'Draft body' };
    },
    async archive(account, thread) { track('archive', account, thread); },
    async unarchive(account, thread) { track('unarchive', account, thread); },
    async trash(account, thread) { track('trash', account, thread); },
    async untrash(account, thread) { track('untrash', account, thread); },
    async markRead(account, thread) { track('markRead', account, thread); },
    async markUnread(account, thread) { track('markUnread', account, thread); },
    async toggleStar(account, thread) { track('toggleStar', account, thread); return !thread.isStarred; },
    async blockSender(account, thread) { track('blockSender', account, thread); },
    async reportSpam(account, threadId) { track('reportSpam', account, threadId); },
    async moveToLabel(account, threadId, labelId, removeFromInbox) { track('moveToLabel', account, threadId, labelId, removeFromInbox); },
    async fetchLabels(account) { track('fetchLabels', account); return [{ id: 'lbl-1', name: 'Work' }]; },
    async mute(account, thread) { track('mute', account, thread); },
    async fetchMessageBody(account, threadId) {
      track('fetchMessageBody', account, threadId);
      return {
        messages: [{
          from: 'alice@example.com',
          to: 'user@example.com',
          cc: '',
          body: 'Hello from ' + id,
          htmlBody: `<p>Hello from ${id}</p>`,
          sanitizedHtml: null,
          receivedAt: Date.now(),
          messageId: `${id}-msg-1`,
        }],
      };
    },
    async loadAttachments(account, threadId) {
      track('loadAttachments', account, threadId);
      return [{
        id: `${id}-att-1`,
        message_id: `${id}-msg-1`,
        thread_id: threadId,
        account_id: account.id,
        filename: 'report.pdf',
        mime_type: 'application/pdf',
        size: 1024,
        attachment_id: `${id}-att-id-1`,
      }];
    },
    async downloadAttachment(account, messageId, attachmentId) {
      track('downloadAttachment', account, messageId, attachmentId);
      return new Uint8Array([0x50, 0x44, 0x46]); // "PDF" bytes
    },
    async loadSenderPhotos(account, emails) {
      track('loadSenderPhotos', account, emails);
      const result: Record<string, string> = {};
      for (const e of emails) result[e] = `https://${id}.example.com/photos/${e}`;
      return result;
    },
    async search(_account, _query, _maxResults) {
      track('search', _account, _query, _maxResults);
      return { threadIds: [], totalEstimate: 0 };
    },
  };
}

function createMockAuthProvider(id: string, displayName: string): AuthProvider {
  return {
    id,
    displayName,
    async startOAuth() {
      return makeAccount({ id: `new-${id}`, email: `user@${id}.com`, provider: id as any });
    },
    async refreshToken(account) {
      return { ...account, accessToken: 'refreshed-' + Date.now(), tokenExpiry: Date.now() + 3600_000 };
    },
    async revokeToken(_account) { /* no-op */ },
    getScopes() { return [`${id}.mail.read`, `${id}.mail.send`]; },
  };
}

// ── Tests ─────────────────────────────────────────────────

describe('Mock Provider — Registry dispatch', () => {
  beforeEach(() => {
    resetRegistry();
  });

  it('dispatches to correct provider based on account.provider field', () => {
    const gmail = createMockMailProvider('gmail', 'Gmail');
    const outlook = createMockMailProvider('outlook', 'Outlook');
    registerProvider('gmail', gmail);
    registerProvider('outlook', outlook);

    const gmailAccount = makeAccount({ provider: 'gmail' });
    const outlookAccount = makeAccount({ provider: 'outlook' as any, id: 'acc-2', email: 'user@outlook.com' });

    expect(getProviderForAccount(gmailAccount).id).toBe('gmail');
    expect(getProviderForAccount(outlookAccount).id).toBe('outlook');
  });

  it('defaults to gmail when account has no provider field', () => {
    const gmail = createMockMailProvider('gmail', 'Gmail');
    registerProvider('gmail', gmail);

    const legacyAccount = makeAccount();
    delete (legacyAccount as any).provider;

    expect(getProviderForAccount(legacyAccount).id).toBe('gmail');
  });

  it('throws for unregistered provider', () => {
    const gmail = createMockMailProvider('gmail', 'Gmail');
    registerProvider('gmail', gmail);

    const unknownAccount = makeAccount({ provider: 'm365' as any });
    expect(() => getProviderForAccount(unknownAccount)).toThrow(/no provider registered/i);
  });
});

describe('Mock Provider — Multi-provider operations', () => {
  let gmail: ReturnType<typeof createMockMailProvider>;
  let outlook: ReturnType<typeof createMockMailProvider>;
  let gmailAccount: Account;
  let outlookAccount: Account;

  beforeEach(() => {
    resetRegistry();
    gmail = createMockMailProvider('gmail', 'Gmail');
    outlook = createMockMailProvider('outlook', 'Outlook');
    registerProvider('gmail', gmail);
    registerProvider('outlook', outlook);

    gmailAccount = makeAccount({ id: 'acc-gmail', email: 'alice@gmail.com', provider: 'gmail' });
    outlookAccount = makeAccount({ id: 'acc-outlook', email: 'alice@outlook.com', provider: 'outlook' as any });
  });

  it('sync calls the correct provider for each account', async () => {
    const progress = vi.fn();

    const gmailResult = await getProviderForAccount(gmailAccount).sync(gmailAccount, progress);
    const outlookResult = await getProviderForAccount(outlookAccount).sync(outlookAccount, progress);

    expect(gmailResult.historyId).toBe('gmail-history-1');
    expect(outlookResult.historyId).toBe('outlook-history-1');
    expect(gmail._calls.sync).toHaveLength(1);
    expect(outlook._calls.sync).toHaveLength(1);
    expect(progress).toHaveBeenCalledTimes(2); // once per provider
  });

  it('send routes to correct provider', async () => {
    const opts: SendOptions = { to: 'bob@example.com', subject: 'Hello', body: 'Hi Bob' };

    await getProviderForAccount(gmailAccount).send(gmailAccount, opts);
    await getProviderForAccount(outlookAccount).send(outlookAccount, opts);

    expect(gmail._calls.send).toHaveLength(1);
    expect(gmail._calls.send[0][1]).toEqual(opts);
    expect(outlook._calls.send).toHaveLength(1);
    expect(outlook._calls.send[0][1]).toEqual(opts);
  });

  it('draft operations work per-provider', async () => {
    const draftOpts: DraftOptions = { to: 'bob@example.com', subject: 'Draft', body: 'Content' };

    const gmailDraftId = await getProviderForAccount(gmailAccount).createDraft(gmailAccount, draftOpts);
    const outlookDraftId = await getProviderForAccount(outlookAccount).createDraft(outlookAccount, draftOpts);

    expect(gmailDraftId).toBe('gmail-draft-1');
    expect(outlookDraftId).toBe('outlook-draft-1');

    await getProviderForAccount(gmailAccount).updateDraft(gmailAccount, gmailDraftId, draftOpts);
    await getProviderForAccount(outlookAccount).deleteDraft(outlookAccount, outlookDraftId);

    expect(gmail._calls.updateDraft).toHaveLength(1);
    expect(outlook._calls.deleteDraft).toHaveLength(1);
  });

  it('thread actions dispatch to the owning provider', async () => {
    const thread = makeThread({ accountId: 'acc-gmail' });

    await getProviderForAccount(gmailAccount).archive(gmailAccount, thread);
    await getProviderForAccount(gmailAccount).markRead(gmailAccount, thread);
    await getProviderForAccount(gmailAccount).toggleStar(gmailAccount, thread);

    expect(gmail._calls.archive).toHaveLength(1);
    expect(gmail._calls.markRead).toHaveLength(1);
    expect(gmail._calls.toggleStar).toHaveLength(1);
    expect(outlook._calls.archive).toBeUndefined();
  });

  it('fetchMessageBody returns provider-specific content', async () => {
    const gmailBody = await getProviderForAccount(gmailAccount).fetchMessageBody(gmailAccount, 'thread-1');
    const outlookBody = await getProviderForAccount(outlookAccount).fetchMessageBody(outlookAccount, 'thread-2');

    expect(gmailBody.messages[0].body).toBe('Hello from gmail');
    expect(gmailBody.messages[0].messageId).toBe('gmail-msg-1');
    expect(outlookBody.messages[0].body).toBe('Hello from outlook');
    expect(outlookBody.messages[0].messageId).toBe('outlook-msg-1');
  });

  it('attachments handled per-provider', async () => {
    const gmailAtts = await getProviderForAccount(gmailAccount).loadAttachments(gmailAccount, 'thread-1');
    const outlookAtts = await getProviderForAccount(outlookAccount).loadAttachments(outlookAccount, 'thread-2');

    expect(gmailAtts[0].id).toBe('gmail-att-1');
    expect(outlookAtts[0].id).toBe('outlook-att-1');

    const bytes = await getProviderForAccount(gmailAccount).downloadAttachment(gmailAccount, 'msg-1', 'att-1');
    expect(bytes).toEqual(new Uint8Array([0x50, 0x44, 0x46]));
  });

  it('sender photos per provider', async () => {
    const gmailPhotos = await getProviderForAccount(gmailAccount).loadSenderPhotos(gmailAccount, ['alice@example.com']);
    const outlookPhotos = await getProviderForAccount(outlookAccount).loadSenderPhotos(outlookAccount, ['alice@example.com']);

    expect(gmailPhotos['alice@example.com']).toContain('gmail.example.com');
    expect(outlookPhotos['alice@example.com']).toContain('outlook.example.com');
  });

  it('labels are provider-specific', async () => {
    const labels = await getProviderForAccount(outlookAccount).fetchLabels(outlookAccount);
    expect(labels).toEqual([{ id: 'lbl-1', name: 'Work' }]);
    expect(outlook._calls.fetchLabels).toHaveLength(1);
  });
});

describe('Mock Provider — Consumer workflow simulation', () => {
  let mockProvider: ReturnType<typeof createMockMailProvider>;
  let account: Account;

  beforeEach(() => {
    resetRegistry();
    mockProvider = createMockMailProvider('gmail', 'Gmail');
    registerProvider('gmail', mockProvider);
    account = makeAccount();
  });

  it('simulates sync → read thread → reply flow', async () => {
    const provider = getProviderForAccount(account);

    // 1. Sync
    await provider.sync(account);
    expect(mockProvider._calls.sync).toHaveLength(1);

    // 2. Open thread → fetch body + mark read
    const thread = makeThread();
    await provider.markRead(account, thread);
    const body = await provider.fetchMessageBody(account, thread.id);
    expect(body.messages).toHaveLength(1);
    expect(mockProvider._calls.markRead).toHaveLength(1);

    // 3. Reply
    await provider.reply(account, {
      to: body.messages[0].from,
      subject: 'Re: ' + thread.subject,
      body: 'Thanks!',
      inReplyTo: body.messages[0].messageId,
      threadId: thread.id,
    });
    expect(mockProvider._calls.reply).toHaveLength(1);
    expect(mockProvider._calls.reply[0][1].inReplyTo).toBe('gmail-msg-1');
  });

  it('simulates draft → update → send flow', async () => {
    const provider = getProviderForAccount(account);

    // 1. Create draft
    const draftId = await provider.createDraft(account, {
      to: 'bob@example.com',
      subject: 'Important',
      body: 'First version',
    });
    expect(draftId).toBe('gmail-draft-1');

    // 2. Update draft
    await provider.updateDraft(account, draftId, {
      to: 'bob@example.com',
      subject: 'Important',
      body: 'Updated version',
    });

    // 3. Delete draft and send instead
    await provider.deleteDraft(account, draftId);
    await provider.send(account, {
      to: 'bob@example.com',
      subject: 'Important',
      body: 'Final version',
    });

    expect(mockProvider._calls.createDraft).toHaveLength(1);
    expect(mockProvider._calls.updateDraft).toHaveLength(1);
    expect(mockProvider._calls.deleteDraft).toHaveLength(1);
    expect(mockProvider._calls.send).toHaveLength(1);
  });

  it('simulates triage: archive, trash, spam, mute, star', async () => {
    const provider = getProviderForAccount(account);
    const threads = [
      makeThread({ id: 't-1' }),
      makeThread({ id: 't-2' }),
      makeThread({ id: 't-3' }),
      makeThread({ id: 't-4', isStarred: true }),
      makeThread({ id: 't-5' }),
    ];

    await provider.archive(account, threads[0]);
    await provider.trash(account, threads[1]);
    await provider.reportSpam(account, threads[2].id);
    await provider.mute(account, threads[3]);
    const newStarState = await provider.toggleStar(account, threads[4]);

    expect(mockProvider._calls.archive).toHaveLength(1);
    expect(mockProvider._calls.trash).toHaveLength(1);
    expect(mockProvider._calls.reportSpam).toHaveLength(1);
    expect(mockProvider._calls.mute).toHaveLength(1);
    expect(newStarState).toBe(true); // was unstarred, now starred
  });

  it('simulates undo: trash → untrash, archive → unarchive', async () => {
    const provider = getProviderForAccount(account);
    const thread = makeThread();

    await provider.trash(account, thread);
    await provider.untrash(account, thread);
    await provider.archive(account, thread);
    await provider.unarchive(account, thread);

    expect(mockProvider._calls.trash).toHaveLength(1);
    expect(mockProvider._calls.untrash).toHaveLength(1);
    expect(mockProvider._calls.archive).toHaveLength(1);
    expect(mockProvider._calls.unarchive).toHaveLength(1);
  });

  it('simulates attachment download', async () => {
    const provider = getProviderForAccount(account);

    const atts = await provider.loadAttachments(account, 'thread-1');
    expect(atts).toHaveLength(1);
    expect(atts[0].filename).toBe('report.pdf');

    const bytes = await provider.downloadAttachment(account, atts[0].message_id, atts[0].attachment_id);
    expect(bytes.byteLength).toBe(3);
    expect(mockProvider._calls.downloadAttachment[0][2]).toBe('gmail-att-id-1');
  });
});

describe('Mock AuthProvider — Multi-provider auth', () => {
  beforeEach(() => {
    resetAuthRegistry();
  });

  it('registers and retrieves auth providers', () => {
    const google = createMockAuthProvider('gmail', 'Google');
    const microsoft = createMockAuthProvider('outlook', 'Microsoft');
    registerAuthProvider('gmail', google);
    registerAuthProvider('outlook', microsoft);

    expect(getAuthProvider('gmail').displayName).toBe('Google');
    expect(getAuthProvider('outlook').displayName).toBe('Microsoft');
  });

  it('startOAuth returns account with correct provider', async () => {
    const google = createMockAuthProvider('gmail', 'Google');
    const microsoft = createMockAuthProvider('outlook', 'Microsoft');
    registerAuthProvider('gmail', google);
    registerAuthProvider('outlook', microsoft);

    const gmailAccount = await getAuthProvider('gmail').startOAuth();
    const outlookAccount = await getAuthProvider('outlook').startOAuth();

    expect(gmailAccount.email).toBe('user@gmail.com');
    expect(gmailAccount.provider).toBe('gmail');
    expect(outlookAccount.email).toBe('user@outlook.com');
    expect(outlookAccount.provider).toBe('outlook');
  });

  it('refreshToken returns fresh access token', async () => {
    const google = createMockAuthProvider('gmail', 'Google');
    registerAuthProvider('gmail', google);

    const account = makeAccount({ accessToken: 'old-token' });
    const refreshed = await getAuthProvider('gmail').refreshToken(account);

    expect(refreshed.accessToken).toContain('refreshed-');
    expect(refreshed.tokenExpiry).toBeGreaterThan(Date.now());
  });

  it('getScopes returns provider-specific scopes', () => {
    const google = createMockAuthProvider('gmail', 'Google');
    const microsoft = createMockAuthProvider('outlook', 'Microsoft');
    registerAuthProvider('gmail', google);
    registerAuthProvider('outlook', microsoft);

    expect(getAuthProvider('gmail').getScopes()).toContain('gmail.mail.read');
    expect(getAuthProvider('outlook').getScopes()).toContain('outlook.mail.read');
  });

  it('throws for unregistered auth provider', () => {
    expect(() => getAuthProvider('yahoo')).toThrow(/no auth provider registered/i);
  });
});
