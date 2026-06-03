# Kept — Backlog

## Security / Dependency

- [ ] **glib 0.18 → 0.20 (CVE: unsound VariantStrIter)** — Moderate severity (6.9 CVSS v4). Transitive dep via `gtk 0.18 → libappindicator → tray-icon → tauri`. Not directly exploitable from our code (we never iterate GVariant strings). Blocked on Tauri bumping their tray-icon/gtk dep chain. Re-check when Tauri releases a major update.

## Features

- [ ] **Code signing + distribution** — Apple Developer ($99/yr) for macOS+iOS, Windows cert for SmartScreen, Android self-sign. Not needed until ready to distribute outside dev machine.
- [ ] **AI thread summaries + smart reply chips** — Local Ollama integration. Deferred until app is daily-driver stable.

- [ ] **Background send daemon** — OS-level sidecar (launchd/systemd/Task Scheduler) to dispatch scheduled sends when app is closed. Ship alongside code-signing/installer work.
- [ ] **E2E test suite** — Infrastructure ready; actual test files not written.

## UI / Layout

- [x] **Inbox section labels → Title Case** — ~~ALL-CAPS~~ → Title Capitalization. Done (84fb3fd).
- [ ] **Sender cards aligned with avatar on email threads** — The new sender cards must be visually aligned with the avatar in threaded email views.
- [x] **Right-align Compose button with Date/Time column** — Toolbar right padding now matches thread-row padding. Done (84fb3fd).
- [ ] **Email sync must preserve current view** — Auto-sync (and manual refresh) redraws Inbox regardless of which page is active. If user is on Drafts, Sent, or any other folder, sync should re-fetch and redraw that same folder — not reset to Inbox. Sidebar icon stays correct but content resets.
- [x] **Bottom spacing on email list** — 40px bottom padding on .inbox. Done (84fb3fd).

## Tech Debt

- [ ] **~300 lines dead CSS** — Orphaned classes from prior refactors.
- [ ] **Fragile 50ms setTimeout** — Race condition workaround in thread reader.
