import { describe, it, expect } from 'vitest';
import type { MailProvider, SyncResult, SendOptions, MessageBody, AttachmentMeta } from '../src/provider';

describe('MailProvider interface', () => {
  it('can be implemented by a mock provider', () => {
    const mock: MailProvider = {
      id: 'mock',
      displayName: 'Mock Provider',
      sync: async () => ({ threads: [], historyId: '1' }),
      syncIncremental: async () => ({ threads: [], historyId: '2' }),
      send: async () => {},
      reply: async () => {},
      createDraft: async () => 'draft-1',
      updateDraft: async () => {},
      deleteDraft: async () => {},
      fetchDraftByThread: async () => null,
      archive: async () => {},
      unarchive: async () => {},
      trash: async () => {},
      untrash: async () => {},
      markRead: async () => {},
      markUnread: async () => {},
      toggleStar: async () => true,
      blockSender: async () => {},
      reportSpam: async () => {},
      moveToLabel: async () => {},
      fetchLabels: async () => [],
      mute: async () => {},
      fetchMessageBody: async () => ({ messages: [] }),
      loadAttachments: async () => [],
      downloadAttachment: async () => new Uint8Array(),
      loadSenderPhotos: async () => ({}),
    };
    expect(mock.id).toBe('mock');
    expect(typeof mock.sync).toBe('function');
    expect(typeof mock.send).toBe('function');
  });
});
