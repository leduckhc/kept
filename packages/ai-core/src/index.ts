// ai-core/src/index.ts

export const supportedProviders = ['openai', 'anthropic', 'openrouter', 'ollama'] as const;
export type SupportedProvider = typeof supportedProviders[number];

export const aiProviderKeychainService = 'kept.ai.provider-keys';

export interface AISettings {
  enabled: boolean;
  status: string;
  provider: string | null;
  model: string | null;
  keyRef: string | null;
}

export const disabledProvider: AISettings = Object.freeze({
  status: 'off by default',
  provider: null,
  enabled: false,
  model: null,
  keyRef: null,
});

export function createAISettings({
  enabled = false,
  provider = null,
  model = null,
  keyRef = null,
}: { enabled?: boolean; provider?: string | null; model?: string | null; keyRef?: string | null } = {}): AISettings {
  if (!enabled) return { ...disabledProvider, model: null, keyRef: null };
  if (!provider || !(supportedProviders as readonly string[]).includes(provider)) throw new Error(`Unsupported AI provider: ${provider}`);
  if (!keyRef && provider !== 'ollama') throw new Error('Remote BYO AI providers require a local key reference');
  if (provider !== 'ollama' && !isKeychainKeyRef(keyRef)) throw new Error('Remote BYO AI providers require a keychain:// key reference');
  return { enabled: true, status: 'enabled by user', provider, model, keyRef };
}

export interface Keychain {
  setPassword(service: string, account: string, secret: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<void>;
}

export function createMemoryKeychain(): Keychain & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    async setPassword(service: string, account: string, secret: string) { entries.set(`${service}:${account}`, String(secret)); },
    async getPassword(service: string, account: string) { return entries.get(`${service}:${account}`) || null; },
    async deletePassword(service: string, account: string) { entries.delete(`${service}:${account}`); },
  };
}

export interface AIKeychainStore {
  saveProviderKey(provider: string, apiKey: string): Promise<{ provider: string; keyRef: string; stored: string }>;
  loadProviderKey(provider: string): Promise<string | null>;
  hasProviderKey(provider: string): Promise<boolean>;
  clearProviderKey(provider: string): Promise<void>;
}

export function createAIKeychainStore({
  keychain,
  service = aiProviderKeychainService,
}: { keychain: Keychain; service?: string }): AIKeychainStore {
  requireField('keychain', keychain);
  for (const method of ['setPassword', 'getPassword', 'deletePassword'] as const) {
    if (typeof (keychain as unknown as Record<string, unknown>)[method] !== 'function') throw new Error(`keychain.${method} is required`);
  }
  return {
    async saveProviderKey(provider: string, apiKey: string) {
      validateProvider(provider);
      requireField('apiKey', apiKey);
      await keychain.setPassword(service, provider, String(apiKey));
      return { provider, keyRef: createProviderKeyRef(service, provider), stored: 'keychain' };
    },
    async loadProviderKey(provider: string) {
      validateProvider(provider);
      return keychain.getPassword(service, provider);
    },
    async hasProviderKey(provider: string) {
      validateProvider(provider);
      return Boolean(await keychain.getPassword(service, provider));
    },
    async clearProviderKey(provider: string) {
      validateProvider(provider);
      await keychain.deletePassword(service, provider);
    },
  };
}

export interface PromptAudit {
  provider: string;
  purpose: string;
  threadId: string | null;
  contentDescription: string;
  createdAt: string;
  requiresExplicitApproval: boolean;
  redactionPolicy: string;
}

export function createPromptAudit({
  provider,
  purpose,
  contentDescription,
  threadId = null,
}: { provider: string; purpose: string; contentDescription: string; threadId?: string | null }): PromptAudit {
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

export interface ApprovalEnvelope {
  id: string;
  provider: string;
  model: string | null;
  action: string;
  selectedIds: string[];
  payloadPreview: string;
  payloadHash: string;
  approvalState: 'approved' | 'denied';
  result: unknown;
  error: unknown;
  createdAt: string;
}

export function createApprovalEnvelope({
  settings = {},
  action,
  selectedIds = [],
  payload,
  approved = false,
  result = null,
  error = null,
}: {
  settings?: Partial<AISettings>;
  action: string;
  selectedIds?: string[];
  payload?: unknown;
  approved?: boolean;
  result?: unknown;
  error?: unknown;
} = { action: '' }): ApprovalEnvelope {
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
    error: error ? redactForAudit(error as Error) : null,
    createdAt: new Date(0).toISOString(),
  };
}

