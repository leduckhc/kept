# Kept Real Mail Alpha — recommended copy/state pattern

Owner: Denisa
Worktree: /home/le/kept.worktrees/kpt-real-mail-state-matrix-design
Branch: design/kpt-real-mail-state-matrix
Artifact: `docs/designs/real-mail-alpha-state-matrix/comparison-board.html`

## Mockup options

- Variant A — Calm status band
  - One persistent state band under the top bar owns Gmail/search/AI transitions.
  - Clearest implementation contract; easiest for Harry to map to explicit state IDs.
  - Risk: can feel heavier if too many services speak at once.

- Variant B — Inline state chips
  - Calmest default shell; state only appears near the interaction that needs attention.
  - Feels closest to the approved soft-inbox reference.
  - Risk: needs strong discipline so chips do not fragment across surfaces.

- Variant C — Focus drawer
  - Best for reader and AI flows that need detail without disturbing the list.
  - Strongest separation between calm inbox and richer state handling.
  - Risk: the drawer can become a hidden second layout if global states leak into it.

## Recommended pattern across all variants

Do not choose the winning mockup shell yet. Recommend one shared state/copy contract across all three:

1. Outcome line first
   - Example: `Gmail sync paused.`
2. Trust line second
   - Example: `Your cached rows stay searchable on this device.`
3. One dominant next step
   - Example: `Reconnect Gmail`
4. Secondary disclosure for detail
   - timestamps, provider debug, indexed counts, audit internals

## Why this pattern

- Preserves the approved soft-inbox calmness instead of turning state handling into dashboard chrome.
- Matches real product constraints already in Kept docs: local-only search, readonly Gmail sync, cached-mail preservation, and explicit AI approval.
- Gives Harry one reusable copy structure and gives John one consistent QA lens for trust claims.

## Harry handoff

- Keep the existing no-sidebar inbox shell and one-row scan layout.
- Implement one chosen state host strategy only; do not mix A/B/C patterns casually.
- Map the state IDs in the board directly to UI conditions.
- Never use sample/demo rows to fake connected states.
- Keep technical detail hidden behind secondary disclosure.

## John handoff

- Verify every state against the matrix in the board.
- Confirm Gmail/auth failures preserve cached local rows when promised.
- Confirm search copy never implies remote/server search.
- Confirm AI approval always names provider, sent scope, and local audit behavior.
- Confirm reader states distinguish missing body, HTML-only body, long body expansion, and attachment metadata.
