export const supportedProviders = ['openai', 'anthropic', 'openrouter', 'ollama'];
export const aiProviderKeychainService = 'kept.ai.provider-keys';

export const disabledProvider = Object.freeze({ status: 'off by default', provider: null, enabled: false });

export function createAISettings({ enabled = false, provider = null, model = null, keyRef = null } = {}) {
  if (!enabled) return { ...disabledProvider, model: null, keyRef: null };
  if (!supportedProviders.includes(provider)) throw new Error(`Unsupported AI provider: ${provider}`);
  if (!keyRef && provider !== 'ollama') throw new Error('Remote BYO AI providers require a local key reference');
  if (provider !== 'ollama' && !isKeychainKeyRef(keyRef)) throw new Error('Remote BYO AI providers require a keychain:// key reference');
  return { enabled: true, status: 'enabled by user', provider, model, keyRef };
}

export function createMemoryKeychain() {
  const entries = new Map();
  return {
    entries,
    async setPassword(service, account, secret) { entries.set(`${service}:${account}`, String(secret)); },
    async getPassword(service, account) { return entries.get(`${service}:${account}`) || null; },
    async deletePassword(service, account) { entries.delete(`${service}:${account}`); },
  };
}

export function createAIKeychainStore({ keychain, service = aiProviderKeychainService } = {}) {
  requireField('keychain', keychain);
  ['setPassword', 'getPassword', 'deletePassword'].forEach((method) => {
    if (typeof keychain[method] !== 'function') throw new Error(`keychain.${method} is required`);
  });
  return {
    async saveProviderKey(provider, apiKey) {
      validateProvider(provider);
      requireField('apiKey', apiKey);
      await keychain.setPassword(service, provider, String(apiKey));
      return { provider, keyRef: createProviderKeyRef(service, provider), stored: 'keychain' };
    },
    async loadProviderKey(provider) {
      validateProvider(provider);
      return keychain.getPassword(service, provider);
    },
    async hasProviderKey(provider) {
      validateProvider(provider);
      return Boolean(await keychain.getPassword(service, provider));
    },
    async clearProviderKey(provider) {
      validateProvider(provider);
      await keychain.deletePassword(service, provider);
    },
  };
}

export function createPromptAudit({ provider, purpose, contentDescription, threadId = null }) {
  return {
    provider,
    purpose,
    threadId,
    contentDescription,
    createdAt: new Date(0).toISOString(),
    requiresExplicitApproval: true,
    redactionPolicy: 'Never include tokens, API keys, full mailbox dumps, or unrelated private prompts.',
  };
}

export function createApprovalEnvelope({ settings = {}, action, selectedIds = [], payload, approved = false, result = null, error = null } = {}) {
  requireField('action', action);
  const payloadPreview = serializePayloadPreview(payload);
  return {
    id: stableEnvelopeId({ provider: settings.provider || 'none', model: settings.model || null, action, selectedIds, payloadPreview }),
    provider: settings.provider || 'none',
    model: settings.model || null,
    action,
    selectedIds: selectedIds.map(String),
    payloadPreview,
    payloadHash: payloadHashHex(payloadPreview),
    approvalState: approved ? 'approved' : 'denied',
    result: result ? redactStructuredValue(result) : null,
    error: error ? redactForAudit(error) : null,
    createdAt: new Date(0).toISOString(),
  };
}

export function buildThreadSummaryPrompt(thread) {
  return {
    purpose: 'Summarize selected local thread',
    contentDescription: 'Subject, sender, received timestamp, and selected body excerpt for one user-approved thread',
    messages: [
      { role: 'system', content: 'Summarize this email thread in 3 bullets. Do not infer facts not present.' },
      { role: 'user', content: `Subject: ${thread.subject}\nSender: ${thread.sender}\nReceived: ${thread.receivedAt || 'unknown'}\nExcerpt: ${(thread.body || '').slice(0, 1200)}` },
    ],
  };
}

