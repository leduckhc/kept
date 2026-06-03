# Kept — Backlog

## Security / Dependency

- [ ] **glib 0.18 → 0.20 (CVE: unsound VariantStrIter)** — Moderate severity (6.9 CVSS v4). Transitive dep via `gtk 0.18 → libappindicator → tray-icon → tauri`. Not directly exploitable from our code (we never iterate GVariant strings). Blocked on Tauri bumping their tray-icon/gtk dep chain. Re-check when Tauri releases a major update.

## Features

- [ ] **Code signing + distribution** — Apple Developer ($99/yr) for macOS+iOS, Windows cert for SmartScreen, Android self-sign. Not needed until ready to distribute outside dev machine.
- [ ] **AI thread summaries + smart reply chips** — Local Ollama integration. Deferred until app is daily-driver stable.

- [ ] **Background send daemon** — OS-level sidecar (launchd/systemd/Task Scheduler) to dispatch scheduled sends when app is closed. Ship alongside code-signing/installer work.
- [ ] **E2E test suite** — Infrastructure ready; actual test files not written.

## UI / Layout

- [ ] **Inbox section labels → Title Case** — Time-grouped section headers (New Senders, Today, This Week, May, …) currently render as ALL-CAPS. Switch to Title Capitalization for a calmer visual hierarchy.
- [ ] **Sender cards aligned with avatar on email threads** — The new sender cards must be visually aligned with the avatar in threaded email views.
- [ ] **Right-align Compose button with Date/Time column** — The Compose button in the top bar should be right-aligned so its right edge lines up with the right edge of the Date/Time column in thread rows.
- [ ] **Email sync must preserve current view** — Auto-sync (and manual refresh) redraws Inbox regardless of which page is active. If user is on Drafts, Sent, or any other folder, sync should re-fetch and redraw that same folder — not reset to Inbox. Sidebar icon stays correct but content resets.
- [ ] **Bottom spacing on email list** — Last email/row sits too close to the bottom edge of the window when scrolled to end. Add vertical padding/margin after the last row so it doesn't feel cramped.

## Tech Debt

- [ ] **~300 lines dead CSS** — Orphaned classes from prior refactors.
- [ ] **Fragile 50ms setTimeout** — Race condition workaround in thread reader.
