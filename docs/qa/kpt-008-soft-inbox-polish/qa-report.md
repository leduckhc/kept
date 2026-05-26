# KPT-008C Kept Soft Inbox design QA

Approved reference:
- `/home/le/.gstack/projects/leduckhc-kept/designs/kpt-007-kept-soft-inbox-no-sidebar-20260526-072049/kept-soft-inbox-no-sidebar.svg`
- `/home/le/.gstack/projects/leduckhc-kept/designs/kpt-007-kept-soft-inbox-no-sidebar-20260526-072049/implementation-spec.md`

Screenshots:
- Desktop 1440px: `/home/le/kept.worktrees/kpt-008-soft-inbox-polish/docs/qa/kpt-008-soft-inbox-polish/desktop-1440.png`
- Mobile 390px: `/home/le/kept.worktrees/kpt-008-soft-inbox-polish/docs/qa/kpt-008-soft-inbox-polish/mobile-390.png`

## Milan constraints

| Constraint | Verdict | Notes |
| --- | --- | --- |
| No sidebar | PASS | Single main inbox surface only; no left rail/sidebar/nav column at desktop or mobile. |
| Main inbox | PASS | Inbox is the primary product surface with no split pane or secondary navigation. |
| New senders carousel | PASS | Four sender review cards with avatar, sender, email, latest subject, Accept, and neutral Block actions. Desktop shows four cards; mobile uses horizontal overflow. |
| Priority / Today / Yesterday / Last Week | PASS | Required section order is preserved under New senders. |
| One line = one email | PASS after polish | Desktop rows are 44px single-line scan units. Mobile rows now stay compact and single-line with sender, subject, and concise time/date; previews are hidden on narrow screens. |
| Quiet Ask/search/status | PASS after polish | Search is a quiet pill with ⌘K affordance; local/BYO-AI status is small text with green dot and no feature-panel treatment. |

## Fixes applied

- Reworked topbar title from a large `8 messages · 3 unread` headline into `Inbox` plus a quiet count, preventing the search pill from visually crowding the title.
- Narrowed the desktop search grid column so brand, title, search, and status read as a calm top bar.
- Replaced exposed row `Keep` / `Archive` buttons with a single hover overflow affordance (`⋯`) on desktop.
- Hid row actions on mobile so each email remains a compact scan row rather than an action stack.
- Shortened row timestamps to time for same-day mail and month/day for older mail, matching the approved reference better and giving mobile rows enough breathing room.
- Tightened desktop row height to the 44px target.

## Remaining caveats

- Mobile sender/subject text necessarily truncates at 390px to preserve the one-line constraint. This is acceptable for the approved soft-inbox direction; row detail/expansion should own full metadata later.
- New sender carousel card 2 is partially visible on mobile by design to signal horizontal scroll. Actions remain visible on the active card.

## Verification

- `npm run verify` passed: typecheck, lint, 23 tests, build, and Tauri scaffold check.
- Screenshots were captured from this worktree on `http://localhost:5174` to avoid the existing sibling worktree server on `:5173`.
