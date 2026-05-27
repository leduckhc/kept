import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildThreadSummaryPrompt,
  createAIKeychainStore,
  createAISettings,
  createApprovalEnvelope,
  createMemoryKeychain,
  createProviderAdapter,
  createPromptAudit,
  disabledProvider,
  supportedProviders,
} from '../src/index.js';

const thread = { id: 'thr1', subject: 'Invoice schedule', sender: 'mara@example.com', body: 'Can you confirm next week?', receivedAt: '2026-05-25T10:00:00Z' };

function createMemoryAuditStore({ fail = false } = {}) {
  const entries = [];
  return {
    entries,
    async recordAiAudit(entry) {
      if (fail) throw new Error('audit disk unavailable');
      entries.push(entry);
      return entry;
    },
  };
}

test('ai is default-off and audits explicit content disclosure', () => {
  assert.equal(disabledProvider.status, 'off by default');
  assert.ok(supportedProviders.includes('ollama'));
  const audit = createPromptAudit({ provider: 'Ollama', purpose: 'summary', contentDescription: 'subject only' });
  assert.equal(audit.requiresExplicitApproval, true);
});

test('remote providers require a local key reference', () => {
  assert.throws(() => createAISettings({ enabled: true, provider: 'openai' }), /key reference/);
  assert.throws(() => createAISettings({ enabled: true, provider: 'openai', keyRef: 'sk-plaintext' }), /keychain:\/\//);
  assert.equal(createAISettings({ enabled: true, provider: 'openai', keyRef: 'keychain://openai' }).provider, 'openai');
  assert.equal(createAISettings({ enabled: true, provider: 'ollama' }).provider, 'ollama');
});

test('keychain AI key store keeps raw provider keys out of settings', async () => {
  const keychain = createMemoryKeychain();
  const keyStore = createAIKeychainStore({ keychain });
  const saved = await keyStore.saveProviderKey('openai', 'provider-test-value');

  assert.deepEqual(saved, { provider: 'openai', keyRef: 'keychain://kept.ai.provider-keys/openai', stored: 'keychain' });
  assert.equal(await keyStore.hasProviderKey('openai'), true);
  assert.equal(await keyStore.loadProviderKey('openai'), 'provider-test-value');
  assert.doesNotMatch(JSON.stringify(createAISettings({ enabled: true, provider: 'openai', model: 'gpt-4o-mini', keyRef: saved.keyRef })), /provider-test-value/);
});

test('disabled adapter never calls a provider', async () => {
  let called = false;
  const adapter = createProviderAdapter(createAISettings(), { call: async () => { called = true; } });
  const result = await adapter.summarizeThread(thread, { approved: true });
  assert.equal(result.status, 'disabled');
  assert.equal(result.response, null);
  assert.equal(called, false);
});

test('missing provider and missing key block remote calls', async () => {
  let called = false;
  const missingProvider = createProviderAdapter({ enabled: true, provider: null, model: 'gpt', keyRef: 'keychain://openai' }, { call: async () => { called = true; } });
  assert.equal((await missingProvider.summarizeThread(thread, { approved: true })).status, 'provider_missing');

  const rawKeyRef = createProviderAdapter({ enabled: true, provider: 'openai', model: 'gpt', keyRef: 'sk-plaintext' }, { call: async () => { called = true; }, keyStore: { hasProviderKey: async () => true } });
  assert.equal((await rawKeyRef.summarizeThread(thread, { approved: true })).status, 'key_missing');

  const missingKeyStore = createProviderAdapter({ enabled: true, provider: 'openai', model: 'gpt', keyRef: 'keychain://openai' }, { call: async () => { called = true; } });
  assert.equal((await missingKeyStore.summarizeThread(thread, { approved: true })).status, 'key_missing');

  const missingKey = createProviderAdapter({ enabled: true, provider: 'openai', model: 'gpt', keyRef: 'keychain://openai' }, { call: async () => { called = true; }, keyStore: { hasProviderKey: async () => false } });
  assert.equal((await missingKey.summarizeThread(thread, { approved: true })).status, 'key_missing');
  assert.equal(called, false);
});

test('remote provider calls fail closed when audit preflight store is missing', async () => {
  const keyStore = { hasProviderKey: async () => true };
  let called = false;
  const settings = createAISettings({ enabled: true, provider: 'openai', model: 'gpt-4o-mini', keyRef: 'keychain://openai' });
  const adapter = createProviderAdapter(settings, { keyStore, call: async () => { called = true; } });
  const result = await adapter.summarizeThread(thread, { approved: true });

  assert.equal(result.status, 'audit_preflight_failed');
  assert.match(result.error, /audit store unavailable/);
  assert.equal(called, false);
});

test('enabled adapter requires approval before exposing prompt and does not call provider when denied', async () => {
  const settings = createAISettings({ enabled: true, provider: 'ollama', model: 'llama3.2' });
  let called = false;
  const adapter = createProviderAdapter(settings, { call: async () => { called = true; } });
  const result = await adapter.summarizeThread(thread, { approved: false });
  assert.equal(result.status, 'approval_denied');
  assert.match(result.envelope.payloadPreview, /Invoice schedule/);
  assert.match(result.envelope.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(called, false);
});

test('approval envelope captures provider, model, action, selected ids, exact payload preview, hash, and state', () => {
  const prompt = buildThreadSummaryPrompt(thread);
  const envelope = createApprovalEnvelope({ settings: { provider: 'openai', model: 'gpt-4o-mini' }, action: prompt.purpose, selectedIds: [thread.id], payload: prompt, approved: true });

  assert.equal(envelope.provider, 'openai');
  assert.equal(envelope.model, 'gpt-4o-mini');
  assert.equal(envelope.action, 'Summarize selected local thread');
  assert.deepEqual(envelope.selectedIds, ['thr1']);
  assert.equal(envelope.approvalState, 'approved');
  assert.match(envelope.payloadPreview, /Subject: Invoice schedule/);
  assert.match(envelope.payloadHash, /^[a-f0-9]{64}$/);
});

test('approved provider call persists audit preflight and result', async () => {
  const auditStore = createMemoryAuditStore();
  const settings = createAISettings({ enabled: true, provider: 'ollama', model: 'llama3.2' });
  let called = false;
  const adapter = createProviderAdapter(settings, { auditStore, call: async () => { called = true; return { text: 'summary' }; } });
  const result = await adapter.summarizeThread(thread, { approved: true });

  assert.equal(called, true);
  assert.equal(result.status, 'ok');
  assert.equal(auditStore.entries.length, 2);
  assert.equal(auditStore.entries[0].approvalState, 'approved');
  assert.equal(auditStore.entries[0].result, null);
  assert.deepEqual(auditStore.entries[1].result, { text: 'summary' });
});

test('audit preflight failure blocks remote provider call', async () => {
  const settings = createAISettings({ enabled: true, provider: 'ollama', model: 'llama3.2' });
  let called = false;
  const adapter = createProviderAdapter(settings, { auditStore: createMemoryAuditStore({ fail: true }), call: async () => { called = true; } });
  const result = await adapter.summarizeThread(thread, { approved: true });

  assert.equal(result.status, 'audit_preflight_failed');
  assert.match(result.error, /audit disk unavailable/);
  assert.equal(called, false);
});

test('provider error is captured in audit without leaking API keys or raw bodies', async () => {
  const auditStore = createMemoryAuditStore();
  const keychain = createMemoryKeychain();
  const keyStore = createAIKeychainStore({ keychain });
  const saved = await keyStore.saveProviderKey('openai', 'RAW_OPENAI_KEY');
  const settings = createAISettings({ enabled: true, provider: 'openai', model: 'gpt-4o-mini', keyRef: saved.keyRef });
  const adapter = createProviderAdapter(settings, { auditStore, keyStore, call: async () => { throw new Error('upstream 500 for RAW_OPENAI_KEY and body Can you confirm next week?'); } });
  const result = await adapter.summarizeThread(thread, { approved: true });

  assert.equal(result.status, 'provider_error');
  assert.doesNotMatch(result.error, /RAW_OPENAI_KEY|Can you confirm next week/);
  assert.doesNotMatch(auditStore.entries.at(-1).error, /RAW_OPENAI_KEY|Can you confirm next week/);
  assert.match(auditStore.entries.at(-1).error, /upstream 500/);
});

test('prompt builder scopes content to one selected thread', () => {
  const prompt = buildThreadSummaryPrompt(thread);
  assert.equal(prompt.messages.length, 2);
  assert.match(prompt.contentDescription, /one user-approved thread/);
});
