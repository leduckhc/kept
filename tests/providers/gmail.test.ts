import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MailProvider } from '../../src/provider';
import type { Account } from '../../src/auth';
import type { Thread } from '../../src/store';

vi.mock('../../src/gmail', () => ({
  syncInbox: vi.fn().mockResolvedValue(undefined),
  markRead: vi.fn().mockResolvedValue(undefined),
  markUnread: vi.fn().mockResolvedValue(undefined),
  archiveThread: vi.fn().mockResolvedValue(undefined),
  unarchiveThread: vi.fn().mockResolvedValue(undefined),
  trashThread: vi.fn().mockResolvedValue(undefined),
  untrashThread: vi.fn().mockResolvedValue(undefined),
  toggleStar: vi.fn().mockResolvedValue(true),
  blockSender: vi.fn().mockResolvedValue(undefined),
  reportSpam: vi.fn().mockResolvedValue(undefined),
  moveToLabel: vi.fn().mockResolvedValue(undefined),
  fetchLabels: vi.fn().mockResolvedValue([]),
  muteThread: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  createDraft: vi.fn().mockResolvedValue('draft-123'),
  updateDraft: vi.fn().mockResolvedValue(undefined),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
  fetchDraftByThread: vi.fn().mockResolvedValue(null),
  fetchMessageBody: vi.fn().mockResolvedValue({ messages: [], lastMessageId: null }),
  loadAttachments: vi.fn().mockResolvedValue([]),
  downloadAttachment: vi.fn().mockResolvedValue(new Uint8Array()),
}));

import { GmailProvider } from '../../src/providers/gmail';
import * as gmail from '../../src/gmail';

const mockAccount: Account = {
  id: 'acc-1',
  email: 'test@gmail.com',
  provider: 'gmail',
  accessToken: 'token',
  refreshToken: 'refresh',
  tokenExpiry: Date.now() + 3600000,
  signature: '',
  colorIndex: 0,
};

const mockThread: Thread = {
  id: 'thread-1',
  accountId: 'acc-1',
  gmailThreadId: 'gt-1',
  subject: 'Test',
  snippet: 'Hello',
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
};

describe('GmailProvider', () => {
  let provider: GmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GmailProvider();
  });

  it('has correct id and displayName', () => {
    expect(provider.id).toBe('gmail');
    expect(provider.displayName).toBe('Gmail');
  });

  it('implements MailProvider interface', () => {
    // Type-level check: assigning to MailProvider should compile
    const _mp: MailProvider = provider;
    expect(_mp).toBeDefined();
  });

  it('sync delegates to syncInbox', async () => {
    const onProgress = vi.fn();
    const result = await provider.sync(mockAccount, onProgress);

    expect(gmail.syncInbox).toHaveBeenCalledWith(mockAccount, onProgress);
    expect(result).toEqual({ threads: [], historyId: null });
  });

  it('syncIncremental delegates to syncInbox', async () => {
    const result = await provider.syncIncremental(mockAccount, 'history-123');

    expect(gmail.syncInbox).toHaveBeenCalledWith(mockAccount, undefined);
    expect(result).toEqual({ threads: [], historyId: null });
  });

  it('send delegates to sendEmail', async () => {
    const opts = { to: 'bob@example.com', subject: 'Hi', body: 'Hello' };
    await provider.send(mockAccount, opts);

    expect(gmail.sendEmail).toHaveBeenCalledWith(mockAccount, {
      to: 'bob@example.com',
      cc: undefined,
      bcc: undefined,
      subject: 'Hi',
      body: 'Hello',
      htmlBody: undefined,
      inReplyTo: undefined,
      threadId: undefined,
    });
  });

  it('reply delegates to send', async () => {
    const opts = { to: 'bob@example.com', subject: 'Re: Hi', body: 'Reply', inReplyTo: 'msg-1', threadId: 'thread-1' };
    await provider.reply(mockAccount, opts);

    expect(gmail.sendEmail).toHaveBeenCalled();
  });

  it('createDraft delegates and returns draft id', async () => {
    const result = await provider.createDraft(mockAccount, { to: 'bob@example.com', subject: 'Draft', body: 'Content' });
    expect(result).toBe('draft-123');
    expect(gmail.createDraft).toHaveBeenCalled();
  });

  it('archive delegates to archiveThread', async () => {
    await provider.archive(mockAccount, mockThread);
    expect(gmail.archiveThread).toHaveBeenCalledWith(mockAccount, mockThread);
  });

  it('trash delegates to trashThread', async () => {
    await provider.trash(mockAccount, mockThread);
    expect(gmail.trashThread).toHaveBeenCalledWith(mockAccount, mockThread);
  });

  it('markRead delegates to markRead', async () => {
    await provider.markRead(mockAccount, mockThread);
    expect(gmail.markRead).toHaveBeenCalledWith(mockAccount, mockThread);
  });

  it('toggleStar delegates to toggleStar', async () => {
    const result = await provider.toggleStar(mockAccount, mockThread);
    expect(result).toBe(true);
    expect(gmail.toggleStar).toHaveBeenCalledWith(mockAccount, mockThread);
  });

  it('fetchMessageBody maps gmailMessageId to messageId', async () => {
    vi.mocked(gmail.fetchMessageBody).mockResolvedValueOnce({
      messages: [{
        from: 'alice@example.com',
        to: 'bob@example.com',
        cc: '',
        body: 'Hello',
        htmlBody: null,
        sanitizedHtml: null,
        receivedAt: 1000,
        gmailMessageId: 'gm-123',
      }],
      lastMessageId: 'gm-123',
    });

    const result = await provider.fetchMessageBody(mockAccount, 'thread-1');
    expect(result.messages[0].messageId).toBe('gm-123');
    expect((result.messages[0] as any).gmailMessageId).toBeUndefined();
  });

  it('loadAttachments delegates with only threadId', async () => {
    await provider.loadAttachments(mockAccount, 'thread-1');
    expect(gmail.loadAttachments).toHaveBeenCalledWith('thread-1');
  });

  it('loadSenderPhotos returns empty object', async () => {
    const result = await provider.loadSenderPhotos(mockAccount, ['alice@example.com']);
    expect(result).toEqual({});
  });
});
