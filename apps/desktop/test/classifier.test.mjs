import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyThread } from '../src/classifier.js';

// ---- helpers ----
const makeThread = (overrides = {}) => ({
  senderEmail: 'sender@example.com',
  headers: {},
  ...overrides,
});

// ---- newsletter detection ----

test('classifyThread: List-Unsubscribe header -> newsletter', () => {
  const thread = makeThread({ headers: { 'list-unsubscribe': '<mailto:unsub@news.example.com>' } });
  assert.equal(classifyThread(thread), 'newsletter');
});

test('classifyThread: List-Unsubscribe-Post header -> newsletter', () => {
  const thread = makeThread({ headers: { 'list-unsubscribe-post': 'List-Unsubscribe=One-Click' } });
  assert.equal(classifyThread(thread), 'newsletter');
});

test('classifyThread: List-Id header -> newsletter', () => {
  const thread = makeThread({ headers: { 'list-id': '<weekly.example.com>' } });
  assert.equal(classifyThread(thread), 'newsletter');
});

test('classifyThread: List-Post header -> newsletter', () => {
  const thread = makeThread({ headers: { 'list-post': '<mailto:list@example.com>' } });
  assert.equal(classifyThread(thread), 'newsletter');
});

test('classifyThread: newsletter header takes priority over update domain', () => {
  const thread = makeThread({
    senderEmail: 'noreply@github.com',
    headers: { 'list-unsubscribe': '<mailto:unsub@github.com>' },
  });
  assert.equal(classifyThread(thread), 'newsletter');
});

// ---- update detection by domain ----

test('classifyThread: github.com sender -> update', () => {
  const thread = makeThread({ senderEmail: 'noreply@github.com' });
  assert.equal(classifyThread(thread), 'update');
});

test('classifyThread: github.com sender via angle-bracket format -> update', () => {
  const thread = makeThread({ senderEmail: 'GitHub <noreply@github.com>' });
  assert.equal(classifyThread(thread), 'update');
});

test('classifyThread: stripe.com sender -> update', () => {
  const thread = makeThread({ senderEmail: 'receipts@stripe.com' });
  assert.equal(classifyThread(thread), 'update');
});

test('classifyThread: vercel.com sender -> update', () => {
  const thread = makeThread({ senderEmail: 'notifications@vercel.com' });
  assert.equal(classifyThread(thread), 'update');
});

test('classifyThread: linear.app sender -> update', () => {
  const thread = makeThread({ senderEmail: 'team@linear.app' });
  assert.equal(classifyThread(thread), 'update');
});

test('classifyThread: sentry.io sender -> update', () => {
  const thread = makeThread({ senderEmail: 'noreply@sentry.io' });
  assert.equal(classifyThread(thread), 'update');
});

// ---- primary ----

test('classifyThread: personal email -> primary', () => {
  const thread = makeThread({ senderEmail: 'friend@gmail.com' });
  assert.equal(classifyThread(thread), 'primary');
});

test('classifyThread: no headers and unknown domain -> primary', () => {
  const thread = makeThread({ senderEmail: 'alice@randomco.io', headers: {} });
  assert.equal(classifyThread(thread), 'primary');
});

test('classifyThread: missing senderEmail -> primary', () => {
  const thread = makeThread({ senderEmail: '' });
  assert.equal(classifyThread(thread), 'primary');
});

test('classifyThread: missing headers object -> primary (defaults)', () => {
  const thread = { senderEmail: 'alice@example.com' };
  assert.equal(classifyThread(thread), 'primary');
});
