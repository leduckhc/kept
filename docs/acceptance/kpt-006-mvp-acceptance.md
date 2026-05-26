# KPT-006 MVP Integration and CEO Acceptance Review

Status: accepted and merged to `main`.

## What landed

- KPT-001: Tauri-style desktop scaffold, npm workspace, Kept/Pip app shell, shared packages, and preview screenshot.
- KPT-002: local SQLite/FTS5 storage contract, encrypted-body/search-preview boundary, seed demo, and storage/search docs.
- KPT-003: Gmail readonly PKCE OAuth URL builder, fake Gmail connector, local ingestion mapper, sync cursor plan, and redaction/security tests.
- KPT-004: Kept brand/privacy UX directions and snapshots. CEO decision: Ledger Calm is v1; Night Watch preserved as alternate reference.
- KPT-005: BYO AI provider abstraction for OpenAI, Anthropic, OpenRouter, and Ollama; AI default-off; prompt audit and approval-required path.

## Verification evidence

Commands run from `/home/le/kept` on `main`:

```bash
npm run verify
npm run seed:demo -w @kept/search-core
npm run demo:summary -w @kept/ai-core
```

Results:

- `npm run verify`: passed.
- Node test suite: 17/17 passing.
- Search seed demo: returned local ranked results for `invoice next week`.
- AI summary demo: returned `approval_required` before the mock approved summary; no real provider call required.
- Browser visual acceptance: passed; hero, privacy status panel, and demo search results render with no obvious broken UI.

Final browser screenshot: `docs/screenshots/kpt-006-final-main-preview.png`.

## Privacy/security acceptance

- No Kept server receives Gmail message bodies by default.
- Gmail scope is limited to `gmail.readonly`.
- OAuth plan uses desktop loopback + PKCE + `state` verification.
- Message body persistence is modeled behind the encrypted local DB boundary.
- Logs redact bodies, snippets, raw payloads, email addresses, OAuth tokens, PKCE verifier, auth code, API keys, and private prompts.
- AI is off by default and requires prompt audit approval before content is sent to a BYO provider.

## Known limitation

This environment does not have Rust/Cargo installed, so the Tauri binary build was not run. The Tauri config/Rust scaffold exists, and all JavaScript workspace verification passes. Next engineering task should add CI with Rust available and run the native Tauri build.
