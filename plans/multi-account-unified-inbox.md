# Multi-Account Unified Inbox & Threads

## Problem
Users with 10 accounts constantly switch between them and fear missing important emails. There's no single view that shows everything.

## Solution
Unified inbox: one chronological stream from all accounts. Color-coded rings on sender avatars indicate which of the user's accounts received each thread. Dropdown filter on the view label for quick per-account scoping.

---

## Existing Foundation

The codebase already has:
- `state.unifiedMode` flag and `loadUnifiedThreads()` in `sync.ts`
- Parallel sync for all accounts in `refreshAll()`
- `account_id` on every thread/message row

**What's wrong with it:** `loadUnifiedThreads()` fires N queries (one per account) then JS-merges + sorts. Won't scale to 5,000 threads. Needs a single SQL query.

---

## Phase 1 — Unified View (read-only value)

### 1.1 Thread list: unified query
- **Current**: `loadUnifiedThreads()` does N per-account `loadThreads()` calls → JS merge
- **New**: Single SQL query with NO `account_id` filter:
  ```sql
  SELECT * FROM threads
  WHERE label = ? AND is_archived = 0 AND is_blocked = 0
    AND (is_muted IS NULL OR is_muted = 0)
    AND (is_set_aside IS NULL OR is_set_aside = 0)
    AND (snoozed_until IS NULL OR snoozed_until <= ?)
  ORDER BY received_at DESC LIMIT 500
  ```
- When dropdown filter active: re-add `WHERE account_id = ?`
- Add index: `CREATE INDEX idx_threads_unified ON threads(label, is_archived, received_at DESC)`

### 1.2 State model changes
- Keep `state.account` as "primary" account (first added, used for settings/default compose)
- Add `state.accountFilter: string | null` — null = unified, string = filtered to that account_id
- `unifiedMode` derived: `state.accountFilter === null`
- Compose reply-from reads `thread.account_id`, NOT `state.account.id`

### 1.3 Account color palette
- Pre-defined array of 12 high-contrast hues for dark backgrounds:
  ```
  #7c3aed, #ef4444, #f59e0b, #10b981, #3b82f6,
  #ec4899, #06b6d4, #84cc16, #f97316, #8b5cf6,
  #14b8a6, #e11d48
  ```
- Auto-assigned sequentially on account add
- **Schema migration:** `ALTER TABLE accounts ADD COLUMN color_index INTEGER`
- Deterministic: assigned at account creation time, stored in DB

