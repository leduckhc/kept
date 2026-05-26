# KPT-008 Soft Inbox acceptance

Date: 2026-05-26
Owner: Bob
Merged branch: main

## Outcome

KPT-008 is accepted as the Kept Soft Inbox No Sidebar slice. The desktop app now opens directly to the Inbox app surface instead of a landing hero. It uses deterministic synthetic inbox data, shows New senders, and groups mail into Priority, Today, Yesterday, and Last Week.

## Integrated work

- John / data foundation: `/home/le/kept.worktrees/kpt-008-inbox-data`, branch `feat/kpt-008-inbox-data`, commit `4c91090`.
- Harry / UI shell: `/home/le/kept.worktrees/kpt-008-soft-inbox-ui`, branch `feat/kpt-008-soft-inbox-ui`, commits `f303fb3`, `b2bf874`.
- Denisa / design polish: `/home/le/kept.worktrees/kpt-008-soft-inbox-polish`, branch `design/kpt-008-soft-inbox-polish`, commit `2769e33`.

## Verification

- `npm run test`: pass, 23/23 tests.
- `npm run verify`: pass, including typecheck, lint, test, build, and Tauri scaffold check.
- Browser visual QA at `http://127.0.0.1:5173/`: pass.

## Product gates

- No sidebar / left rail: pass. The runtime app renders one centered inbox surface.
- No landing hero: pass. The old marketing hero/CTA has been replaced by the Inbox surface.
- New senders carousel: pass. Four synthetic sender cards render with Accept / Block actions.
- Required sections: pass. Priority, Today, Yesterday, and Last Week are visible.
- One line equals one email: pass for desktop scan rows; mobile polish evidence is in Denisa QA.
- Quiet Ask/search/status: pass. Search is a compact command pill; local/BYO-AI status is small and non-panelized.
- No real user data: pass. Inbox data is deterministic synthetic sample content using demo/example domains and explicit synthetic previews.
- No secret/token/body logging introduced: pass. KPT-008 runtime source adds no app-source console logging.
- No live Gmail behavior changes: pass. The KPT-008 mail-core diff adds sample inbox data and grouping only; Gmail connector/OAuth behavior is unchanged.
- No large AI module: pass. The desktop UI only displays the existing disabled BYO-AI status.
- No Charles/Charlie Kept assignment: pass.

## Visual evidence

- Final desktop screenshot: `docs/screenshots/kpt-008-soft-inbox-final-desktop.png`
- Denisa desktop QA screenshot: `docs/qa/kpt-008-soft-inbox-polish/desktop-1440.png`
- Denisa mobile QA screenshot: `docs/qa/kpt-008-soft-inbox-polish/mobile-390.png`
- Design QA report: `docs/qa/kpt-008-soft-inbox-polish/qa-report.md`

## CEO decision

Ship it. This is the right v1 direction: inbox-first, no sidebar, soft app UI, local-first/BYO-AI trust shown quietly instead of as a dashboard panel.
