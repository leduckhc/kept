import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromptAudit, disabledProvider, supportedProviders } from '../src/index.js';

test('ai is default-off and audits explicit content disclosure', () => {
  assert.equal(disabledProvider.status, 'off by default');
  assert.ok(supportedProviders.includes('ollama'));
  const audit = createPromptAudit({ provider: 'Ollama', purpose: 'summary', contentDescription: 'subject only' });
  assert.equal(audit.requiresExplicitApproval, true);
});
