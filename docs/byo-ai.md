# KPT-005 BYO AI Provider Architecture

## CEO decision

Kept is BYO AI, default-off. The product never sends mail content to Kept infrastructure for AI processing. Users choose a provider and must approve the prompt audit before content leaves the device.

## Supported provider stubs

- OpenAI
- Anthropic
- OpenRouter
- Ollama

`packages/ai-core` exposes:

- `createAISettings`: validates enabled/disabled provider state and local key references.
- `createProviderAdapter`: creates disabled or provider-backed adapters.
- `buildThreadSummaryPrompt`: scopes prompts to one selected thread.
- `createPromptAudit`: records provider, purpose, content category, thread id, approval requirement, and redaction policy.

## Key handling

Remote providers require a local key reference such as a keychain URI. Raw API keys must not be committed, logged, included in prompt audits, or persisted in plaintext app settings. Ollama can run without a remote key.

## Demo

```bash
npm run demo:summary -w @kept/ai-core
```

The demo shows the two required states:

1. `approval_required`: prompt and audit are visible before a provider call.
2. `ok`: mock provider result after explicit approval.

No real API call is required in CI.
