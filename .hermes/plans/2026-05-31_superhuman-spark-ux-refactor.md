# Kept UI/UX Refactor: Superhuman/Spark Parity

**Goal:** Make Kept feel instantly familiar to Superhuman/Spark users — leverage existing muscle memory so new users are productive in seconds.

**Status:** PLAN — awaiting autoplan review

---

## Phase 0: Research & Documentation Scrape

### Objective
Scrape Superhuman and Spark official docs, convert to markdown with image links, and make accessible across all git worktrees.

### Approach
1. **Write an automated scraping script** (`scripts/scrape-ux-docs.py`) that:
   - Crawls Superhuman Help Center starting from `https://help.superhuman.com/hc/en-us/articles/45237127271699-Guides`
   - Crawls Spark Tutorials starting from `https://sparkmailapp.com/help/spark-tutorials`
   - Follows internal links within those sections (respecting same-domain boundaries)
   - Extracts article title, body HTML, and inline images
   - Converts to clean markdown via html2text or similar
   - Preserves image links (absolute URLs) inline in markdown
   - Outputs per-article markdown files organized by source

2. **Storage location** (accessible across worktrees):
   ```
   /home/le/kept/docs/ux-research/
   ├── superhuman/
   │   ├── index.md           (TOC)
   │   ├── keyboard-shortcuts.md
   │   ├── split-inbox.md
   │   ├── ...
   │   └── images/            (downloaded if needed)
   └── spark/
       ├── index.md
       ├── smart-inbox.md
       ├── ...
       └── images/
   ```
   This is in the main repo root, committed to `main`, so every worktree sees it.

3. **Script requirements:**
   - Python 3.11 with `httpx` + `beautifulsoup4` + `markdownify`
   - Rate limiting (1 req/sec)
   - Retry on transient failures
   - Progress output
   - Idempotent (re-running updates existing files)

---

## Phase 1: UX/UI Deep Research & Comparison

### Deliverable
`docs/ux-research/COMPARISON.md` — a structured comparison document covering:

