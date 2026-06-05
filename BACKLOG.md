# Kept — Backlog

## Security / Dependency

- [ ] **glib 0.18 → 0.20 (CVE: unsound VariantStrIter)** — Moderate severity (6.9 CVSS v4). Transitive dep via `gtk 0.18 → libappindicator → tray-icon → tauri`. Not directly exploitable from our code (we never iterate GVariant strings). Blocked on Tauri bumping their tray-icon/gtk dep chain. Re-check when Tauri releases a major update.

## Research

- [ ] **Local device discovery (no cloud)** — Deep research how to detect that iPhone and MacBook (and devices in general) are on the same network without any cloud dependency. Protocols: mDNS/Bonjour, SSDP, BLE advertising, Multipeer Connectivity, etc.
- [ ] **Secure device-to-device auth + data transfer** — Research how to securely authenticate device-to-device and transfer data locally. TLS with TOFU, SRP, QR-code key exchange, Noise protocol, etc.

## Features

- [ ] **Code signing + distribution** — Apple Developer ($99/yr) for macOS+iOS, Windows cert for SmartScreen, Android self-sign. Not needed until ready to distribute outside dev machine.
- [ ] **AI thread summaries + smart reply chips** — Local Ollama integration. Deferred until app is daily-driver stable.

- [ ] **Background send daemon** — OS-level sidecar (launchd/systemd/Task Scheduler) to dispatch scheduled sends when app is closed. Ship alongside code-signing/installer work.
- [x] **Fetch all Gmail system labels** — Sync now fetches INBOX, SENT, DRAFT, STARRED, and TRASH in parallel. `syncThread` derives canonical label from actual Gmail `labelIds`. Archive detected when thread lacks all system labels. Done (dc7bbe7).
- [ ] **E2E test suite** — Infrastructure ready; actual test files not written.
- [ ] **Connect AgentMail** — Integrate AgentMail for programmatic email send/receive.

## Premium-Killer Features (no AI required)

These are the features Spark/Superhuman charge $30/mo for. All are pure logic — no ML.

- [ ] **Follow-up reminders ("Remind if no reply")** — When sending, set a timer: if no reply by X time, email reappears in inbox as actionable. Track sent message ID, watch for reply, re-surface on expiry. Dedicated Reminders view. (Superhuman $30/mo, Spark Premium)
- [ ] **Set Aside (Shelf/Bubble)** — Move emails to a persistent quick-access shelf for later reference. Not snoozed (no time component), not archived. Keyboard shortcut + sidebar section. Unique to Spark Premium — fills the gap between "needs action but not now" and "archive."
- [ ] **Priority Senders** — Mark senders as Priority → their emails always surface at top of inbox, highlighted. Per-sender toggle in settings or right-click. Priority threads get dedicated notification treatment. (Spark Premium, Superhuman Split Inbox)
- [ ] **Smart Folders (saved search as virtual folder)** — Create virtual folders from search queries (e.g. "PDFs from John this year", "has:attachment from:@company.com"). Persisted in sidebar. Client-side filter on SQLite. (Spark Premium)
- [ ] **Multi-Window (detachable reader & composer)** — Open emails and composer in separate OS windows. Reference one email while writing another. Tauri supports multi-window natively. (Spark Premium/Desktop)
- [ ] **Email Focus Schedule** — Limit inbox access to scheduled sessions (e.g. 9am, 12pm, 6pm). Between sessions, show a summary screen with unread count. Counts daily inbox checks. Optional notification when session starts. (Spark paid plans)
- [ ] **Read Receipts** — Embed tracking pixel on send; log opens with timestamp + device. Toggle per-email. Show read/unread indicator in Sent view. (Superhuman $30/mo, Newton $50/yr)
- [ ] **Gatekeeper (Sender Screening)** — New/unknown senders land in a screening queue; approve to allow future messages into inbox, reject to auto-trash. One-time decision per sender. (Spark Plus $10/mo, HEY $99/yr "Screener")
- [ ] **Social Insights** — Show sender context (job title, company, social links) from public data (Gravatar, Clearbit-like lookup). Display in thread header. No API key needed for basic Gravatar. (Superhuman $30/mo, Newton $50/yr "Sender Profile")
- [ ] **Get Me to Zero** — Guided inbox-zero workflow: triage mode that presents emails one-by-one with quick actions (archive, snooze, reply, set aside). Tracks daily progress. (Superhuman $30/mo)
- [ ] **Auto Labels (rule-based)** — User-defined rules that auto-apply labels on incoming mail (e.g. "from:@github.com → Dev", "subject:invoice → Finance"). Client-side filter on sync. No AI needed. (Spark Pro $20/mo, Superhuman Business $40/mo)
- [ ] **Newsletter Feed** — Dedicated reading view for newsletters/marketing, separated from actionable email. Auto-detect via List-Unsubscribe header or sender pattern. Card-style layout. (HEY $99/yr "The Feed")
- [ ] **Paper Trail** — Auto-sort transactional emails (receipts, confirmations, shipping) into a dedicated section. Detect via subject patterns + known sender domains. (HEY $99/yr)
- [ ] **Calendar Integration** — Inline calendar view in sidebar. Parse .ics attachments and event invites. Show upcoming events in context of related email threads. (Superhuman $30/mo)
- [ ] **Multi-Account** — Add and switch between multiple Gmail/IMAP accounts in one window. Unified inbox option. Per-account color coding. (Shortwave Pro $24/mo gates 3+ accounts)

