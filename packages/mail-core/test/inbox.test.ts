import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInboxSections,
  groupInboxThreads,
  sampleInboxThreads,
  sampleNewSenders,
} from '../src/index.js';

const NOW = '2026-05-26T12:00:00Z';

const makeThread = (overrides) => ({
  id: 'thread',
  sender: 'Synthetic Sender',
  senderEmail: 'sender@demo.kept.local',
  subject: 'Synthetic subject',
  snippet: 'A synthetic safe inbox preview.',
  receivedAt: NOW,
  isPriority: false,
  isUnread: false,
  isNewSender: false,
  avatarInitials: 'SS',
  avatarColor: '#d9ebe3',
  ...overrides,
});

test('groupInboxThreads extracts priority regardless of date and keeps section order', () => {
  const threads = [
    makeThread({ id: 'today', receivedAt: '2026-05-26T08:00:00Z' }),
    makeThread({ id: 'old-priority', isPriority: true, receivedAt: '2026-05-19T08:00:00Z' }),
    makeThread({ id: 'yesterday', receivedAt: '2026-05-25T23:59:59Z' }),
    makeThread({ id: 'last-week', receivedAt: '2026-05-20T00:00:00Z' }),
  ];

  const grouped = groupInboxThreads(threads, { now: NOW });

  assert.deepEqual(Object.keys(grouped), ['Priority', 'Today', 'Yesterday', 'Last Week']);
  assert.deepEqual(grouped.Priority.map((thread) => thread.id), ['old-priority']);
  assert.deepEqual(grouped.Today.map((thread) => thread.id), ['today']);
  assert.deepEqual(grouped.Yesterday.map((thread) => thread.id), ['yesterday']);
  assert.deepEqual(grouped['Last Week'].map((thread) => thread.id), ['last-week']);
});

test('groupInboxThreads sorts newest-first stably within each section', () => {
  const threads = [
    makeThread({ id: 'same-time-first', receivedAt: '2026-05-26T09:00:00Z' }),
    makeThread({ id: 'newest', receivedAt: '2026-05-26T11:00:00Z' }),
    makeThread({ id: 'same-time-second', receivedAt: '2026-05-26T09:00:00Z' }),
    makeThread({ id: 'oldest', receivedAt: '2026-05-26T01:00:00Z' }),
  ];

  const grouped = groupInboxThreads(threads, { now: NOW });

  assert.deepEqual(grouped.Today.map((thread) => thread.id), [
    'newest',
    'same-time-first',
    'same-time-second',
    'oldest',
  ]);
});

test('groupInboxThreads handles Today, Yesterday, and Last Week UTC boundaries', () => {
  const threads = [
    makeThread({ id: 'today-start', receivedAt: '2026-05-26T00:00:00Z' }),
    makeThread({ id: 'yesterday-end', receivedAt: '2026-05-25T23:59:59Z' }),
    makeThread({ id: 'yesterday-start', receivedAt: '2026-05-25T00:00:00Z' }),
    makeThread({ id: 'last-week-newest-boundary', receivedAt: '2026-05-24T23:59:59Z' }),
    makeThread({ id: 'last-week-oldest-boundary', receivedAt: '2026-05-19T00:00:00Z' }),
    makeThread({ id: 'too-old', receivedAt: '2026-05-18T23:59:59Z' }),
    makeThread({ id: 'future', receivedAt: '2026-05-27T00:00:00Z' }),
  ];

  const grouped = groupInboxThreads(threads, { now: NOW });

  assert.deepEqual(grouped.Today.map((thread) => thread.id), ['today-start']);
  assert.deepEqual(grouped.Yesterday.map((thread) => thread.id), ['yesterday-end', 'yesterday-start']);
  assert.deepEqual(grouped['Last Week'].map((thread) => thread.id), [
    'last-week-newest-boundary',
    'last-week-oldest-boundary',
  ]);
});

test('getInboxSections returns all sections including empty sections', () => {
  const sections = getInboxSections([], { now: NOW });

  assert.deepEqual(
    sections.map((section) => ({ id: section.id, title: section.title, count: section.threads.length })),
    [
      { id: 'priority', title: 'Priority', count: 0 },
      { id: 'today', title: 'Today', count: 0 },
      { id: 'yesterday', title: 'Yesterday', count: 0 },
      { id: 'last-week', title: 'Last Week', count: 0 },
    ],
  );
});

test('sample inbox data covers required fields and uses only synthetic redacted-safe values', () => {
  assert.ok(sampleInboxThreads.length >= 8);
  assert.ok(sampleNewSenders.length >= 4);

  const records = [...sampleInboxThreads, ...sampleNewSenders];
  for (const record of records) {
    assert.equal(typeof record.id, 'string');
    assert.equal(typeof record.sender, 'string');
    assert.match(record.senderEmail, /@(demo\.kept\.local|example\.com)$/);
    assert.equal(typeof record.subject, 'string');
    assert.equal(typeof record.snippet, 'string');
    assert.doesNotMatch(record.snippet, /private|payroll|medical|token|secret/i);
    assert.equal(typeof record.receivedAt, 'string');
    assert.equal(typeof record.isPriority, 'boolean');
    assert.equal(typeof record.isUnread, 'boolean');
    assert.equal(typeof record.isNewSender, 'boolean');
    assert.match(record.avatarInitials, /^[A-Z]{1,3}$/);
    assert.match(record.avatarColor, /^#[0-9a-f]{6}$/i);
    if (record.status !== undefined) assert.match(record.status, /^(new|accepted|blocked)$/);
  }
});

test('sample inbox data renders deterministic sections with injected now', () => {
  const sections = getInboxSections(sampleInboxThreads, { now: NOW });

  assert.deepEqual(sections.map((section) => section.title), ['Priority', 'Today', 'Yesterday', 'Last Week']);
  assert.ok(sections.every((section) => section.threads.length > 0));
});
