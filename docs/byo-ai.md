# KPT-D0 BYO AI Provider Architecture

## CEO decision

Kept is BYO AI, default-off. The product never sends mail content to Kept infrastructure for AI processing. Users choose a provider, store their key locally, and must approve the exact prompt envelope before content leaves the device.

## Supported provider stubs

- OpenAI
- Anthropic
- OpenRouter
- Ollama

`packages/ai-core` exposes:

- `createAISettings`: validates enabled/disabled provider state and local key references.
- `createAIKeychainStore`: stores raw provider keys behind a keychain adapter and returns `keychain://` references for settings.
- `createProviderAdapter`: creates disabled or provider-backed adapters that fail closed before remote calls.
- `buildThreadSummaryPrompt`: scopes prompts to one selected thread.
- `createPromptAudit`: records provider, purpose, content category, thread id, approval requirement, and redaction policy.
- `createApprovalEnvelope`: records provider, model, action, selected ids, exact payload preview, payload hash, approval state, result, and error.

## Key handling

Remote providers require a local key reference such as `keychain://kept.ai.provider-keys/openai`. Raw API keys must not be committed, logged, included in prompt audits, or persisted in plaintext app settings. Ollama can run without a remote key.

## Audit preflight

Approved remote calls require an audit preflight write first. If the local audit store cannot persist the approval envelope, `createProviderAdapter` returns `audit_preflight_failed` and does not call the provider. Denied approval, disabled AI, missing provider, and missing key also return before any provider call.

The A0 local mail repository persists AI audit entries with approval envelope fields. Result and error fields are redacted before persistence; the payload preview is intentionally exact so the user can see what would leave the device.

## Demo

```bash
npm run demo:summary -w @kept/ai-core
```

The demo shows the two required states:

1. `approval_denied`: prompt and audit envelope are visible before a provider call.
2. `ok`: mock provider result after explicit approval.

No real API call is required in CI.
