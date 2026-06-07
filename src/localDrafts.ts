// localDrafts.ts — Offline-first draft persistence in SQLite
// Drafts are saved locally on every keystroke (debounced), Gmail API sync is secondary.

import { getDb } from './db';
import type { ComposeMode } from './solid/store';

export interface LocalDraft {
  id: string;
  accountId: string;
  gmailDraftId: string | null;
  mode: ComposeMode;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  htmlBody: string;
  threadId: string | null;
  inReplyTo: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Generate a unique local draft ID. */
export function newDraftId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Save or update a local draft. */
export async function saveLocalDraft(draft: LocalDraft): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO local_drafts
      (id, account_id, gmail_draft_id, mode, "to", cc, bcc, subject, body, html_body, thread_id, in_reply_to, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      draft.id,
      draft.accountId,
      draft.gmailDraftId,
      draft.mode,
      draft.to,
      draft.cc,
      draft.bcc,
      draft.subject,
      draft.body,
      draft.htmlBody,
      draft.threadId,
      draft.inReplyTo,
      draft.createdAt,
      draft.updatedAt,
    ]
  );
}

/** Delete a local draft by ID. */
export async function deleteLocalDraft(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM local_drafts WHERE id = ?', [id]);
}

/** Load all local drafts for an account, sorted by updated_at desc. */
export async function loadLocalDrafts(accountId: string): Promise<LocalDraft[]> {
  const db = await getDb();
  type Row = {
    id: string; account_id: string; gmail_draft_id: string | null;
    mode: string; to: string; cc: string; bcc: string;
    subject: string; body: string; html_body: string;
    thread_id: string | null; in_reply_to: string | null;
    created_at: number; updated_at: number;
  };
  const rows = await db.select<Row[]>(
    'SELECT * FROM local_drafts WHERE account_id = ? ORDER BY updated_at DESC',
    [accountId]
  );
  return rows.map(r => ({
    id: r.id,
    accountId: r.account_id,
    gmailDraftId: r.gmail_draft_id,
    mode: r.mode as ComposeMode,
    to: r.to,
    cc: r.cc,
    bcc: r.bcc,
    subject: r.subject,
    body: r.body,
    htmlBody: r.html_body,
    threadId: r.thread_id,
    inReplyTo: r.in_reply_to,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Update the Gmail draft ID for a local draft (after API confirms). */
export async function linkGmailDraft(localId: string, gmailDraftId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE local_drafts SET gmail_draft_id = ? WHERE id = ?',
    [gmailDraftId, localId]
  );
}
