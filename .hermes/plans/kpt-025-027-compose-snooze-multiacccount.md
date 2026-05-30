# Kept: Sprint — Compose New, Snooze, Multi-Account

**Date:** 2025-05-30  
**Branch:** main  
**Owner:** Bob (CEO)  
**Team:** John (backend/Rust/DB), Harry (frontend/UX), Denisa (design)  
**Board:** kept  
**Next card IDs:** KPT-025, KPT-026, KPT-027

---

## Context

Kept is a local-first email client built on Tauri v2 + TypeScript + SQLite.  
Stack: `src/main.ts` (~500 LOC), `src/gmail.ts` (~506 LOC), `src/db.ts` (~87 LOC).  
Deployed as a desktop app. All mail is synced to a local SQLite DB. Gmail is the only provider so far.  
Already shipped: OAuth login, inbox sections, archive/block, inline reply, incremental sync, attachment detection, FTS5 (in progress KPT-021), OS notifications (KPT-022), keyboard shortcuts (KPT-024), Gmail labels nav (KPT-023).

DB schema already has `account_id` on all tables — multi-account foundation is in place.  
No compose-new (fresh thread), no snooze, no multi-account switcher.

---

## Feature 1: KPT-025 — Compose New Email

### Problem
Kept only has an inline reply (`#compose` div, reply textarea). Users cannot start a new thread from within the app — a critical gap for daily driver viability. Every time a user wants to compose fresh, they leave the app.

### Goal
Add a compose-new modal (fresh thread): To field, Subject field, Body, Send button. Wire to Gmail `messages.send` API. Match the existing minimalist aesthetic — no bloat.

