import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLocalReadState,
  createLocalReadStateStore,
  createMemoryReadStateStore,
  createThreadReaderController,
  createThreadSummaryActionController,
  formatAttachmentMeta,
  hasRemoteImages,
  normalizeReaderThread,
  safeGmailThreadUrl,
} from '../src/thread-reader.js';

const baseThread = {
  id: 'thr_local',
  sender: 'Mara Vale',
  senderEmail: 'mara@example.com',
  recipients: ['milan@example.com', { name: 'Iris', email: 'iris@example.com' }],
  subject: 'Dinner packet',
  receivedAt: '2026-05-27T12:00:00Z',
  body: 'Local body for the reader.',
  attachments: [{ id: 'att_1', filename: 'menu.pdf', mimeType: 'application/pdf', byteSize: 2048 }],
  isUnread: true,
};

test('normalizeReaderThread exposes subject sender recipients date body and attachment metadata', () => {
  const reader = normalizeReaderThread(baseThread);

  assert.equal(reader.subject, 'Dinner packet');
  assert.equal(reader.sender.label, 'Mara Vale <mara@example.com>');
  assert.deepEqual(reader.recipients.map((recipient) => recipient.label), ['milan@example.com', 'Iris <iris@example.com>']);
  assert.equal(reader.messages[0].body, 'Local body for the reader.');
  assert.equal(reader.messages[0].dateTime, '2026-05-27T12:00:00Z');
  assert.equal(formatAttachmentMeta(reader.messages[0].attachments[0]), 'menu.pdf · application/pdf · 2 KB');
});

test('normalizeReaderThread handles missing body, html-only body, long body, and multi-message order', () => {
  const longBody = 'Long '.repeat(700);
  const reader = normalizeReaderThread({
    id: 'thr_multi',
    subject: '',
    sender: '',
    messages: [
      { id: 'newer', sender: 'n@example.com', recipients: [], htmlBody: '<p>Hello <strong>HTML</strong></p>', receivedAt: '2026-05-27T13:00:00Z' },
      { id: 'older', sender: 'o@example.com', recipients: [], body: '', receivedAt: '2026-05-27T12:00:00Z' },
      { id: 'long', sender: 'l@example.com', recipients: [], body: longBody, receivedAt: '2026-05-27T14:00:00Z' },
    ],
  });

  assert.deepEqual(reader.messages.map((message) => message.id), ['older', 'newer', 'long']);
  assert.equal(reader.messages[0].body, 'No local body saved for this message.');
  assert.equal(reader.messages[1].body, 'Hello HTML');
  assert.equal(reader.messages[2].body, longBody.trim());
});

test('controller opens rows by click or keyboard, marks local unread read, and restores focus on back', () => {
  const store = createMemoryReadStateStore({ thr_local: false });
  const focused = [];
  const controller = createThreadReaderController({
    threads: [baseThread],
    readStateStore: store,
    focusRow: (rowId) => focused.push(rowId),
  });

  const clickOpened = controller.openFromRowClick({ threadId: 'thr_local', rowId: 'row-thr_local' });
  assert.equal(clickOpened.reader.subject, 'Dinner packet');
  assert.equal(store.load().thr_local, true);

  controller.closeReader();
  assert.deepEqual(focused, ['row-thr_local']);

  const keyEvent = { key: 'Enter', preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
  controller.openFromRowKey(keyEvent, { threadId: 'thr_local', rowId: 'row-thr_local' });
  assert.equal(keyEvent.preventDefaultCalled, true);
  assert.equal(controller.currentView().mode, 'reader');
});

test('applyLocalReadState persists local read/unread without mutating source threads', () => {
  const source = [{ ...baseThread, isUnread: true }];
  const applied = applyLocalReadState(source, { thr_local: true });

  assert.equal(applied[0].isUnread, false);
  assert.equal(source[0].isUnread, true);
});

test('createLocalReadStateStore round-trips local read state and ignores corrupt storage', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const store = createLocalReadStateStore(storage, 'test.readState');

  store.save({ thr_local: true, thr_other: false });

  assert.deepEqual(store.load(), { thr_local: true, thr_other: false });

  values.set('test.readState', '{not json');
  assert.deepEqual(store.load(), {});
});

