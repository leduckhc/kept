# Kept — Next Steps

## Priority 1: Critical Verification

### KPT-080: Verify Email Body Rendering
- **Status:** Blocked on manual test
- **What:** Rebuild with `cargo tauri dev` and confirm emails load after the `client_secret` token refresh fix (commit `1cd4351`)
- **Why:** Nothing else matters if users can't read email
- **Acceptance:** Open app → click a thread → email body renders (not "Could not load messages" error)

---

## Priority 2: Visual QA

### KPT-081: Full Visual QA Pass
- **Status:** Ready
- **What:** Expose dev server via ngrok, review all 25 shipped features visually
- **Why:** 25 features shipped without visual review — spacing, colors, broken interactions only show up visually
- **Scope:**
  - Three-pane layout proportions on various window sizes
  - Dark theme contrast/readability
  - Thread list density — rows, badges, hover states
  - Reader pane — threading cards, quoted text hiding, compose area
  - Command palette — sizing, blur, animations
  - Search bar — appearance, empty/results states
  - Mobile breakpoint (<1024px) — swipe gestures, layout collapse
  - Empty states — all views
  - Inline hover actions — positioning, icon clarity
  - Multi-select bulk bar — color, positioning
- **Acceptance:** No visual regressions, spacing consistent, all interactions feel polished

---

## Priority 3: Core Feature Gaps

### KPT-082: Fullscreen Search (Gmail API)
- **Priority:** P0
- **What:** Wire the `/` search bar to call Gmail's `messages.list?q=` API for server-side search
- **Why:** Current search is client-side only (filters loaded threads). Real Superhuman search hits the server — users expect to find ANY email, not just what's in memory
- **Implementation:**
  - On Enter or after 500ms debounce, call `GET /gmail/v1/users/me/messages?q={query}`
  - Fetch thread details for results
  - Render in thread list with "Search results" header
  - Keep client-side instant filter as user types (for loaded threads)
  - Clear search results on Escape
- **Acceptance:** Search for old email not in inbox → found and rendered

### KPT-083: Account Onboarding Flow
- **Priority:** P1
- **What:** First-run experience for new users
- **Why:** Currently it's a bare OAuth redirect — no welcome, no guidance
- **Implementation:**
  - "Welcome to Kept" screen with app value prop
  - "Connect your Gmail" button with Google branding
  - Progress indicator during OAuth + initial sync
  - "You're all set!" confirmation with keyboard shortcut hints
  - Skip if account already exists in DB
- **Acceptance:** New user opens app → guided through connection → lands in inbox with orientation

### KPT-084: Contact Avatars (Google People API)
- **Priority:** P2
- **What:** Pull real profile photos from Google People API for known contacts
- **Why:** Thread list uses color-hashed initials — real photos make threads instantly scannable
- **Implementation:**
  - Call People API `people.connections.list` with `photos` field
  - Cache avatar URLs in SQLite (email → photo_url, expires in 7 days)
  - In thread row and reader header: if cached photo exists, render `<img>` instead of initial circle
  - Fallback to current color-hashed initials if no photo
  - Requires `https://www.googleapis.com/auth/contacts.readonly` scope addition
- **Acceptance:** Known contacts show real photos in thread list and reader

---

## Priority 4: Polish & Power Features

### KPT-085: Keyboard Shortcut Discoverability
- **Priority:** P2
- **What:** Contextual shortcut hints in the UI (not just the `?` overlay)
- **Why:** Users don't know they can press `/` for search or `x` for select until they discover it
- **Implementation:**
  - Subtle hint text at bottom of empty inbox: "Press ? for shortcuts"
  - Tooltip on hover actions showing keyboard equivalent
  - First-run tour highlighting top 5 shortcuts

### KPT-086: Notification Badges (Sidebar)
- **Priority:** P2
- **What:** Show unread count badge on the inbox icon in the 48px sidebar
- **Why:** When in other views (sent, drafts), user should see new email arrived
- **Implementation:**
  - Poll or re-check unread count on sync
  - Red dot or count badge on inbox sidebar icon
  - Clear when viewing inbox

### KPT-087: Thread Mute Improvements
- **Priority:** P3
- **What:** Muted threads skip inbox entirely on future messages
- **Why:** Currently mute labels in Gmail but new messages still appear locally
- **Implementation:**
  - On sync, check thread label for "muted" → skip rendering
  - "Unmute" option in context menu and command palette

---

## Backlog (Phase 3 — Requires Backend)

### KPT-090: AI Email Summary
- **Blocked:** No AI backend in vanilla TS Tauri stack
- **What:** One-line summary at top of long threads
- **Options:** Local LLM via Tauri sidecar, or external API call

### KPT-091: Smart Reply Suggestions
- **Blocked:** Same as above
- **What:** 3 suggested reply chips based on email content

---

## Implementation Notes

- All work uses git worktrees at `.worktrees/<branch-name>`
- Pipeline: plan → implement (Claude Code) → `npm run verify` → merge to main → push
- "Done" = merged to main, not left in a branch
- Build target: <200KB JS, <50KB CSS
- Current: 171KB JS, 42KB CSS, 84 tests passing
