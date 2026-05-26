# Kept Architecture

## Product thesis

Kept is a Tauri-based local-first email client. The first wedge is fast private search and AI-ready triage across Gmail, Outlook, and IMAP.

## Initial workspace shape

```text
apps/
  desktop/          # Tauri + React desktop app
packages/
  ui/               # shared UI components and brand tokens
  mail-core/        # provider-neutral mail models and ingestion interfaces
  search-core/      # local SQLite/FTS indexing and query APIs
  ai-core/          # BYO AI provider abstraction and prompt audit model
docs/
  architecture.md
  privacy-model.md
  mvp-demo.md
```

## Data flow

```text
Gmail / Outlook / IMAP
        |
        v
mail-core connector
        |
        v
local encrypted SQLite cache
        |
        +--> search-core FTS5 index
        |
        +--> ai-core prompt builder, only when user enables provider
```

## Non-negotiables

- No message body goes to a Kept server by default.
- AI is off by default.
- Search must work offline after indexing.
- Logs must redact mail content, tokens, API keys, and private prompts.
- Real provider data is required for demos once connectors exist.

## Open architecture decisions

1. SQLCipher vs app-layer encryption.
2. Tauri plugin strategy for OAuth callback and secure storage.
3. SQLite access layer and migration tooling.
4. Search ranking approach after FTS5 baseline.
5. Mobile companion data access model.