### Scope
- Compose button in the top-right header (not in any thread pane)
- Modal: To (email input, autocomplete from local contacts), Subject, Body (plain text first), Send, Discard
- On Send: call `gmail.ts:sendEmail` (already exists for replies) with To + Subject as new fields
- On Discard: prompt if body non-empty
- Keyboard shortcut: `c` to open compose (add to KPT-024's registry)
- Local DB: no new tables needed — sent items already sync via Gmail
- Error handling: show inline error on send failure (network, quota, invalid address)

### Out of scope (deferred)
- Rich text / HTML body
- CC / BCC fields (can add in a follow-up, base modal is enough)
- Attachments in compose
- Draft save to Gmail Drafts (can add later)

### Cards
- **KPT-025D** — Denisa: Design compose modal (To/Subject/Body/Send/Discard). Must fit the near-monochrome minimalist theme. Deliver mockup. 2 variants: modal overlay vs slide-in panel.
- **KPT-025H** — Harry: Implement compose modal UI. Wire close/discard/keyboard shortcut.
- **KPT-025J** — John: Wire compose send to Gmail API (extend `sendEmail` to accept `to` and `subject` params, create new message thread vs reply).
- **KPT-025B** — Bob: Integration review, merge to main.

### Acceptance criteria
- [ ] Compose button visible in header, opens modal on click and on `c` key
- [ ] To field validates email format before enabling Send
- [ ] Body required before Send enabled
- [ ] Send calls Gmail API, sent email appears in Gmail Sent folder within 30s
- [ ] Discard prompts if body non-empty
- [ ] No JS errors in console during compose flow
- [ ] Design matches minimalist theme (dark/light)

---

## Feature 2: KPT-026 — Snooze (Local Thread Re-surface)

### Problem
Users often see emails they cannot act on immediately. Without snooze, those emails are either left unread (cluttering inbox) or archived (forgotten). Snooze is a retention-driving power feature for the primary target persona: people who use email seriously.

### Goal
Snooze a thread: it disappears from inbox and reappears at a specified time. Fully local — no Gmail API changes needed. SQLite `snoozed_until` column + a Tauri background check when the app gains focus.

### Scope
- Right-click context menu (or swipe action) on a thread row: "Snooze"
- Snooze picker: quick presets (Later today, Tomorrow morning, This weekend, Next week) + custom datetime
- Snoozed threads: hidden from main inbox sections
- On app focus (Tauri `window focus` event): query `snoozed_until <= now`, resurface expired snoozes
- Snooze indicator: small clock icon on a snoozed thread if visible (e.g. in All Mail or a Snoozed view)
- Migration: add `snoozed_until INTEGER NULL` and `snooze_label TEXT NULL` to `threads` table

### Out of scope (deferred)
- Background wake (when app is closed, snooze fires on next open — acceptable for v1)
- Snooze via OS notification action
- Bulk snooze

### Cards
- **KPT-026D** — Denisa: Design snooze UX: context menu, picker presets, clock indicator on snoozed row.
- **KPT-026J** — John: DB migration (`snoozed_until`, `snooze_label`), snooze/unsnooze API, resurface logic on app focus event.
- **KPT-026H** — Harry: Snooze context menu, picker UI (presets + custom), clock indicator, hide/show in inbox sections.
- **KPT-026B** — Bob: Integration review, merge to main.

### Acceptance criteria
- [ ] Right-click on thread row shows "Snooze" option
- [ ] Snooze picker shows 4 presets + custom option
- [ ] Snoozed thread disappears from inbox immediately
- [ ] On next app focus after snooze time: thread reappears in inbox at top
- [ ] Snooze survives app restart (persisted in SQLite)
- [ ] No performance regression: focus check completes in <100ms for 10k threads

---

## Feature 3: KPT-027 — Multi-Account (Add a Second Gmail Account)

### Problem
Power users manage 2+ Gmail accounts. The DB already has `account_id` everywhere — schema foundation is in place. What's missing: the UI account switcher and parallel sync management. This is the single most-requested feature pattern for email clients.

### Goal
Allow adding a second Gmail account. Each account syncs independently. User can switch between accounts with an account switcher in the header. Inbox shows the active account's mail.

### Scope
- "Add Account" flow: triggers OAuth in a new Tauri webview window, stores credentials under a second `account_id` in the local keychain
- Account switcher UI: small avatar/initials button in header, dropdown showing all accounts + "Add Account"
- Parallel sync: `gmail.ts` sync loop is keyed per account, runs for all authenticated accounts on startup
- Active account state: global in-memory `currentAccountId`, UI re-renders on switch
- Outbox/compose: always uses active account's credentials
- Error state per account: if one account's token expires, show per-account error indicator without blocking the other account

### Out of scope (deferred)
- Unified inbox across accounts (can be a follow-up sprint)
- Cross-account search
- Account reorder / remove (can add UI for remove in follow-up)

### Cards
- **KPT-027D** — Denisa: Design account switcher UI (header avatar/dropdown, "Add Account" CTA, per-account error indicator).
- **KPT-027J** — John: Add Account OAuth flow (second Tauri webview), multi-account keychain storage, parallel sync loop (one sync per account), `currentAccountId` state management.
- **KPT-027H** — Harry: Account switcher UI component, active account context, inbox re-render on switch, per-account error badge.
- **KPT-027B** — Bob: Integration review, merge to main.

### Acceptance criteria
- [ ] User can add a second Gmail account via OAuth without re-logging the first
- [ ] Account switcher shows all accounts + "Add Account" 
- [ ] Switching accounts re-renders the inbox with that account's mail
- [ ] Both accounts sync in parallel on startup
- [ ] Compose/reply always uses the active account
- [ ] If one account's token is revoked, the other account continues to work
- [ ] No cross-account data leaks (threads only shown for active account)

---

## Sequencing

1. **KPT-025** (Compose) — Start immediately. Design first, then Harry + John in parallel.
2. **KPT-026** (Snooze) — Can start in parallel with 025. No design dependency on 025.
3. **KPT-027** (Multi-Account) — Start after 025 is designed (account switcher needs compose header context). Design can begin in parallel.

Design cards (025D, 026D, 027D) can all run in parallel — Denisa is the bottleneck, so stagger them with 025D first, then 026D + 027D together.

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Gmail `messages.send` requires correct thread-id for replies vs new threads | High | Already handled in sendEmail — extend, don't rewrite |
| Snooze resurface misses if app is never focused (power off) | Low | Acceptable for v1; resurfaces on next open |
| Multi-account OAuth second webview: Tauri webview isolation | Medium | Use separate webview instance per account OAuth, store token keyed by `account_id` |
| Multi-account sync parallelism: token race | Medium | John to use per-account mutex in sync loop |

---

## Definition of Done

Each feature is done when its integration card (025B, 026B, 027B) is merged to `main` and passing CI.
