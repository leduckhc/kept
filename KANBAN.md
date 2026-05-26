# Kept Kanban Board

Owner: Bob CEO
Repository: `leduckhc/kept`
Working model: every implementation task lands through a GitHub PR. No direct pushes to `main` except repository administration.

## Board columns

- **Backlog**: scoped but not started
- **Ready**: enough detail for an engineer/designer to start
- **In Progress**: branch/worktree exists and owner is active
- **Review**: PR opened, waiting for review/CI
- **Done**: merged to `main`

## Team assignments

### Ready

#### KPT-001 — Repo foundation and Tauri scaffold
- Owner: Charles
- Branch: `feat/kpt-001-tauri-scaffold`
- Worktree: `/home/le/kept.worktrees/kpt-001-tauri-scaffold`
- PR requirement: yes, target `main`
- Goal: create the initial Tauri + React + TypeScript desktop app structure.
- Scope:
  - `apps/desktop` Tauri app
  - workspace/package manager setup
  - `packages/ui`
  - `packages/mail-core`
  - `packages/search-core`
  - `packages/ai-core`
  - basic app shell with Kept name and Pip placeholder
- Acceptance:
  - app launches locally
  - typecheck/lint command documented
  - README has setup instructions
  - PR includes screenshots of the launched app
- Verification:
  - `git status` clean before PR
  - install/build/typecheck commands pass
  - PR body names real commands run
- Next reviewer: Bob

#### KPT-002 — Local encrypted storage + FTS spike
- Owner: Harry
- Branch: `feat/kpt-002-local-storage-search`
- Worktree: `/home/le/kept.worktrees/kpt-002-local-storage-search`
- PR requirement: yes, target `main`
- Goal: prove local encrypted storage and full-text search with seeded email data.
- Scope:
  - SQLite schema for accounts, threads, messages, attachments metadata
  - encryption approach decision: SQLCipher vs app-layer encrypted blobs
  - FTS5 index for subject/body/sender/recipients
  - seed script with non-sensitive sample emails
  - search API in `packages/search-core`
- Acceptance:
  - seeded messages can be searched locally
  - no network dependency for search
  - encryption choice documented with tradeoffs
  - tests cover insert, index, search, and empty results
- Verification:
  - unit tests pass
  - local DB file location documented
  - demo command returns search results from seeded data
- Next reviewer: Bob, then Charles for integration fit

#### KPT-003 — Gmail OAuth + ingestion spike
- Owner: John
- Branch: `feat/kpt-003-gmail-ingestion`
- Worktree: `/home/le/kept.worktrees/kpt-003-gmail-ingestion`
- PR requirement: yes, target `main`
- Goal: connect Gmail and ingest recent real mail metadata/content into the local model without any app server seeing message bodies.
- Scope:
  - Gmail OAuth flow spike suitable for Tauri desktop
  - minimal scopes proposal
  - incremental sync cursor plan
  - ingest recent threads/messages into local interface
  - redact/logging policy
- Acceptance:
  - OAuth flow documented and runnable in dev
  - real Gmail message sample can be ingested locally
  - scopes are minimal and explained in product language
  - no message body appears in application logs
- Verification:
  - PR includes a short screen recording or screenshots of OAuth/dev flow
  - test/fake connector exists for CI without real Gmail credentials
  - security notes included in `docs/privacy-model.md`
- Next reviewer: Bob, then security review

#### KPT-004 — Brand, mascot, and first-run privacy UX
- Owner: Denisa
- Branch: `design/kpt-004-brand-privacy-onboarding`
- Worktree: `/home/le/kept.worktrees/kpt-004-brand-privacy-onboarding`
- PR requirement: yes, target `main`
- Goal: turn Kept + Pip into a credible privacy-first product direction, not a toy mascot.
- Scope:
  - lightweight brand system: colors, type, spacing, icon style
  - Pip the Keeper Owl mascot direction
  - first-run privacy explainer
  - empty/search/indexing states
  - landing hero mockup
- Acceptance:
  - 2 distinct visual directions, one recommended
  - mobile and desktop snapshots
  - copy explains local-first and BYO AI in 10 seconds
  - mascot feels calm/trustworthy, not childish
- Verification:
  - PR includes image snapshots or linked artifacts
  - Milan gets one decision-ready comparison if directions are close
- Next reviewer: Milan choice, then Bob

#### KPT-005 — BYO AI provider architecture
- Owner: Charles
- Branch: `feat/kpt-005-byo-ai-core`
- Worktree: `/home/le/kept.worktrees/kpt-005-byo-ai-core`
- PR requirement: yes, target `main`
- Goal: define and stub the AI provider abstraction without sending mail anywhere by default.
- Scope:
  - provider interface in `packages/ai-core`
  - adapters/stubs for OpenAI, Anthropic, OpenRouter, Ollama
  - prompt audit data model
  - settings model for user-owned API keys
  - default-off AI behavior
- Acceptance:
  - app can summarize seeded local thread through a mocked provider
  - prompt audit shows exactly what would be sent
  - provider keys are never committed/logged
  - docs explain BYO AI model clearly
- Verification:
  - unit tests for provider selection and disabled state
  - no real API call required in CI
- Next reviewer: Bob

### Backlog

#### KPT-006 — Outlook/Microsoft Graph connector
- Owner: Unassigned
- Depends on: KPT-001, KPT-002
- Goal: add Outlook account connection and ingestion.

#### KPT-007 — IMAP connector
- Owner: Unassigned
- Depends on: KPT-001, KPT-002
- Goal: support generic email accounts.

#### KPT-008 — Paid beta plumbing
- Owner: Unassigned
- Depends on: MVP demo working
- Goal: $5/month or $49/year checkout and entitlement.

#### KPT-009 — Mobile companion strategy
- Owner: Unassigned
- Depends on: desktop retention signal
- Goal: read/search/triage companion, not full mobile parity.

## PR rules

Every PR must include:

- Summary
- Screenshots or terminal output when relevant
- Test plan with exact commands
- Privacy/security notes if mail content, OAuth, local DB, logs, or AI prompts are touched
- `Closes KPT-XXX` in spirit; once GitHub issues exist, use `Closes #N`

## CEO review rule

A task is not done until its PR is merged to `main`.
