# Testing Strategy

Kept uses a three-tier testing strategy with clear boundaries and escalating fidelity.

## Overview

| Tier | What | Tool | Speed | When |
|------|------|------|-------|------|
| 1 — Unit | Logic, stores, transforms | Vitest + happy-dom | ~3s | Every PR |
| 2 — UI/Layout | Components, events, CSS | Playwright + Chromium | ~30s | Every visual change |
| 3 — E2E | Full Tauri runtime | tauri-pilot | ~2-3min | Pre-release |

## Scripts

```bash
pnpm test          # Tier 1 — unit tests (fast, CI default)
pnpm test:ui       # Tier 2 — UI/layout in real Chromium
pnpm test:ui:update # Tier 2 with snapshot updates
pnpm test:e2e      # Tier 3 — full app (requires `pnpm dev:pilot`)
pnpm test:all      # Tier 1 + Tier 2
```

## Tier 1 — Unit Tests

**Location:** `tests/*.test.ts`
**Config:** `vitest.config.ts`
**Environment:** happy-dom (fast DOM simulation)

**What belongs here:**
- Store mutations and state logic
- Data transforms (email parsing, search dedup, label logic)
- Provider interface contracts
- Pure utility functions

**What does NOT belong here:**
- Layout assertions (happy-dom has no layout engine)
- Real DOM event sequences
- Visual regression

**Mocking Tauri APIs:**
- Tests run without `__TAURI_INTERNALS__` — lazy-import pattern falls back to globals
- Mock `globalThis.fetch` with `vi.spyOn` for HTTP tests
- See `tests/serverSearch.test.ts` for the pattern

## Tier 2 — UI/Layout Tests

**Location:** `e2e-tests/*.spec.ts`
**Config:** `playwright.config.ts`
**Environment:** Real Chromium at 4 viewports (1920, 1280, 768, mobile)

**What belongs here:**
- Component rendering and layout behavior
- Focus management and keyboard navigation
- Responsive behavior across breakpoints
- CSS interactions (hover states, transitions)
- UnifiedBar mode switching
- Real DOM events (click, keyboard, focus/blur)

**How it works:**
1. Playwright starts the Vite dev server with `VITE_E2E=1`
2. E2E mode uses sql.js (browser WASM SQLite) instead of Tauri plugin-sql
3. Test DB is seeded and reset via `/__e2e_sql/reset` between tests
4. Tests run in real Chromium — same engine as Tauri webview on Linux/Windows

**Viewports tested:**
- `desktop-1920` — 3-pane layout
- `desktop-1280` — 2-pane layout
- `narrow` (768px) — tablet
- `mobile` (Pixel 5) — phone

## Tier 3 — Native E2E

**Location:** `e2e/pilot/scenarios/*.toml` and `e2e/pilot/tests/*.sh`
**Tool:** tauri-pilot (accessibility-tree-based, Unix socket)
**Requires:** Running app via `pnpm dev:pilot`

**What belongs here:**
- IPC roundtrip verification (Rust ↔ JS bridge)
- Plugin initialization (keychain, SQL, HTTP, notifications)
- OAuth flow (real token exchange)
- SQLite persistence across app restart
- Multi-window behavior (if applicable)
- Platform-specific behavior

**How to run:**
```bash
# Terminal 1: Start app with pilot feature
pnpm dev:pilot

# Terminal 2: Run E2E suite
pnpm test:e2e
```

**Writing scenarios:**
```toml
# e2e/pilot/scenarios/my-test.toml
[meta]
name = "my-test"
description = "What this tests"

[[steps]]
action = "click"
selector = ".my-button"

[[steps]]
action = "assert"
selector = ".result"
text_contains = "Expected"
```

## Guidelines for New Tests

1. **Default to Tier 1** for any new logic/function
2. **Escalate to Tier 2** when the behavior depends on:
   - DOM layout or CSS
   - Multiple user interactions in sequence
   - Viewport-specific behavior
   - Focus/keyboard management
3. **Escalate to Tier 3** when the behavior depends on:
   - Tauri runtime (IPC, plugins, native features)
   - Persistence across app sessions
   - Platform-specific APIs

## CI Strategy

- **PR gate:** `pnpm verify` (types + lint + Tier 1)
- **Merge gate:** Tier 1 + Tier 2
- **Release gate:** All three tiers
