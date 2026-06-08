# Plan: View-Aware Thread Actions

**Goal:** Reader bar renders different action buttons depending on the current view.

**Branch:** `feat/view-aware-actions`  
**Worktree:** `/home/le/kept` (main)

---

## Phase 1 — Backend Actions (new handlers in `gmail.ts` + `actions.ts`)

These actions don't exist yet and need implementation:

| # | Action | Implementation |
|---|--------|---------------|
| 1 | `unsnooze` | Clear snooze timestamp, move label back to INBOX |
| 2 | `resnooze` | Update snooze timestamp (reuse snooze picker UI) |
| 3 | `restoreToInbox` | Remove TRASH label, add INBOX label; update DB `is_archived=0, label='INBOX'` |
| 4 | `deletePermanently` | Gmail `DELETE /users/me/messages/{id}` (irreversible); remove from local DB |
| 5 | `cancelSend` | Gmail scheduled message cancellation (if API supports), otherwise move to Drafts |
| 6 | `reschedule` | Cancel + re-schedule with new time (compose flow) |
| 7 | `cancelReminder` | Clear local reminder record |
| 8 | `moveToInbox` | Add INBOX label, clear set-aside/archive flags in DB |
| 9 | `remindIfNoReply` | Set local reminder with thread + timestamp |

**Existing actions (already working):** archive, trash, toggleStar, markRead, markUnread, snooze, setAside, mute

---

## Phase 2 — View-Aware `ReaderActions` Component

Refactor `UnifiedBar.tsx` `ReaderActions`:

1. Create a `getActionsForView(view: ViewName)` function that returns an ordered array of action descriptors: `{ id, title, icon, handler, key? }`
2. `ReaderActions` calls this reactively based on `appState.currentView`
3. Render buttons dynamically from the array — no more hardcoded JSX per action

```ts
type ActionDescriptor = {
  id: string;
  title: string | (() => string); // reactive for toggle labels like Star/Unstar
  icon: string | (() => string);
  handler: () => void;
  key?: string; // keyboard shortcut hint
};
```

---

## Phase 3 — Keyboard Shortcuts Per View

Update `keyboard.ts`:
- Current handlers already work for inbox (e=archive, s=star, etc.)
- Add view-aware routing: when `appState.currentView === 'Trash'`, `e` should NOT archive — it does nothing (or maps to Restore)
- Use the same `getActionsForView` map to determine valid keys per view

---

## Phase 4 — E2E Tests

Add tests to verify:
- Trash view: only shows Restore + Delete permanently buttons
- Archive view: shows Move to Inbox, Trash, Star, Snooze (no Archive button)
- Inbox: shows full action set
- Starred: shows Unstar (not Star)

---

## Execution Order

| Step | Task | Depends on | Est. |
|------|------|------------|------|
| 1 | Write E2E tests for view-aware actions (TDD) | — | 30m |
| 2 | Implement `getActionsForView()` + refactor ReaderActions | — | 45m |
| 3 | Implement missing backend actions (restore, delete permanently, moveToInbox) | — | 1h |
| 4 | Wire keyboard shortcuts to be view-aware | Step 2 | 30m |
| 5 | Run E2E, fix failures | Steps 1-4 | 30m |
| 6 | Commit to main | Step 5 | 5m |

**Total estimate:** ~3 hours

---

## Risks & Notes

- `deletePermanently` is irreversible — needs confirmation dialog or undo toast with delay
- `cancelSend` depends on Gmail API support for scheduled messages — may need research
- `reschedule` opens a time picker — reuse snooze picker component
- Snooze/Reminder backends may be stub-only today (local timestamps, no Gmail push) — that's fine for V1, just wire the UI
- Phase 1 actions 5-6 (cancel send, reschedule) can be deferred if Scheduled view isn't populated yet
