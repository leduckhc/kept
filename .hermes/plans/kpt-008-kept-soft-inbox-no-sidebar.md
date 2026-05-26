# KPT-008 Kept Soft Inbox No Sidebar Implementation Plan

## Product decision
Build Kept's primary desktop mail UI from the approved **Kept Soft Inbox No Sidebar** direction.

Approved artifacts:
- Mockup: `/home/le/.gstack/projects/leduckhc-kept/designs/kpt-007-kept-soft-inbox-no-sidebar-20260526-072049/kept-soft-inbox-no-sidebar.svg`
- Spec board: `/home/le/.gstack/projects/leduckhc-kept/designs/kpt-007-kept-soft-inbox-no-sidebar-20260526-072049/comparison-spec-board.html`
- Spec: `/home/le/.gstack/projects/leduckhc-kept/designs/kpt-007-kept-soft-inbox-no-sidebar-20260526-072049/implementation-spec.md`

## Milan constraints
- Use B's soft visual taste, but **no sidebar / no left rail** for now.
- Main screen is the Inbox.
- One line = one email.
- New senders appears as a card carousel.
- Sections: Priority, Today, Yesterday, Last Week.
- Avoid Spark clone chrome, dashboards, reader-dominant layout, three-pane layout, big AI modules, marketing copy.
- Keep Ask/search and local/BYO-AI status quiet in the top bar.
- Charles/Charlie is Foodmap CEO and does not work on Kept. Shared Kept implementers: Harry, John, Denisa; Bob reviews/accepts.

## Current code
- Current desktop app is still a landing/hero preview in `apps/desktop/src/main.js` and `apps/desktop/src/styles.css`.
- It imports seeded `sampleThreads` from `packages/mail-core/src/index.js`, search from `packages/search-core`, and BYO-AI status from `packages/ai-core`.
- `packages/ui/src/index.js` owns brand tokens and Pip mark.

## Target UX
1. Top bar
   - Pip/Kept mark left.
   - Inbox title and message count.
   - Compact Ask/search/command affordance.
   - Quiet local/BYO-AI status text.
2. New senders carousel
   - Horizontally scrollable small cards.
   - Each card: sender, short reason/snippet, Accept, Later/Block affordance.
   - Uses seeded synthetic data only.
3. Sectioned one-line inbox
   - Sections: Priority, Today, Yesterday, Last Week.
   - Row anatomy: unread dot/avatar, sender, subject, snippet, timestamp, tiny actions on hover/focus.
   - Selected/priority row uses very soft highlight.
4. Responsive behavior
   - Desktop-first Tauri surface.
   - At narrow widths, keep one-column inbox list. Carousel remains horizontal. Hide secondary row actions until hover/focus/tap.
5. Accessibility
   - Keyboard focus for search, cards, rows, row actions.
   - ARIA labels for carousel and buttons.
   - Contrast must remain readable on soft background.

## Implementation slices
### KPT-008A UI data and grouping foundation
Owner: John
Branch/worktree: `feat/kpt-008-inbox-data` at `/home/le/kept.worktrees/kpt-008-inbox-data`
Scope:
- Extend or adapt seeded mail data for new senders and sectioned inbox.
- Add pure helpers for grouping threads into Priority, Today, Yesterday, Last Week.
- Add tests for grouping, stable ordering, empty sections, and synthetic data redaction safety.
Acceptance:
- No real user data.
- `npm run test` passes.
- Existing mail/search tests still pass.

### KPT-008B Kept Soft Inbox UI shell
Owner: Harry
Branch/worktree: `feat/kpt-008-soft-inbox-ui` at `/home/le/kept.worktrees/kpt-008-soft-inbox-ui`
Scope:
- Replace landing/hero desktop preview with approved Inbox UI.
- Implement top bar, new senders carousel, sectioned one-line rows, hover/focus row actions, empty states.
- Use existing brand tokens/Pip mark and keep visual direction aligned to approved SVG.
Acceptance:
- No sidebar/left rail.
- One line = one email.
- New senders carousel visible.
- Sections visible with realistic seeded content.
- Responsive narrow-width layout remains usable.
- `npm run verify` passes in worktree.

### KPT-008C Design QA and polish
Owner: Denisa
Branch/worktree: `design/kpt-008-soft-inbox-polish` at `/home/le/kept.worktrees/kpt-008-soft-inbox-polish`
Scope:
- Review Harry's implementation against approved artifact.
- Produce desktop and narrow snapshots.
- File exact spacing/typography/color/interaction fixes or patch directly if safe.
Acceptance:
- Visual QA report with before/after screenshots.
- Explicit pass/fail against Milan constraints.

### KPT-008D Integration, review, and merge
Owner: Bob
Branch/worktree: main repo `/home/le/kept` plus implementation worktrees above
Scope:
- Sequence John foundation first, Harry UI second, Denisa QA third.
- Review diffs, run `npm run verify`, merge to `main`.
Acceptance:
- Done means merged to `main`.
- Final evidence: tests, visual snapshot, artifact paths, commit/PR info if used.

## Not in scope
- Persistent account/sidebar navigation.
- Full Gmail live sync changes.
- Full AI provider UI beyond quiet Ask/search affordance.
- Marketing landing page.
- Mobile app implementation.

## Test plan
- Unit tests for grouping and seeded inbox data.
- Desktop app build/typecheck/lint/test through `npm run verify`.
- Browser visual QA of desktop and narrow widths.
- Manual keyboard focus check for top bar, carousel controls, rows, and row actions.

## Autoplan review report

