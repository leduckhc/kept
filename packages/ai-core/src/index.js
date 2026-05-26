export const supportedProviders = ['openai', 'anthropic', 'openrouter', 'ollama'];

export const disabledProvider = Object.freeze({ status: 'off by default', provider: null, enabled: false });

export function createAISettings({ enabled = false, provider = null, model = null, keyRef = null } = {}) {
  if (!enabled) return { ...disabledProvider, model: null, keyRef: null };
  if (!supportedProviders.includes(provider)) throw new Error(`Unsupported AI provider: ${provider}`);
  if (!keyRef && provider !== 'ollama') throw new Error('Remote BYO AI providers require a local key reference');
  return { enabled: true, status: 'enabled by user', provider, model, keyRef };
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

export function createProviderAdapter(settings, transport = {}) {
  if (!settings?.enabled) return createDisabledAdapter();
  const call = transport.call || mockProviderCall;
  return {
    name: settings.provider,
    async summarizeThread(thread, { approved = false } = {}) {
      const prompt = buildThreadSummaryPrompt(thread);
      const audit = createPromptAudit({
        provider: settings.provider,
        purpose: prompt.purpose,
        threadId: thread.id,
        contentDescription: prompt.contentDescription,
      });
      if (!approved) return { status: 'approval_required', audit, prompt };
      const response = await call({ provider: settings.provider, model: settings.model, prompt, keyRef: settings.keyRef });
      return { status: 'ok', audit, response };
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
