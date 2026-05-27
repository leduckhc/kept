# Gmail Connect Alpha design QA

Branch: `design/gmail-connect-qa`
Worktree: `/home/le/kept.worktrees/gmail-connect-design-qa`
Date: 2026-05-27

## Verdict

Scoped polish applied.

The locked no-sidebar direction is holding. The main issues were state redundancy and mobile hierarchy, not a layout rethink.

## What was checked

- Empty state
- OAuth in-progress state
- Syncing state
- Connected state
- Auth error state
- Sync error state
- Mobile connected-state sanity check

## Findings before polish

1. Empty/auth flows doubled the primary CTA.
   - The status strip and the hero card both showed `Connect Gmail`.
   - In OAuth-in-progress this was actively misleading because sign-in had already started.

2. Empty-state card copy did not adapt to status.
   - OAuth and syncing still looked like the generic fresh-install card.
   - Error state did not explain that nothing had synced locally yet.

3. Mobile top hierarchy was cramped.
   - `Inbox` and the count competed on one line.
   - New senders cards felt slightly tight at phone width.

## Changes made

- `apps/desktop/src/main.js`
  - Removed redundant status-strip `Connect Gmail` CTA when there are no synced Gmail rows yet.
  - Added state-specific empty-card copy for:
    - idle
    - oauth
    - syncing
    - auth-error
- `apps/desktop/src/styles.css`
  - Allowed the quiet status pill to wrap cleanly.
  - Stacked mobile inbox title/count for clearer hierarchy.
  - Slightly tuned mobile search/status sizing.
  - Widened mobile new-senders cards for cleaner breathing room.

## Evidence

Desktop screenshots:
- `/home/le/kept.worktrees/gmail-connect-design-qa/tmp/qa-shots/idle.png`
- `/home/le/kept.worktrees/gmail-connect-design-qa/tmp/qa-shots/oauth.png`
- `/home/le/kept.worktrees/gmail-connect-design-qa/tmp/qa-shots/syncing.png`
- `/home/le/kept.worktrees/gmail-connect-design-qa/tmp/qa-shots/connected.png`
- `/home/le/kept.worktrees/gmail-connect-design-qa/tmp/qa-shots/auth-error.png`
- `/home/le/kept.worktrees/gmail-connect-design-qa/tmp/qa-shots/sync-error.png`

Mobile screenshot:
- `/home/le/kept.worktrees/gmail-connect-design-qa/tmp/qa-shots/connected-mobile.png`

QA harness used for deterministic state capture:
- `/home/le/kept.worktrees/gmail-connect-design-qa/tmp/qa-state.html`

## Verification

- `npm run verify` passed
- 34/34 tests passed
- Browser screenshots captured against local preview on `http://127.0.0.1:5176`

## Remaining note

I did not broaden layout scope. If Milan wants more emotional motion in OAuth/syncing later, the next step would be a very small active-state animation treatment, not a structural redesign.
