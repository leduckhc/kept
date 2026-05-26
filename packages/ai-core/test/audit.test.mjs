import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadSummaryPrompt, createAISettings, createProviderAdapter, createPromptAudit, disabledProvider, supportedProviders } from '../src/index.js';

const thread = { id: 'thr1', subject: 'Invoice schedule', sender: 'mara@example.com', body: 'Can you confirm next week?', receivedAt: '2026-05-25T10:00:00Z' };

test('ai is default-off and audits explicit content disclosure', () => {
  assert.equal(disabledProvider.status, 'off by default');
  assert.ok(supportedProviders.includes('ollama'));
  const audit = createPromptAudit({ provider: 'Ollama', purpose: 'summary', contentDescription: 'subject only' });
  assert.equal(audit.requiresExplicitApproval, true);
});

test('remote providers require a local key reference', () => {
  assert.throws(() => createAISettings({ enabled: true, provider: 'openai' }), /key reference/);
  assert.equal(createAISettings({ enabled: true, provider: 'openai', keyRef: 'keychain://openai' }).provider, 'openai');
});

test('disabled adapter never calls a provider', async () => {
  const adapter = createProviderAdapter(createAISettings());
  const result = await adapter.summarizeThread(thread);
  assert.equal(result.status, 'disabled');
  assert.equal(result.response, null);
});

test('enabled adapter requires approval before exposing prompt', async () => {
  const settings = createAISettings({ enabled: true, provider: 'ollama', model: 'llama3.2' });
  const adapter = createProviderAdapter(settings);
  const result = await adapter.summarizeThread(thread);
  assert.equal(result.status, 'approval_required');
  assert.match(result.prompt.messages[1].content, /Invoice schedule/);
});

test('approved mock summary records audit and avoids real network', async () => {
  const settings = createAISettings({ enabled: true, provider: 'ollama', model: 'llama3.2' });
  let called = false;
  const adapter = createProviderAdapter(settings, { call: async () => { called = true; return { text: 'summary' }; } });
  const result = await adapter.summarizeThread(thread, { approved: true });
  assert.equal(called, true);
  assert.equal(result.status, 'ok');
  assert.equal(result.audit.provider, 'ollama');
});

test('prompt builder scopes content to one selected thread', () => {
  const prompt = buildThreadSummaryPrompt(thread);
  assert.equal(prompt.messages.length, 2);
  assert.match(prompt.contentDescription, /one user-approved thread/);
});
