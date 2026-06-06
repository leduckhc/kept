import type { MailProvider, SyncResult, SendOptions, DraftOptions, MessageBody, AttachmentMeta } from '../provider';
import type { Account } from '../auth';
import type { Thread } from '../store';
import {
  syncInbox,
  markRead, markUnread, archiveThread, unarchiveThread,
  trashThread, untrashThread, toggleStar, blockSender,
  reportSpam, moveToLabel, fetchLabels, muteThread,
  sendEmail, createDraft, updateDraft, deleteDraft, fetchDraftByThread,
  fetchMessageBody, loadAttachments, downloadAttachment,
} from '../gmail';

export class GmailProvider implements MailProvider {
  id = 'gmail' as const;
  displayName = 'Gmail';

  async sync(account: Account, onProgress?: (n: number) => void): Promise<SyncResult> {
    await syncInbox(account, onProgress);
    // syncInbox writes directly to DB, return empty result (consumers read from store)
    return { threads: [], historyId: null };
  }

  async syncIncremental(account: Account, _historyId: string, onProgress?: (n: number) => void): Promise<SyncResult | null> {
    // syncInbox already handles incremental internally
    await syncInbox(account, onProgress);
    return { threads: [], historyId: null };
  }

  async send(account: Account, opts: SendOptions): Promise<void> {
    await sendEmail(account, {
      to: opts.to,
      cc: opts.cc,
      bcc: opts.bcc,
      subject: opts.subject,
      body: opts.body,
      htmlBody: opts.htmlBody,
      inReplyTo: opts.inReplyTo,
      threadId: opts.threadId,
    });
  }

  async reply(account: Account, opts: SendOptions): Promise<void> {
    await this.send(account, opts);
  }

  async createDraft(account: Account, opts: DraftOptions): Promise<string> {
    return createDraft(account, { to: opts.to, cc: opts.cc, subject: opts.subject, body: opts.body, threadId: opts.threadId });
  }

  async updateDraft(account: Account, draftId: string, opts: DraftOptions): Promise<void> {
    await updateDraft(account, draftId, { to: opts.to, cc: opts.cc, subject: opts.subject, body: opts.body, threadId: opts.threadId });
  }

  async deleteDraft(account: Account, draftId: string): Promise<void> {
    await deleteDraft(account, draftId);
  }

  async fetchDraftByThread(account: Account, threadId: string): Promise<{ draftId: string; to: string; cc: string; bcc: string; subject: string; body: string } | null> {
    const draft = await fetchDraftByThread(account, threadId);
    if (!draft) return null;
    return { ...draft, bcc: '' };
  }

  async archive(account: Account, thread: Thread): Promise<void> {
    await archiveThread(account, thread);
  }

  async unarchive(account: Account, thread: Thread): Promise<void> {
    await unarchiveThread(account, thread);
  }

  async trash(account: Account, thread: Thread): Promise<void> {
    await trashThread(account, thread);
  }

  async untrash(account: Account, thread: Thread): Promise<void> {
    await untrashThread(account, thread);
  }

  async markRead(account: Account, thread: Thread): Promise<void> {
    await markRead(account, thread);
  }

  async markUnread(account: Account, thread: Thread): Promise<void> {
    await markUnread(account, thread);
  }

  async toggleStar(account: Account, thread: Thread): Promise<boolean> {
    return toggleStar(account, thread);
  }

  async blockSender(account: Account, thread: Thread): Promise<void> {
    await blockSender(account, thread);
  }

  async reportSpam(account: Account, threadId: string): Promise<void> {
    await reportSpam(account, threadId);
  }

  async moveToLabel(account: Account, threadId: string, labelId: string, removeFromInbox?: boolean): Promise<void> {
    await moveToLabel(account, threadId, labelId, removeFromInbox);
  }

  async fetchLabels(account: Account): Promise<Array<{ id: string; name: string }>> {
    return fetchLabels(account);
  }

  async mute(account: Account, thread: Thread): Promise<void> {
    await muteThread(account, thread);
  }

  async fetchMessageBody(account: Account, threadId: string): Promise<MessageBody> {
    const result = await fetchMessageBody(account, threadId);
    return {
      messages: result.messages.map(m => ({
        from: m.from,
        to: m.to,
        cc: m.cc,
        body: m.body,
        htmlBody: m.htmlBody,
        sanitizedHtml: m.sanitizedHtml,
        receivedAt: m.receivedAt,
        messageId: m.gmailMessageId,
      })),
    };
  }

  async loadAttachments(_account: Account, threadId: string): Promise<AttachmentMeta[]> {
    return loadAttachments(threadId);
  }

  async downloadAttachment(account: Account, messageId: string, attachmentId: string): Promise<Uint8Array> {
    return downloadAttachment(account, messageId, attachmentId);
  }

  async loadSenderPhotos(_account: Account, _emails: string[]): Promise<Record<string, string>> {
    // Gmail uses Google People API for photos — implement later
    return {};
  }
}
