# Kept Visual Redesign + Email Fix — Full Plan

**Goal:** Complete visual redesign to match Superhuman/Spark look & feel, fix email body rendering, automate UX doc scraping.

**Pipeline:** Plan → Review → Implement (Claude Code + worktrees) → QA → Merge to main

---

## Phase 0: Scraping Automation (KPT-060)

### Objective
Automated Python script to scrape Superhuman + Spark docs → clean markdown with image links, committed to `docs/ux-research/` (accessible across all worktrees).

### Script: `scripts/scrape-ux-docs.py`
- **Superhuman entry:** https://help.superhuman.com/hc/en-us/articles/45237127271699-Guides
- **Spark entry:** https://sparkmailapp.com/help/spark-tutorials
- **Behavior:**
  - Follow internal links within each help section
  - Extract article title + body HTML + inline images
  - Convert to markdown via `markdownify`
  - Preserve image links as absolute URLs
  - Rate-limit: 1 req/sec, retry on 429/5xx
  - Output: `docs/ux-research/{superhuman,spark}/` per-article .md files
  - Idempotent (re-running overwrites existing)
- **Dependencies:** `httpx`, `beautifulsoup4`, `markdownify` (uv venv)
- **Acceptance:** Script runs clean, produces ≥10 Superhuman articles + updates existing 52 Spark articles

### Priority: P0 (blocks research depth)

---

## Phase 1: Fix Email Body Rendering (KPT-061)

### Problem
"Could not load messages" error when opening a thread. Root cause hypothesis:
1. `fetch()` in Tauri webview may be blocked by CSP or Tauri's IPC layer for cross-origin requests
2. Token refresh failure (401 → throws before rendering)
3. MIME parsing edge case (malformed payload structure)

### Investigation & Fix Plan
1. Add diagnostic `console.error` in `openThread()` catch block showing full error object
2. Verify `fetch()` works for Gmail API in Tauri context — CSP allows `*.googleapis.com` but Tauri's webview may intercept
3. If fetch fails: switch `gmailGet`/`gmailGetRaw` to use `@tauri-apps/plugin-http` `fetch()` instead of browser `fetch()`
4. Test token refresh path — `ensureFreshToken()` must not throw silently
5. Handle MIME edge cases: empty `payload.parts`, missing `body.data`, nested multipart/mixed

### Acceptance
- Open any thread → email body renders (HTML or plaintext)
- No "Could not load messages" error
- Works for threads with 1 message and threads with 10+ messages

### Priority: P0 (core functionality broken)

---

## Phase 2: Visual Redesign (KPT-062 — KPT-067)

