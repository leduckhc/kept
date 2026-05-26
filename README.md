# Kept

**Email, kept local.**

Kept is a Tauri local-first email client for private multi-account search and BYO-AI triage. Pip the Keeper Owl is the trust mark: calm, watchful, and never reading your inbox for us.

## Product promise

- Your mail is indexed locally.
- Bring your own AI key.
- We never read your inbox.
- AI is off by default and every prompt is auditable before content leaves the device.

## Workspace

```text
apps/desktop          Tauri + web app shell
packages/ui           Brand tokens and shared UI primitives
packages/mail-core    Provider-neutral mail models and redaction helpers
packages/search-core  Local SQLite storage/search API with FTS5, seeded demo data, and encrypted canonical message blobs
packages/ai-core      BYO AI provider contract and prompt audit model
docs/                 Architecture, privacy, and MVP demo notes
```

## Commands

```bash
npm install
npm run dev       # local desktop web preview at http://127.0.0.1:5173
npm run verify    # typecheck, lint, tests, and scaffold build checks
npm --workspace @kept/search-core run demo -- "boarding pass"  # seed local sample mail and search it
```

The Rust/Tauri files are present under `apps/desktop/src-tauri`. This environment does not have Cargo installed, so CI should run the JavaScript verification now and add a Tauri binary build once Rust is available.