export interface ThreadSummaryPrompt {
  purpose: string;
  contentDescription: string;
  messages: { role: string; content: string }[];
}

export function buildThreadSummaryPrompt(thread: { subject: string; sender: string; receivedAt?: string; body?: string }): ThreadSummaryPrompt {
  return {
    purpose: 'Summarize selected local thread',
    contentDescription: 'Subject, sender, received timestamp, and selected body excerpt for one user-approved thread',
    messages: [
      { role: 'system', content: 'Summarize this email thread in 3 bullets. Do not infer facts not present.' },
      { role: 'user', content: `Subject: ${thread.subject}\nSender: ${thread.sender}\nReceived: ${thread.receivedAt || 'unknown'}\nExcerpt: ${(thread.body || '').slice(0, 1200)}` },
    ],
  };
}

export interface AIAdapter {
  name: string;
  summarizeThread(thread: Record<string, unknown>, options?: { approved?: boolean; expectedPayloadHash?: string | null }): Promise<Record<string, unknown>>;
}

export function createProviderAdapter(
  settings: AISettings | null | undefined,
  { transport, call, keyStore, auditStore }: {
    transport?: { call?: (args: Record<string, unknown>) => Promise<unknown> };
    call?: (args: Record<string, unknown>) => Promise<unknown>;
    keyStore?: AIKeychainStore;
    auditStore?: { recordAiAudit?: (entry: unknown) => Promise<void> };
  } = {}
): AIAdapter {
  if (!settings?.enabled) return createDisabledAdapter();
  const providerCall = call || transport?.call || mockProviderCall;
  return {
    name: settings.provider || 'missing',
    async summarizeThread(thread: Record<string, unknown>, { approved = false, expectedPayloadHash = null }: { approved?: boolean; expectedPayloadHash?: string | null } = {}) {
      if (!settings.provider) return { status: 'provider_missing', response: null };
      if (!(supportedProviders as readonly string[]).includes(settings.provider)) return { status: 'provider_missing', response: null };
      if (settings.provider !== 'ollama') {
        if (!isKeychainKeyRef(settings.keyRef)) return { status: 'key_missing', response: null };
        if (typeof keyStore?.hasProviderKey !== 'function') return { status: 'key_missing', response: null };
        if (!(await keyStore.hasProviderKey(settings.provider))) return { status: 'key_missing', response: null };
      }

      const prompt = buildThreadSummaryPrompt(thread as Parameters<typeof buildThreadSummaryPrompt>[0]);
      const audit = createPromptAudit({
        provider: settings.provider,
        purpose: prompt.purpose,
        threadId: String(thread['id'] ?? ''),
        contentDescription: prompt.contentDescription,
      });
      const envelope = createApprovalEnvelope({ settings, action: prompt.purpose, selectedIds: [String(thread['id'] ?? '')], payload: prompt, approved });

      if (!approved) {
        const deniedEnvelope = { ...envelope, approvalState: 'denied' as const };
        if (auditStore?.recordAiAudit) await safeRecordAudit(auditStore as { recordAiAudit: (entry: unknown) => Promise<void> }, { ...audit, ...deniedEnvelope, approved: false });
        return { status: 'approval_denied', audit, envelope: deniedEnvelope, prompt };
      }

      if (expectedPayloadHash && expectedPayloadHash !== envelope.payloadHash) {
        const mismatchEnvelope = { ...envelope, approvalState: 'denied' as const, error: 'Approved preview hash did not match provider payload hash' };
        if (auditStore?.recordAiAudit) await safeRecordAudit(auditStore as { recordAiAudit: (entry: unknown) => Promise<void> }, { ...audit, ...mismatchEnvelope, approved: false });
        return { status: 'approval_mismatch', audit, envelope: mismatchEnvelope, error: mismatchEnvelope.error, response: null };
      }

      try {
        if (settings.provider !== 'ollama' && typeof auditStore?.recordAiAudit !== 'function') {
          throw new Error('AI audit store unavailable for remote provider preflight');
        }
        if (auditStore?.recordAiAudit) await auditStore.recordAiAudit({ ...audit, ...envelope, approved: true, result: null, error: null });
      } catch (err) {
        return { status: 'audit_preflight_failed', audit, envelope, error: redactForAudit(err as Error), response: null };
      }

      try {
        const response = await providerCall({ provider: settings.provider, model: settings.model, prompt, keyRef: settings.keyRef });
        const resultEnvelope = createApprovalEnvelope({ settings, action: prompt.purpose, selectedIds: [String(thread['id'] ?? '')], payload: prompt, approved: true, result: response });
        if (auditStore?.recordAiAudit) await safeRecordAudit(auditStore as { recordAiAudit: (entry: unknown) => Promise<void> }, { ...audit, ...resultEnvelope, approved: true });
        return { status: 'ok', audit, envelope: resultEnvelope, response };
      } catch (err) {
        const errorEnvelope = createApprovalEnvelope({ settings, action: prompt.purpose, selectedIds: [String(thread['id'] ?? '')], payload: prompt, approved: true, error: err });
        if (auditStore?.recordAiAudit) await safeRecordAudit(auditStore as { recordAiAudit: (entry: unknown) => Promise<void> }, { ...audit, ...errorEnvelope, approved: true });
        return { status: 'provider_error', audit, envelope: errorEnvelope, error: errorEnvelope.error, response: null };
      }
    },
  };
}

