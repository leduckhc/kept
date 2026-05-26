export const disabledProvider = { status: 'off by default', provider: null };

export const supportedProviders = ['openai', 'anthropic', 'openrouter', 'ollama'];

export function createPromptAudit({ provider, purpose, contentDescription }) {
  return {
    provider,
    purpose,
    contentDescription,
    createdAt: new Date(0).toISOString(),
    requiresExplicitApproval: true,
  };
}
