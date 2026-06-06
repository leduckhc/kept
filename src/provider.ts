import type { Account } from './auth';
import type { Thread } from './store';

export interface SyncResult {
  threads: Array<{
    id: string;
    subject: string;
    snippet: string;
    senderName: string;
    senderEmail: string;
    receivedAt: number;
    isUnread: boolean;
    hasAttachment: boolean;
    providerThreadId: string;
    messageCount: number;
    label: string;
  }>;
  historyId: string | null;
}

export interface SendOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface DraftOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  threadId?: string;
}

export interface MessageBody {
  messages: Array<{
    from: string;
    to: string;
    cc: string;
    body: string;
    htmlBody: string | null;
    sanitizedHtml: string | null;
    receivedAt: number;
    messageId: string;
  }>;
}

export interface AttachmentMeta {
  id: string;
  message_id: string;
  thread_id: string;
  account_id: string;
  filename: string;
  mime_type: string;
  size: number;
  attachment_id: string;
}

export interface MailProvider {
  id: string;
  displayName: string;

  // Sync
  sync(account: Account, onProgress?: (n: number) => void): Promise<SyncResult>;
  syncIncremental(account: Account, historyId: string, onProgress?: (n: number) => void): Promise<SyncResult | null>;

  // Compose
  send(account: Account, opts: SendOptions): Promise<void>;
  reply(account: Account, opts: SendOptions): Promise<void>;
  createDraft(account: Account, opts: DraftOptions): Promise<string>;
  updateDraft(account: Account, draftId: string, opts: DraftOptions): Promise<void>;
  deleteDraft(account: Account, draftId: string): Promise<void>;
  fetchDraftByThread(account: Account, threadId: string): Promise<{ draftId: string; to: string; cc: string; bcc: string; subject: string; body: string } | null>;

  // Thread actions
  archive(account: Account, thread: Thread): Promise<void>;
  unarchive(account: Account, thread: Thread): Promise<void>;
  trash(account: Account, thread: Thread): Promise<void>;
  untrash(account: Account, thread: Thread): Promise<void>;
  markRead(account: Account, thread: Thread): Promise<void>;
  markUnread(account: Account, thread: Thread): Promise<void>;
  toggleStar(account: Account, thread: Thread): Promise<boolean>;
  blockSender(account: Account, thread: Thread): Promise<void>;
  reportSpam(account: Account, threadId: string): Promise<void>;
  moveToLabel(account: Account, threadId: string, labelId: string, removeFromInbox?: boolean): Promise<void>;
  fetchLabels(account: Account): Promise<Array<{ id: string; name: string }>>;
  mute(account: Account, thread: Thread): Promise<void>;

  // Message content
  fetchMessageBody(account: Account, threadId: string): Promise<MessageBody>;
  loadAttachments(account: Account, threadId: string): Promise<AttachmentMeta[]>;
  downloadAttachment(account: Account, messageId: string, attachmentId: string): Promise<Uint8Array>;

  // Contacts
  loadSenderPhotos(account: Account, emails: string[]): Promise<Record<string, string>>;
}