## UI / Layout

- [x] **Draft save animation on Compose close** — Shrink & Fly (direction A chosen). Compose panel shrinks and flies into the Drafts nav icon with a glow + badge pulse on arrival. Reference mockup: `mockups/draft-animation-A-shrink-fly.html`. Implementation: CSS transition with `transform-origin: bottom right`, 0.6s cubic-bezier, glow highlight on Drafts icon at 500ms, badge pulse at completion.
- [x] **Draft close animation polish** — Slow down the shrink-fly animation so the direction toward the Drafts icon is unmistakable. Add a small shake/wiggle animation on the Drafts nav icon when the panel arrives to draw the eye. Current 0.6s feels too fast; try ~1s+ with a clearer flight arc. Done.
- [x] **Remove Compose minimize path entirely** — No minimize state for the Compose panel. The bottom bar will host other actions in the future; minimize adds clutter. Strip all minimize logic, button, and collapsed state.
- [x] **Spacebar selects in arrow-key navigation mode** — When keyboard navigation is active (arrow/j/k), pressing spacebar toggles selection on the focused email row. In reader view, spacebar still scrolls. Done.
- [x] **"Updates" category label not visible in thread row** — The category name ("Updates") is hidden/clipped; only the sender pills are visible. The `.thread-sender` text needs to be shown prominently before/above the pill row so users can identify the category at a glance. See: `img_31e2c7b5081e.jpg`. Done.
- [x] **Sender pill clicks in Updates/Newsletters should open the category, not the sender group** — Thread rows for Updates and Newsletters show clickable pill buttons per sender. Clicking a pill currently opens that sender's group; it should open the Updates/Newsletters category view instead.
- [x] **Thread hover background color matches arrow selection/navigation color** — Keyboard-selected row now has a purple-tinted background + left accent border; hover remains neutral gray. Visually distinct. Done.
- [x] **Row selection: remove left accent border; hover = selection color** — On selected row, drop the left accent border. Mouse hover should use the same purple-tinted background as the keyboard/click selection state (not neutral gray). Done.
- [x] **Reduce vertical spacing in thread rows (Medium/Small)** — Tighten the gap between Sender, subject line, and preview line on Medium and Small density views. Currently too loose; should feel compact without sacrificing readability. Done.
- [x] **Status bar: move to right side, half width** — The status bar currently renders on the left. Reposition it to the right side and reduce its width to 50%.
- [x] **Bulk/group action buttons on multi-select** — When multiple threads are selected, action buttons switch to bulk/group mode and only show actions that apply to groups (e.g. archive, delete, mark read/unread, move). Single-thread-only actions (reply, forward) are hidden.
- [x] **New-sender-expand button hides left navbar** — Clicking the expand button on new-sender cards causes the left navigation sidebar to disappear. Should preserve navbar visibility.
- [x] **Section labels hidden on small viewports** — Fixed: added `white-space: nowrap`, `overflow: visible`, `min-height: 28px` to `.section-header`, and reduced left padding at ≤600px breakpoint. Done.
- [x] **Inbox section labels → Title Case** — ~~ALL-CAPS~~ → Title Capitalization. Done (84fb3fd).
- [x] **Sender cards aligned with avatar on email threads** — Thread-summary participant avatars now render first (left-aligned with msg-avatar below). Done (b619ccd).
- [x] **Right-align Compose button with Date/Time column** — Toolbar right padding now matches thread-row padding. Done (84fb3fd).
- [x] **New senders (first) card left-aligned with avatar** — Row padding now matches thread-row avatar alignment. Done (a50ebeb).
- [x] **Nav bar tooltips must appear to the right of the button, not below** — Sidebar tooltip rule now a standalone block after the generic tooltip system; no longer overridden. Done (a50ebeb).
- [x] **Arrow-key navigation overrides hover** — `.keyboard-nav` class added on arrow/j/k; removed on mousemove. Suppresses hover highlight when keyboard is active. Done (a50ebeb).
- [x] **Email sync must preserve current view** — `syncAndRender` and `refreshAll` now call `renderCurrentView()` which re-renders the active view (Drafts, Sent, etc.) instead of always resetting to Inbox. Done (af73eab).
- [x] **Bottom spacing on email list** — 40px bottom padding on .inbox. Done (84fb3fd).
- [ ] **KPT-084: Proper tooltips on all unlabelled icons/buttons** — Audit every icon button without a visible text label and add accessible tooltips. Placement must be UX-correct: sidebar (leftmost) icons → tooltip on right; toolbar (top) icons → tooltip below; bottom-positioned elements → tooltip above. If vanilla CSS/JS `title` attr is insufficient for controlled placement, find and install a minimal tooltip library that passes `pnpm audit` (e.g. tippy.js or floating-ui). Acceptance: every icon button has a tooltip, placement never clips viewport, works on hover + focus.

## Tech Debt

- [x] **~300 lines dead CSS** — Removed `.btn-pill`, `.closing` animations, `fadeOut`/`slideDown` keyframes (60 lines net). Remaining classes all confirmed referenced. Done (ce1ca1e).
- [x] **Fragile 50ms setTimeout** — `openThreadWithReply` now awaits the render promise; search focus uses `requestAnimationFrame`. Done (ce1ca1e).