test('safeGmailThreadUrl only creates token-free Gmail links for Gmail thread identifiers', () => {
  assert.equal(safeGmailThreadUrl({ source: 'gmail', providerThreadId: 'abc123' }), 'https://mail.google.com/mail/u/0/#inbox/abc123');
  assert.equal(safeGmailThreadUrl({ source: 'gmail', providerMessageId: 'msg-1' }), 'https://mail.google.com/mail/u/0/#inbox/msg-1');
  assert.equal(safeGmailThreadUrl({ source: 'local', providerThreadId: 'abc123' }), null);
  assert.equal(safeGmailThreadUrl({ source: 'gmail', providerThreadId: 'ya29.secret' }), null);
});

test('summary action prepares an approval preview, cancels without provider calls, and approves only the exact preview hash', async () => {
  const calls = [];
  const adapter = {
    async summarizeThread(thread, options = {}) {
      calls.push({ thread, options });
      return options.approved
        ? { status: 'ok', envelope: { payloadHash: 'hash-1' }, response: { text: 'Summary for dinner packet.' } }
        : { status: 'approval_denied', envelope: { provider: 'ollama', model: 'llama3.2', action: 'Summarize selected local thread', payloadPreview: '{"messages":[]}', payloadHash: 'hash-1' } };
    },
  };
  const controller = createThreadSummaryActionController({ threads: [baseThread], adapter });

  const preview = await controller.requestSummary('thr_local');
  assert.equal(preview.status, 'approval_required');
  assert.deepEqual(preview.approval, {
    provider: 'ollama',
    model: 'llama3.2',
    action: 'Summarize selected local thread',
    selectedThreadId: 'thr_local',
    payloadPreview: '{"messages":[]}',
    payloadHash: 'hash-1',
  });

  assert.equal(controller.cancelSummary().status, 'cancelled');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.approved, false);

  await controller.requestSummary('thr_local');
  const approved = await controller.approveSummary('hash-1');
  assert.equal(approved.status, 'ok');
  assert.equal(approved.summary, 'Summary for dinner packet.');
  assert.equal(calls.at(-1).options.approved, true);

  await controller.requestSummary('thr_local');
  const staleApproval = await controller.approveSummary('different-hash');
  assert.equal(staleApproval.status, 'approval_mismatch');
  assert.equal(calls.filter((call) => call.options.approved).length, 1);
});

test('hasRemoteImages detects remote img src and ignores local images and non-image tags', () => {
  assert.equal(hasRemoteImages('<img src="https://tracker.example.com/pixel.gif">'), true);
  assert.equal(hasRemoteImages('<img src="http://cdn.example.com/header.png">'), true);
  assert.equal(hasRemoteImages('<img src="https://example.com/a.jpg" alt="logo">'), true);
  assert.equal(hasRemoteImages('<p>No images here.</p>'), false);
  assert.equal(hasRemoteImages('<img src="cid:part1.2" alt="inline attachment">'), false);
  assert.equal(hasRemoteImages(''), false);
  assert.equal(hasRemoteImages(null), false);
  assert.equal(hasRemoteImages(undefined), false);
});

test('normalizeReaderThread sets remoteImagesBlocked on messages that contain remote images', () => {
  const htmlThread = {
    id: 'thr_img',
    sender: 'Promo Bot',
    senderEmail: 'promo@example.com',
    subject: 'Big sale!',
    receivedAt: '2026-05-27T12:00:00Z',
    htmlBody: '<p>Check this out!</p><img src="https://tracker.example.com/pixel.gif">',
  };
  const textThread = {
    id: 'thr_text',
    sender: 'Promo Bot',
    senderEmail: 'promo@example.com',
    subject: 'Big sale!',
    receivedAt: '2026-05-27T12:00:00Z',
    body: 'Just plain text, no images.',
  };

  const imgReader = normalizeReaderThread(htmlThread);
  assert.equal(imgReader.messages[0].remoteImagesBlocked, true);

  const textReader = normalizeReaderThread(textThread);
  assert.equal(textReader.messages[0].remoteImagesBlocked, false);
});
