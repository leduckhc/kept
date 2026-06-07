# Project Learnings

## 2026-06-07: View-switch thread render bug (patchThreadList stale DOM)

**Symptom**: After switching from Sent → Inbox, threads disappear. Only a section header ("2025") renders with zero thread-rows. `state.threads` has correct data (20 items).

**Root cause**: `reloadInboxThreads()` called `renderInbox()` while `#inbox` container still had stale DOM from the Sent view (2 sent thread-rows). The incremental `patchThreadList` optimizer checked `container.children.length > 0` (true — Sent content), found `.thread-row[data-id]` elements with Sent IDs (t21, t22), computed a diff against Inbox IDs (t01-t20), determined too many changes (22 > threshold 10), returned `false`. The full rebuild path then ran but produced empty sections because the `groupBySection` cache had been invalidated by the Sent view's earlier call, and the recomputation raced with stale intermediate state.

**Fix**: Clear `container.innerHTML = ''` at the start of `reloadInboxThreads()` before the async `loadThreads` call. This forces `patchThreadList` to bail early (`existingRows.size === 0`) and guarantees a clean full render on every view switch.

**Lessons**:
1. **Incremental DOM patching is fragile across view boundaries** — `patchThreadList` assumes the container holds content from the SAME view. When switching views, stale DOM from a different view confuses the diff algorithm. Always reset container state on view transitions.
2. **Shared containers across views are a liability** — Both Inbox and label views (Sent, Starred, etc.) render into `#inbox`. This means any cross-view optimization (like patchThreadList) must account for completely different content, not just incremental changes.
3. **Cached pure functions can be invalidated by interleaving** — `groupBySection` caches based on input hash. When two different views call it in sequence (Sent with 2 threads, then Inbox with 20), the cache is invalidated and recomputed each time. The interleaving itself isn't the bug, but it removes the safety net of "same inputs = same outputs from cache".
4. **Unit tests don't catch DOM lifecycle bugs** — All 358 unit tests passed because they test individual functions in isolation. The bug only manifested when `renderInbox()` was called after a real view-switch sequence left stale DOM. E2E tests are the only reliable way to catch these interaction bugs.
5. **`renderInbox()` being called from multiple sites amplifies risk** — It's called from: `reloadInboxThreads`, `switchView`, `renderInbox` (main.ts wrapper), `updateUnifiedBar`, search debounce, filter handlers. Each call site may have different container state expectations.
