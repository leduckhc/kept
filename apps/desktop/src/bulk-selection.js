/**
 * bulk-selection.js
 * Pure selection-state helpers for the Kept inbox.
 * No DOM dependencies — safe to import in Node tests.
 */

/**
 * Toggle a single thread in the selection Set.
 * Returns a new Set (does not mutate the input).
 *
 * @param {Set<string>} selected - current selection
 * @param {string} threadId
 * @returns {Set<string>}
 */
export function toggleThreadSelection(selected, threadId) {
  const next = new Set(selected);
  if (next.has(threadId)) {
    next.delete(threadId);
  } else {
    next.add(threadId);
  }
  return next;
}

/**
 * Select all threads in a section, or deselect all if every one is already selected.
 * Returns a new Set.
 *
 * @param {Set<string>} selected - current selection
 * @param {string[]} sectionThreadIds - all thread ids in the section
 * @returns {Set<string>}
 */
export function selectSection(selected, sectionThreadIds) {
  const allSelected = sectionThreadIds.length > 0 && sectionThreadIds.every((id) => selected.has(id));
  const next = new Set(selected);
  if (allSelected) {
    sectionThreadIds.forEach((id) => next.delete(id));
  } else {
    sectionThreadIds.forEach((id) => next.add(id));
  }
  return next;
}

/**
 * Clear all selected thread ids.
 * Returns an empty Set.
 *
 * @returns {Set<string>}
 */
export function clearSelection() {
  return new Set();
}

/**
 * Determine the dominant read state for a bulk Mark read/unread button label.
 * Returns 'unread' when the majority of selected threads are unread (so the
 * button should say "Mark read"), otherwise returns 'read'.
 *
 * @param {{ id: string, isUnread?: boolean, flags?: { read?: boolean } }[]} threads - all visible threads
 * @param {Set<string>} selectedIds
 * @returns {'read' | 'unread'}
 */
export function getBulkDominantReadState(threads, selectedIds) {
  if (!selectedIds || selectedIds.size === 0) return 'unread';
  const selected = threads.filter((t) => selectedIds.has(t.id));
  const unreadCount = selected.filter((t) => {
    const read = t.flags?.read ?? !t.isUnread;
    return !read;
  }).length;
  return unreadCount > selected.length / 2 ? 'unread' : 'read';
}

/**
 * Determine the checkbox state for a section header checkbox.
 *
 * @param {string[]} sectionThreadIds - thread ids in this section
 * @param {Set<string>} selectedIds
 * @returns {'all' | 'none' | 'indeterminate'}
 */
export function getSectionCheckboxState(sectionThreadIds, selectedIds) {
  if (!sectionThreadIds || sectionThreadIds.length === 0) return 'none';
  const selectedCount = sectionThreadIds.filter((id) => selectedIds.has(id)).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === sectionThreadIds.length) return 'all';
  return 'indeterminate';
}
