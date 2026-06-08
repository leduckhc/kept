# Thread Actions Per View

Defines which actions are available in the reader bar (and long-press/swipe on mobile) for each view. Actions that placed the thread into its current view are never offered.

## Design Principles

1. **No redundant action** — never offer the action that PUT the thread in its current view
2. **Move to Inbox** — universal escape hatch for parked/archived/snoozed/trashed threads
3. **3–5 actions max** — decision fatigue kills speed; trim to what's actually useful in context
4. **Primary action first** — the most common action for that view goes leftmost in the bar

---

## Inbox

| Action | Key | Notes |
|--------|-----|-------|
| Archive | `e` | Primary triage action — gets it out of inbox |
| Trash | `#` | Hard remove |
| Star | `s` | Mark important |
| Snooze | `h` | Come back later |
| Set Aside | `v` | Park without time pressure |
| Mark read/unread | `u` | Toggle |
| Remind if no reply | — | "Ping me if they ghost" |

## Snoozed

| Action | Key | Notes |
|--------|-----|-------|
| Unsnooze (→ Inbox) | — | Bring it back now |
| Re-snooze | `h` | Change the snooze time |
| Archive | `e` | Done, don't need it |
| Trash | `#` | Discard |
| Star | `s` | Mark important |

## Set Aside

| Action | Key | Notes |
|--------|-----|-------|
| Move to Inbox | — | Ready to deal with it |
| Archive | `e` | Done with it |
| Trash | `#` | Discard |
| Star | `s` | Mark important |
| Snooze | `h` | Give it a deadline |

## Sent

| Action | Key | Notes |
|--------|-----|-------|
| Archive | `e` | Clear from list |
| Trash | `#` | Discard |
| Star | `s` | Mark important |
| Remind if no reply | — | Most useful here — follow-up tracking |

## Drafts

| Action | Key | Notes |
|--------|-----|-------|
| Trash (discard) | `#` | Delete the draft |

Primary action is **Open/Edit** (clicking the row opens compose). No other thread actions make sense.

## Starred

| Action | Key | Notes |
|--------|-----|-------|
| Unstar | `s` | Remove from starred |
| Archive | `e` | Clear from inbox |
| Trash | `#` | Discard |
| Snooze | `h` | Defer |
| Set Aside | `v` | Park it |
| Mark read/unread | `u` | Toggle |

## Scheduled

| Action | Key | Notes |
|--------|-----|-------|
| Cancel send | — | Abort the scheduled email |
| Reschedule | — | Change send time |

These are outgoing messages, not threads to triage.

## Reminders

| Action | Key | Notes |
|--------|-----|-------|
| Cancel reminder | — | Stop the follow-up |
| Archive | `e` | Done |
| Trash | `#` | Discard |
| Star | `s` | Mark important |

## Trash

| Action | Key | Notes |
|--------|-----|-------|
| Restore to Inbox | — | Rescue it |
| Delete permanently | — | Nuke it |

Nothing else — you're either rescuing or destroying.

## Archive

| Action | Key | Notes |
|--------|-----|-------|
| Move to Inbox | — | Unarchive |
| Trash | `#` | Discard |
| Star | `s` | Mark important |
| Snooze | `h` | Resurface later |

---

## Implementation Notes

- Reader bar (`ReaderActions` in `UnifiedBar.tsx`) must read `appState.currentView` and render the appropriate action set
- Each action maps to an existing handler in `actions.ts` or needs a new one (Unsnooze, Restore, Delete permanently, Cancel send, Reschedule, Cancel reminder)
- Keyboard shortcuts should work in reader mode per the key column above
- Actions without a key shortcut are button-only for now