Status: APPROVED WITH REQUIRED AMENDMENTS. Milan's premises are accepted: Kept Soft Inbox No Sidebar is the chosen direction.

Scores:
- CEO: 8/10. Direction is right; make no-sidebar and no-landing-hero hard gates.
- Design: 7/10. Visual direction is right; implementation needs concrete layout targets from the approved artifact.
- Engineering: 6.5/10. Sequencing is right; data contract, deterministic grouping, safe rendering, and keyboard behavior need to be explicit.

### Required amendments accepted
1. No sidebar / no left rail is a hard regression gate at every review step.
2. Done means the desktop app opens to the Soft Inbox, not the current landing/hero preview.
3. KPT-008 must not introduce account navigation sidebar, dashboards, marketing hero copy, reader-first pane, large AI panels, or live Gmail sync changes.
4. Charles/Charlie must not appear as assignee, task owner, reviewer, or Kept implementation contributor.
5. Seeded inbox data must be large enough for all sections and fully synthetic.
6. Grouping helpers must accept injected `now` for deterministic tests.
7. Rendering seeded mail strings must use DOM APIs or escaping, not unsafe raw interpolation.
8. Command/search minimum: `⌘K` / `Ctrl+K` focuses search or opens lightweight Ask/search.
9. Keyboard accessibility must cover search, carousel controls, Accept/Block buttons, rows, and row actions.
10. Design QA must include desktop and narrow screenshots plus Milan-constraint pass/fail.

### Data contract for John
Export deterministic data/helpers from `packages/mail-core/src/index.js`:
- `sampleInboxThreads`
- `sampleNewSenders`
- `groupInboxThreads(threads, { now })`
- `getInboxSections(threads, { now })`

Minimum fields:
- `id`
- `sender`
- `senderEmail`
- `subject`
- `snippet`
- `receivedAt`
- `isPriority`
- `isUnread`
- `isNewSender`
- `avatarInitials`
- `avatarColor`
- optional `status`: `new`, `accepted`, `blocked`

Grouping rules:
- Priority: priority threads, regardless of date, sorted newest first.
- Today: non-priority threads received on injected `now` date.
- Yesterday: non-priority threads received one day before injected `now`.
- Last Week: non-priority threads within previous 2–7 days.
- Tests use fixed `now`, e.g. `2026-05-26T12:00:00Z`.

### Layout targets for Harry
- Warm page background: `#f5f5f1`.
- Rounded white app surface with desktop inset around `38px`.
- Desktop content margins around `112px`.
- Top bar height around `72px`.
- New sender card around `318 x 128px`.
- Row height around `44px`.
- Top bar content: Pip/Kept mark, Inbox title/count, `Ask or search mail`, visible `⌘K`, quiet `Local-first · BYO AI ready` status.
- Carousel card content: avatar/mark, sender name, email, latest subject/snippet, Accept, Block, quiet next/previous controls.
- Row content: avatar/initial, sender, subject, snippet, time/date, overflow/actions, unread/priority state.

### Additional test and QA gates
- `npm run test` after data foundation.
- `npm run verify` before UI handoff and before merge.
- Visual QA screenshots: desktop around 1440–1600px and narrow around 375–430px.
- Final review confirms: no sidebar, no landing hero, no real user data, no secret/token/body logging, no live Gmail behavior changes, no large AI settings panel, no Charles/Charlie Kept assignment.

### Final implementation tasks after autoplan
#### KPT-008A — Data and grouping foundation
Owner: John. Worktree `/home/le/kept.worktrees/kpt-008-inbox-data`, branch `feat/kpt-008-inbox-data`.
- Expand seeded demo inbox data and new sender fixtures.
- Add deterministic grouping helpers with injected `now`.
- Add tests for section order, priority extraction, newest-first stable ordering, Today/Yesterday/Last Week boundaries, empty sections, redaction safety, deterministic output.
- Acceptance: `npm run test` passes and existing exports remain compatible.

#### KPT-008B — Soft Inbox UI shell
Owner: Harry. Worktree `/home/le/kept.worktrees/kpt-008-soft-inbox-ui`, branch `feat/kpt-008-soft-inbox-ui`.
- Replace landing/hero preview with approved no-sidebar Inbox UI.
- Implement top bar, carousel, sections, one-line rows, soft states, responsive behavior, safe rendering, and `⌘K` / `Ctrl+K` search focus.
- Acceptance: no sidebar, no landing hero, one line = one email, carousel visible, required sections visible, narrow layout usable, `npm run verify` passes.

#### KPT-008C — Design QA and polish
Owner: Denisa. Worktree `/home/le/kept.worktrees/kpt-008-soft-inbox-polish`, branch `design/kpt-008-soft-inbox-polish`.
- Compare implementation against approved SVG/spec.
- Produce desktop and narrow screenshots.
- Produce pass/fail report against Milan constraints and exact fixes.
- Acceptance: screenshots and QA report exist, deviations documented or patched.

#### KPT-008D — Integration, review, merge
Owner: Bob. Main repo `/home/le/kept` plus task worktrees.
- Review John first, then Harry, then Denisa.
- Run tests/verify at each gate.
- Merge to `main` when accepted. Done means merged to `main`.

## Decision audit trail
- CEO: Accepted selected direction, no-sidebar hard gate, and scoped out navigation/marketing/live sync expansion.
- Design: Accepted B visual softness + no sidebar; required concrete layout targets and screenshot QA.
- Engineering: Accepted sequential data-first implementation; required deterministic grouping, safe rendering, keyboard search affordance, and stronger tests.
