# Kept — Backlog

## Security / Dependency

- [ ] **glib 0.18 → 0.20 (CVE: unsound VariantStrIter)** — Moderate severity (6.9 CVSS v4). Transitive dep via `gtk 0.18 → libappindicator → tray-icon → tauri`. Not directly exploitable from our code (we never iterate GVariant strings). Blocked on Tauri bumping their tray-icon/gtk dep chain. Re-check when Tauri releases a major update.

## Features

- [ ] **Code signing + distribution** — Apple Developer ($99/yr) for macOS+iOS, Windows cert for SmartScreen, Android self-sign. Not needed until ready to distribute outside dev machine.
- [ ] **AI thread summaries + smart reply chips** — Local Ollama integration. Deferred until app is daily-driver stable.
- [ ] **Rich text send** — Send `text/html` alternative part (~30min scope).
- [ ] **Thread actions** — Mark unread, spam, move-to-label.
- [ ] **Drafts open in Compose** — Clicking a draft in the Drafts view should open it in the floating compose panel (prefilled), not the thread reader.
- [ ] **Background send daemon** — OS-level sidecar (launchd/systemd/Task Scheduler) to dispatch scheduled sends when app is closed. Ship alongside code-signing/installer work.
- [ ] **E2E test suite** — Infrastructure ready; actual test files not written.

## Tech Debt

- [ ] **~300 lines dead CSS** — Orphaned classes from prior refactors.
- [ ] **Fragile 50ms setTimeout** — Race condition workaround in thread reader.