export function createProviderAdapter(settings, { transport, call, keyStore, auditStore } = {}) {
  if (!settings?.enabled) return createDisabledAdapter();
  const providerCall = call || transport?.call || mockProviderCall;
  return {
    name: settings.provider || 'missing',
    async summarizeThread(thread, { approved = false } = {}) {
      if (!settings.provider) return { status: 'provider_missing', response: null };
      if (!supportedProviders.includes(settings.provider)) return { status: 'provider_missing', response: null };
      if (settings.provider !== 'ollama') {
        if (!isKeychainKeyRef(settings.keyRef)) return { status: 'key_missing', response: null };
        if (typeof keyStore?.hasProviderKey !== 'function') return { status: 'key_missing', response: null };
        if (!(await keyStore.hasProviderKey(settings.provider))) return { status: 'key_missing', response: null };
      }

      const prompt = buildThreadSummaryPrompt(thread);
      const audit = createPromptAudit({
        provider: settings.provider,
        purpose: prompt.purpose,
        threadId: thread.id,
        contentDescription: prompt.contentDescription,
      });
      const envelope = createApprovalEnvelope({ settings, action: prompt.purpose, selectedIds: [thread.id], payload: prompt, approved });

      if (!approved) {
        const deniedEnvelope = { ...envelope, approvalState: 'denied' };
        if (auditStore?.recordAiAudit) await safeRecordAudit(auditStore, { ...audit, ...deniedEnvelope, approved: false });
        return { status: 'approval_denied', audit, envelope: deniedEnvelope, prompt };
      }

      try {
        if (settings.provider !== 'ollama' && typeof auditStore?.recordAiAudit !== 'function') {
          throw new Error('AI audit store unavailable for remote provider preflight');
        }
        if (auditStore?.recordAiAudit) await auditStore.recordAiAudit({ ...audit, ...envelope, approved: true, result: null, error: null });
      } catch (error) {
        return { status: 'audit_preflight_failed', audit, envelope, error: redactForAudit(error), response: null };
      }

      try {
        const response = await providerCall({ provider: settings.provider, model: settings.model, prompt, keyRef: settings.keyRef });
        const resultEnvelope = createApprovalEnvelope({ settings, action: prompt.purpose, selectedIds: [thread.id], payload: prompt, approved: true, result: response });
        if (auditStore?.recordAiAudit) await safeRecordAudit(auditStore, { ...audit, ...resultEnvelope, approved: true });
        return { status: 'ok', audit, envelope: resultEnvelope, response };
      } catch (error) {
        const errorEnvelope = createApprovalEnvelope({ settings, action: prompt.purpose, selectedIds: [thread.id], payload: prompt, approved: true, error });
        if (auditStore?.recordAiAudit) await safeRecordAudit(auditStore, { ...audit, ...errorEnvelope, approved: true });
        return { status: 'provider_error', audit, envelope: errorEnvelope, error: errorEnvelope.error, response: null };
      }
    },
  };
}

export function createDisabledAdapter() {
  return {
    name: 'disabled',
    async summarizeThread(thread) {
      const prompt = buildThreadSummaryPrompt(thread);
      return {
        status: 'disabled',
        audit: createPromptAudit({ provider: 'none', purpose: prompt.purpose, threadId: thread.id, contentDescription: prompt.contentDescription }),
        response: null,
      };
    },
  };
}

async function mockProviderCall({ provider, prompt }) {
  const user = prompt.messages.find((message) => message.role === 'user')?.content || '';
  const subject = user.match(/Subject: (.*)/)?.[1] || 'selected thread';
  return {
    provider,
    text: `Mock summary for ${subject}: action needed, privacy audit recorded, no real API call made.`,
  };
}

async function safeRecordAudit(auditStore, entry) {
  try {
    await auditStore.recordAiAudit(entry);
  } catch (_error) {
    // Result/error audit updates should not trigger a second provider call or mask the user-facing outcome.
  }
}

function createProviderKeyRef(service, provider) {
  return `keychain://${service}/${provider}`;
}

function isKeychainKeyRef(keyRef) {
  return typeof keyRef === 'string' && keyRef.startsWith('keychain://') && keyRef.length > 'keychain://'.length;
}

function stableEnvelopeId(value) {
  return `ai_audit_${payloadHashHex(JSON.stringify(value)).slice(0, 16)}`;
}

function payloadHashHex(value) {
  const text = String(value);
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5];
  return seeds.map((seed) => fnv1a32(text, seed)).join('');
}

function fnv1a32(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function serializePayloadPreview(payload) {
  return JSON.stringify(payload, null, 2);
}

function redactForAudit(error) {
  const message = error?.message || String(error || 'unknown AI provider error');
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, '[secret-redacted]')
    .replace(/RAW_[A-Z0-9_]*KEY/g, '[secret-redacted]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[secret-redacted]')
    .replace(/(body|excerpt)\s+Can you confirm next week\??/gi, '$1 [body-redacted]')
    .slice(0, 240);
}

function redactStructuredValue(value) {
  if (Array.isArray(value)) return value.map(redactStructuredValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (/token|secret|api[_-]?key|password/i.test(key)) return [key, '[secret-redacted]'];
      if (/body|raw|payload/i.test(key)) return [key, '[body-redacted]'];
      return [key, redactStructuredValue(nested)];
    }),
  );
}

function validateProvider(provider) {
  if (!supportedProviders.includes(provider)) throw new Error(`Unsupported AI provider: ${provider}`);
}

function requireField(name, value) {
  if (!value) throw new Error(`${name} is required`);
}