| Dimension | Superhuman | Spark | Best-of-both for Kept |
|-----------|-----------|-------|----------------------|
| Keyboard shortcuts | Full vim-like (j/k/e/r/#) | Similar but fewer | Adopt Superhuman's full set |
| Split inbox | Priority/Other/Feed | Smart categories | Kept already has sections — refine |
| Email preview | Right-panel or inline | Bottom panel or inline | Full-page reader (Milan's preference) |
| Compose | Cmd+N modal, full screen option | Floating compose | Keep existing modal |
| Thread view | Inline expansion | Conversation thread | Spark-style collapsed (already KPT-032) |
| Search | Cmd+K spotlight | Top bar search | Cmd+K spotlight overlay |
| Actions/commands | Cmd+K command palette | Swipe + shortcuts | Command palette (Cmd+K) |
| Snooze | Time picker inline | Calendar picker | Already have — refine picker UX |
| Undo | Toast with timer | Toast | Already have KPT-034 |
| Visual density | Tight, monochrome, no avatars | Comfortable, colorful, avatars | Tight by default, avatars optional |
| Onboarding | Guided tutorial + tips | In-app tutorials | Not needed for v1 |
| Animations | Subtle transitions | Spring animations | Subtle only — no jank |
| Mobile/touch | Swipe gestures | Rich swipe gestures | Already have KPT-033 |

### Key UX features to adopt (prioritized):

**P0 — Must-have (users expect this):**
1. **Command palette (Cmd+K / Ctrl+K)** — unified search + actions in one overlay. This is THE Superhuman signature interaction.
2. **Keyboard-driven navigation** — already partial (KPT-024), need full coverage: `j/k` (up/down), `e` (archive), `r` (reply), `#` (trash), `Shift+U` (mark unread), `?` (shortcut help).
3. **Instant send/undo send** — configurable delay (5-30s) before email actually sends.
4. **Read status indicators** — visual distinction: unread = bold + dot, read = normal weight.
5. **Split view refinement** — make sections collapsible with count badges (already partial).

**P1 — High-value (differentiators):**
6. **Snippets/templates** — saved text blocks insertable with `/` command in compose.
7. **Scheduled send** — pick date/time when composing.
8. **Follow-up reminders** — "remind me if no reply in X days."
9. **Instant reply suggestions** — quick reply chips (Thanks! / Got it / etc.)
10. **Focus mode** — show only important/priority emails, hide newsletters.

**P2 — Nice-to-have (polish):**
11. **Email AI summary** (out of scope per v1 contract — defer)
12. **Contact sidebar** — recent interactions with sender
13. **Keyboard shortcut overlay (`?`)** — modal showing all shortcuts

---

## Phase 2: Implementation Plan

### KPT-043: Command Palette (P0)
**Priority:** 1 (highest)
**Scope:**
- `Cmd+K` / `Ctrl+K` opens spotlight-style overlay
- Search threads by subject/sender (uses existing FTS5)
- Action commands: Archive, Snooze, Star, Mute, Compose, Settings
- Fuzzy matching on command names
- Recent actions memory
- `Escape` closes

**Files:** `src/main.ts` (new `renderCommandPalette()`, keyboard handler), `src/styles.css` (overlay styles)
**Estimate:** ~200 LOC TS + ~80 LOC CSS
**Tests:** Unit test for fuzzy match, command dispatch

### KPT-044: Full Keyboard Navigation Parity (P0)
**Priority:** 2
**Scope:**
- Ensure ALL Superhuman shortcuts work:
  - `j/k` — navigate threads (already exists)
  - `o` / `Enter` — open thread
  - `e` — archive (add, currently only swipe/button)
  - `r` — reply (already exists)
  - `f` — forward
  - `#` — trash/delete
  - `l` — label/move
  - `x` — select (toggle bulk for current)
  - `?` — show shortcut overlay
  - `g i` — go to inbox, `g s` — go to starred, etc.
  - `n/p` — next/prev message in thread
  - `/` — focus search
- Visual hint on hover showing shortcut key

**Files:** `src/main.ts` (extend keyboard handler), `src/styles.css`
**Estimate:** ~150 LOC
**Tests:** Keyboard handler unit tests

### KPT-045: Shortcut Overlay (`?`) (P2)
**Priority:** 3
**Scope:**
- `?` key opens a full-page shortcut reference
- Categorized: Navigation, Actions, Compose, Views
- Styled like Superhuman's minimal grid
- `Escape` closes

**Files:** `src/main.ts`, `src/styles.css`
**Estimate:** ~100 LOC

### KPT-046: Instant Reply Chips (P1)
**Priority:** 4
**Scope:**
- Below opened email, show 3-4 contextual quick reply chips
- Default: "Thanks!", "Got it", "Sounds good", "On it"
- Clicking sends immediately (with undo toast)
- Later: AI-generated suggestions (out of v1 scope)

**Files:** `src/main.ts` (in thread reader section), `src/styles.css`
**Estimate:** ~80 LOC

### KPT-047: Scheduled Send (P1)
**Priority:** 5
**Scope:**
- In compose modal, add "Send later" button next to Send
- Opens time picker: In 1h, Tomorrow morning, Monday, Custom
- Stores scheduled emails in SQLite with `send_at` timestamp
- Background check every 60s sends due emails
- Shows scheduled count in status bar

**Files:** `src/main.ts`, `src/gmail.ts` (scheduledSend table + send logic), `src/db.ts`
**Estimate:** ~250 LOC

### KPT-048: Follow-up Reminders (P1)
**Priority:** 6
**Scope:**
- After sending, option "Remind me if no reply in X days"
- Options: 1 day, 3 days, 1 week, custom
- Stores in SQLite, checks on sync
- Surfaces as a "No reply" section or notification

**Files:** `src/main.ts`, `src/gmail.ts`, `src/db.ts`
**Estimate:** ~200 LOC

### KPT-049: Visual Density & Typography Refresh (P0)
**Priority:** 7
**Scope:**
- Tighten row height to 36px (Superhuman-like)
- Bolder unread weight (font-weight: 600 vs 400)
- Sender name prominence (14px semi-bold)
- Subject secondary (13px normal)
- Snippet tertiary (12px muted)
- Date right-aligned, small (12px muted)
- Remove excessive padding between sections
- Smooth transitions on hover (40ms)

**Files:** `src/styles.css` primarily
**Estimate:** ~100 LOC CSS changes

### KPT-050: Focus Mode (P1)
**Priority:** 8
**Scope:**
- Toggle in toolbar: "Focus" filters to only threads from known senders (builds on KPT-038 smart notifications sender list)
- Everything else hidden until Focus is off
- Badge shows hidden count
- Keyboard shortcut: `Shift+F`

**Files:** `src/main.ts` (filter logic + toggle UI)
**Estimate:** ~60 LOC

---

## Phase 3: Execution Pipeline

```
For each KPT card:
  1. Plan (this doc) → 
  2. Autoplan review (CEO + Eng + Design lenses) →
  3. If REVISE: update plan, re-review →
  4. Implement (Claude Code in worktree) →
  5. QA (browse tool, real app verification) →
  6. If FAIL: return to implementation with bug report →
  7. PASS: merge to main, push origin
```

### Execution order:
1. **Phase 0** first (scraping script) — gives us reference docs for implementation
2. **KPT-043** (Command palette) — signature feature, immediate wow factor
3. **KPT-049** (Visual density) — quick win, big impact
4. **KPT-044** (Full keyboard nav) — core interaction model
5. **KPT-045** (Shortcut overlay) — teaches users the shortcuts
6. **KPT-046** (Quick reply chips) — speed optimization
7. **KPT-050** (Focus mode) — productivity feature
8. **KPT-047** (Scheduled send) — power user feature
9. **KPT-048** (Follow-up reminders) — retention feature

---

## Risks & Mitigations

1. **CSS regression** — existing styles are monolithic (1856 lines). Mitigation: run full visual QA after each merge.
2. **Keyboard conflict** — new shortcuts may conflict with OS/Tauri. Mitigation: test in actual Tauri window.
3. **main.ts bloat** — already 2466 lines. Consider splitting into modules during implementation (command-palette.ts, keyboard.ts, etc.).
4. **Scope creep** — P1/P2 items are explicitly deferrable. Ship P0 first.

---

## Definition of Done

- Scraped docs committed to `docs/ux-research/` on `main`
- `COMPARISON.md` with research findings committed
- Each KPT card: implemented, QA'd, merged to `main`, pushed to origin
- Full keyboard navigation matches Superhuman's core shortcuts
- Command palette works and is the primary interaction surface
- Visual density feels modern/tight without being cramped