### 1.4 Color ring on sender avatar
- 2px solid ring around the existing sender avatar circle
- Ring color = account color (the user's receiving account, NOT the sender)
- CSS: `box-shadow: 0 0 0 2px {accountColor}` on `.thread-avatar`
- Thread row already has `account_id` — look up color at render time

### 1.5 Dropdown account filter
- Toolbar view label becomes tappable: "Inbox ▾"
- Dropdown shows:
  - "All Accounts" (default, no filter)
  - Each account with color dot + email address
- Selecting an account:
  - Sets `state.accountFilter = account.id`
  - Filters thread list to that account
  - Label updates to "Inbox · work@gmail.com ▾"
  - Session-only (not persisted across restarts — always starts unified)
- Applies to all views: Inbox, Sent, Starred, Archive, Trash

### 1.6 VIP / grouped senders in unified mode
- In unified mode: load VIP senders for ALL accounts (union)
- `state.vipSenders` becomes union of all accounts' VIPs
- `state.groupedSenders` / `state.groupedDomains` — union of all accounts
- In filtered mode: scoped to filtered account only

### 1.7 FTS search in unified mode
- Drop `account_id` filter on search results when `state.accountFilter === null`
- Search returns cross-account results in unified mode
- In filtered mode: search scoped to filtered account

### 1.8 Sidebar avatar (bottom)
- Currently shows single account avatar
- Update: show color ring matching the active account (or no ring in unified mode)
- Tap still opens account switcher/settings

### Acceptance Criteria — Phase 1
- [ ] App opens to unified view showing threads from all accounts sorted by date
- [ ] Single SQL query (not N per-account queries)
- [ ] Each thread row has correct color ring identifying receiving account
- [ ] Dropdown filter works on all views (Inbox, Sent, Starred, Archive, Trash)
- [ ] Selecting account filters instantly, label updates
- [ ] "All Accounts" returns to unified
- [ ] Color assignment is deterministic and persists across restarts
- [ ] VIP/grouped senders work correctly in both unified and filtered modes
- [ ] Search returns cross-account results in unified mode
- [ ] No performance regression with 5,000 threads in unified view

---

## Phase 2 — Reply-From Correctness (trust gate)

### 2.1 Auto-select From account
- When opening a thread, determine receiving account from `thread.account_id`
- Set compose `from` field to that account automatically
- Never fall back to a default silently — if `account_id` is somehow null, show the picker

### 2.2 Visible From badge in compose
- Always-visible From indicator in compose header (above subject/recipients)
- Shows: color dot + email address
- Tappable: opens account picker dropdown to switch
- Prominent — not a small muted label. This is trust UI.

### 2.3 Compose new
- From = last-used account (stored in session state)
- From badge still visible and tappable
- If only 1 account exists, no picker needed

### 2.4 Test suite (GATE: must pass 100% before Phase 3)

**Required test cases:**
1. Reply to thread → From = receiving account
2. Reply-all to thread → From = receiving account
3. Forward from thread → From = receiving account
4. Compose new → From = last-used account
5. Compose new, switch account via picker → From updates
6. Quick-reply from thread list → From = receiving account
7. Thread in unified view → correct From auto-selected
8. Thread in filtered view → correct From auto-selected
9. Draft saved → resumes with original From account
10. Account removed → threads gone, no stale From references
11. Reply from filtered view matches filter account
12. From badge is always present in compose DOM (never hidden)
13. From badge text matches the actual send account

### Acceptance Criteria — Phase 2
- [ ] All 13 test cases pass
- [ ] From badge always visible in compose (visual + DOM test)
- [ ] Cannot send email without From being explicitly set
- [ ] Switching From in compose updates the badge immediately
- [ ] No path exists where reply sends from wrong account

---

## Phase 3 — Polish & Scale

### 3.1 Staggered sync
- With 10 accounts on 60s interval, stagger by `60s / account_count`
- Account 1 syncs at t=0, account 2 at t=6s, account 3 at t=12s...
- Prevents network/CPU spike on sync tick
- On first launch: parallel initial sync (speed matters more than smoothness)

### 3.2 Account color in settings
- Settings > Accounts shows each account with its auto-assigned color dot
- No manual color picker (auto-assigned is sufficient)
- Color visible for reference only

### 3.3 Stress testing
- Test with 10 accounts × 500 threads = 5,000 rows
- Thread list virtualization must handle without jank
- Measure: initial render < 100ms, scroll at 60fps

### Acceptance Criteria — Phase 3
- [ ] Staggered sync verified with 10 accounts (no concurrent API burst)
- [ ] Thread list renders 5,000 rows without frame drops
- [ ] Initial inbox load < 100ms with 5,000 threads

---

## Known Limitations

- **Thread ID collision:** Gmail thread IDs are the PK. Two accounts in the same conversation get the same thread ID — second sync "wins." Correct fix is composite PK `(id, account_id)` but that's a heavy migration. Documented, deferred.
- **Cross-account thread merging** — out of scope
- **Unified label/folder system** — out of scope
- **Cross-account search** — handled (unified FTS in Phase 1.7)
- **Account color customization** — auto-assigned only

---

## Files Touched
- `src/sync.ts` — replace `loadUnifiedThreads()` with single-query version, staggered sync (Phase 3)
- `src/gmail.ts` — unified query variant in `loadThreads`, VIP/grouped union
- `src/state.ts` — add `accountFilter: string | null`
- `src/db.ts` — `color_index` migration, unified index
- `src/main.ts` — dropdown filter UI, toolbar label
- `src/threadList.ts` — color ring rendering
- `src/compose.ts` — From badge, auto-select from `thread.account_id`
- `src/styles.css` — ring styles, dropdown styles, From badge styles
- `tests/replyFrom.test.ts` — new test file for Phase 2 gate