export function createDisabledAdapter(): AIAdapter {
  return {
    name: 'disabled',
    async summarizeThread(thread: Record<string, unknown>) {
      const t = thread as Parameters<typeof buildThreadSummaryPrompt>[0];
      const prompt = buildThreadSummaryPrompt(t);
      return {
        status: 'disabled',
        audit: createPromptAudit({ provider: 'none', purpose: prompt.purpose, threadId: String(thread['id'] ?? ''), contentDescription: prompt.contentDescription }),
        response: null,
      };
    },
  };
}

async function mockProviderCall({ provider, prompt }: { provider: string; model?: string | null; prompt: ThreadSummaryPrompt; keyRef?: string | null }) {
  const user = prompt.messages.find((message) => message.role === 'user')?.content || '';
  const subject = user.match(/Subject: (.*)/)?.[1] || 'selected thread';
  return {
    provider,
    text: `Mock summary for ${subject}: action needed, privacy audit recorded, no real API call made.`,
  };
}

async function safeRecordAudit(auditStore: { recordAiAudit: (entry: unknown) => Promise<void> }, entry: unknown) {
  try {
    await auditStore.recordAiAudit(entry);
  } catch (_error) {
    // Result/error audit updates should not trigger a second provider call or mask the user-facing outcome.
  }
}

function createProviderKeyRef(service: string, provider: string) {
  return `keychain://${service}/${provider}`;
}

function isKeychainKeyRef(keyRef: string | null | undefined): boolean {
  return typeof keyRef === 'string' && keyRef.startsWith('keychain://') && keyRef.length > 'keychain://'.length;
}

function stableEnvelopeId(value: unknown) {
  return `ai_audit_${payloadHashHex(JSON.stringify(value)).slice(0, 16)}`;
}

function payloadHashHex(value: string) {
  const text = String(value);
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5];
  return seeds.map((seed) => fnv1a32(text, seed)).join('');
}

function fnv1a32(text: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function serializePayloadPreview(payload: unknown) {
  return JSON.stringify(payload, null, 2);
}

function redactForAudit(error: Error | unknown) {
  const message = (error as Error)?.message || String(error || 'unknown AI provider error');
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, '[secret-redacted]')
    .replace(/RAW_[A-Z0-9_]*KEY/g, '[secret-redacted]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[secret-redacted]')
    .replace(/(body|excerpt)\s+Can you confirm next week\??/gi, '$1 [body-redacted]')
    .slice(0, 240);
}

function redactStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactStructuredValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (/token|secret|api[_-]?key|password/i.test(key)) return [key, '[secret-redacted]'];
      if (/body|raw|payload/i.test(key)) return [key, '[body-redacted]'];
      return [key, redactStructuredValue(nested)];
    }),
  );
}

function validateProvider(provider: string) {
  if (!(supportedProviders as readonly string[]).includes(provider)) throw new Error(`Unsupported AI provider: ${provider}`);
}

function requireField(name: string, value: unknown) {
  if (!value) throw new Error(`${name} is required`);
}
