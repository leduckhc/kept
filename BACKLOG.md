# Kept — Backlog

## Security / Dependency

- [ ] **glib 0.18 → 0.20 (CVE: unsound VariantStrIter)** — Moderate severity (6.9 CVSS v4). Transitive dep via `gtk 0.18 → libappindicator → tray-icon → tauri`. Not directly exploitable from our code (we never iterate GVariant strings). Blocked on Tauri bumping their tray-icon/gtk dep chain. Re-check when Tauri releases a major update.

## Features

- [ ] **Code signing + distribution** — Apple Developer ($99/yr) for macOS+iOS, Windows cert for SmartScreen, Android self-sign. Not needed until ready to distribute outside dev machine.
- [ ] **AI thread summaries + smart reply chips** — Local Ollama integration. Deferred until app is daily-driver stable.

- [ ] **Background send daemon** — OS-level sidecar (launchd/systemd/Task Scheduler) to dispatch scheduled sends when app is closed. Ship alongside code-signing/installer work.
- [ ] **E2E test suite** — Infrastructure ready; actual test files not written.

## Premium-Killer Features (no AI required)

These are the features Spark/Superhuman charge $30/mo for. All are pure logic — no ML.

- [ ] **Follow-up reminders ("Remind if no reply")** — When sending, set a timer: if no reply by X time, email reappears in inbox as actionable. Track sent message ID, watch for reply, re-surface on expiry. Dedicated Reminders view. (Superhuman $30/mo, Spark Premium)
- [ ] **Set Aside (Shelf/Bubble)** — Move emails to a persistent quick-access shelf for later reference. Not snoozed (no time component), not archived. Keyboard shortcut + sidebar section. Unique to Spark Premium — fills the gap between "needs action but not now" and "archive."
- [ ] **Priority Senders** — Mark senders as Priority → their emails always surface at top of inbox, highlighted. Per-sender toggle in settings or right-click. Priority threads get dedicated notification treatment. (Spark Premium, Superhuman Split Inbox)
- [ ] **Smart Folders (saved search as virtual folder)** — Create virtual folders from search queries (e.g. "PDFs from John this year", "has:attachment from:@company.com"). Persisted in sidebar. Client-side filter on SQLite. (Spark Premium)
- [ ] **Multi-Window (detachable reader & composer)** — Open emails and composer in separate OS windows. Reference one email while writing another. Tauri supports multi-window natively. (Spark Premium/Desktop)
- [ ] **Email Focus Schedule** — Limit inbox access to scheduled sessions (e.g. 9am, 12pm, 6pm). Between sessions, show a summary screen with unread count. Counts daily inbox checks. Optional notification when session starts. (Spark paid plans)

## UI / Layout

- [x] **Inbox section labels → Title Case** — ~~ALL-CAPS~~ → Title Capitalization. Done (84fb3fd).
- [x] **Sender cards aligned with avatar on email threads** — Thread-summary participant avatars now render first (left-aligned with msg-avatar below). Done (b619ccd).
- [x] **Right-align Compose button with Date/Time column** — Toolbar right padding now matches thread-row padding. Done (84fb3fd).
- [x] **New senders (first) card left-aligned with avatar** — Row padding now matches thread-row avatar alignment. Done (a50ebeb).
- [x] **Nav bar tooltips must appear to the right of the button, not below** — Sidebar tooltip rule now a standalone block after the generic tooltip system; no longer overridden. Done (a50ebeb).
- [x] **Arrow-key navigation overrides hover** — `.keyboard-nav` class added on arrow/j/k; removed on mousemove. Suppresses hover highlight when keyboard is active. Done (a50ebeb).
- [x] **Email sync must preserve current view** — `syncAndRender` and `refreshAll` now call `renderCurrentView()` which re-renders the active view (Drafts, Sent, etc.) instead of always resetting to Inbox. Done (af73eab).
- [x] **Bottom spacing on email list** — 40px bottom padding on .inbox. Done (84fb3fd).

## Tech Debt

- [x] **~300 lines dead CSS** — Removed `.btn-pill`, `.closing` animations, `fadeOut`/`slideDown` keyframes (60 lines net). Remaining classes all confirmed referenced. Done (ce1ca1e).
- [x] **Fragile 50ms setTimeout** — `openThreadWithReply` now awaits the render promise; search focus uses `requestAnimationFrame`. Done (ce1ca1e).
