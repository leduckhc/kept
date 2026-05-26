# Kept Privacy Model

Kept's privacy promise is product-critical:

> Your mail is indexed locally. Bring your own AI key. We never read your inbox.

## Defaults

- Mail content is stored on the user's device.
- Search runs locally.
- AI is disabled until the user connects a provider.
- No Kept application server receives message bodies by default.
- Logs must never include message bodies, OAuth tokens, API keys, or full prompts containing private mail.

## Local storage

The MVP must choose and document one encryption approach:

1. SQLCipher-encrypted SQLite database.
2. App-layer encryption for sensitive blobs plus SQLite metadata.

The decision must consider cross-platform support in Tauri, migration complexity, performance, and developer ergonomics.

## AI provider model

Kept supports bring-your-own AI providers:

- OpenAI
- Anthropic
- OpenRouter
- Ollama/local endpoint

Before any mail content is sent to an AI provider, the UI must show:

- provider name
- what content will be sent
- why it is needed
- whether the request is stored in the prompt audit

## Prompt audit

The user should be able to inspect recent AI requests. The audit view should show enough detail to build trust without leaking secrets into logs or support tooling.

## OAuth and connectors

Each connector must document:

- requested scopes
- reason for each scope
- token storage approach
- refresh behavior
- log redaction behavior
- local deletion/revoke behavior