### Design Principles (from Superhuman/Spark)
- **Monochrome dark with accent color** — dark bg (#0d0d0d), muted text, blue/purple accent for actions
- **Extreme density** — 32-36px rows, 13px type, no wasted space
- **Left sidebar minimal** — icons only (expandable), no always-visible labels
- **Three-column when wide** — sidebar | thread list | reader (at ≥1200px)
- **Full-bleed reader** — email body fills available height, no cramped panels
- **Typography hierarchy** — sender bold 13px, subject normal 13px, snippet muted 12px, all same line
- **Transitions** — 150ms ease-out on all state changes, no jarring jumps

### KPT-062: Layout Restructure — Three-Pane
- **Current:** Single-pane with full-page reader overlay
- **Target:** Three-pane layout (sidebar | list | reader) on desktop, full-page reader on narrow
- Sidebar: icons-only by default (Inbox, Sent, Drafts, Archive, Trash), expand on hover
- Thread list: fixed 320px width, scrollable
- Reader: flex-grow, full height
- Breakpoint: <1024px collapses to current single-pane behavior
- **Priority: P0**

### KPT-063: Color & Typography Overhaul
- Background: #0a0a0a (shell), #0f0f0f (list), #111111 (reader)
- Text: #e8e8e8 (primary), #888888 (muted), #555555 (disabled)
- Accent: #4a9eff (links, active items), #6366f1 (buttons)
- Font: system-ui, 13px base, 600 weight for unread
- Row height: 36px thread rows, 44px touch target on mobile
- Border: #1e1e1e (subtle dividers), no heavy borders
- **Priority: P0**

### KPT-064: Thread List Polish
- Single-line per thread: [avatar?] Sender — Subject snippet... [time] [attachment icon]
- Selected row: bg #1a1a2e with left accent border (2px blue)
- Hover: bg #141414
- Unread: bold sender + blue dot indicator
- Read: normal weight, slightly muted
- Star/pin indicator inline
- Swipe gestures remain (archive right, snooze left)
- **Priority: P1**

### KPT-065: Reader Pane Redesign
- Full-bleed email rendering — no cramped iframe
- Email header: From (bold) | To | Date — single line, collapsible details
- Reply/Forward/Archive/Trash action bar pinned at bottom
- Conversation thread: collapsed messages with expand on click
- Quote trimming: hide "On [date] [person] wrote:" blocks, show on click
- **Priority: P1**

### KPT-066: Command Palette Visual Refresh
- Already functional (⌘+K) — needs visual polish to match new theme
- Larger modal (680px), rounded corners (16px), frosted glass backdrop
- Result items: 40px height, icon + text + shortcut badge
- Active item: blue bg highlight
- **Priority: P2**

### KPT-067: Animations & Micro-interactions
- Thread list: items slide in on load (staggered 20ms)
- Reader: crossfade between emails (150ms)
- Archive/delete: row slides out left (200ms) then gap closes
- Toast notifications: slide up from bottom (200ms)
- Command palette: scale(0.95) → scale(1) on open (100ms)
- **Priority: P2**

---

## Phase 3: Interaction Pattern Gaps (KPT-068 — KPT-070)

### KPT-068: Inline Thread Actions on Hover
- Hover over thread row → show action icons (archive, trash, snooze, star)
- Icons appear on the right side, replacing timestamp
- Single click executes action immediately
- **Priority: P1**

### KPT-069: Multi-Select + Bulk Actions
- `x` to toggle select current thread
- `⌘+A` to select all visible
- Bulk action bar appears: Archive | Delete | Mark Read | Move
- Count badge shows "3 selected"
- **Priority: P1**

### KPT-070: Undo Improvements
- Global undo stack (last 5 actions)
- `⌘+Z` / `Ctrl+Z` always undoes last destructive action
- Toast shows "Archived 3 conversations — Undo" with 7s timer
- **Priority: P2**

---

## Implementation Order

| # | Task | Branch | Priority | Depends On |
|---|------|--------|----------|------------|
| 1 | Scrape automation script | `kpt-060-scrape-docs` | P0 | — |
| 2 | Fix email body rendering | `kpt-061-email-fix` | P0 | — |
| 3 | Three-pane layout | `kpt-062-three-pane` | P0 | KPT-061 |
| 4 | Color & typography | `kpt-063-theme` | P0 | KPT-062 |
| 5 | Thread list polish | `kpt-064-thread-list` | P1 | KPT-063 |
| 6 | Reader pane redesign | `kpt-065-reader` | P1 | KPT-063 |
| 7 | Inline hover actions | `kpt-068-hover-actions` | P1 | KPT-064 |
| 8 | Multi-select + bulk | `kpt-069-multi-select` | P1 | KPT-064 |
| 9 | Command palette visual | `kpt-066-palette-visual` | P2 | KPT-063 |
| 10 | Animations | `kpt-067-animations` | P2 | KPT-065 |
| 11 | Undo improvements | `kpt-070-undo` | P2 | KPT-069 |

---

## QA Criteria (per feature)

1. `npm run verify` passes (tsc --noEmit + vitest)
2. Build succeeds (`npm run build` → no errors)
3. Visual inspection via browser (`npx vite` → localhost)
4. Keyboard shortcuts still work (j/k/e/r/⌘+K/?)
5. No regressions in existing features
6. Mobile breakpoint tested (≤768px)

## Done Definition
- PR merged to `main`
- Tests pass
- No visual regressions
- Worktree cleaned up
