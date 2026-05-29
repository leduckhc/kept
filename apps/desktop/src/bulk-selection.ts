/**
 * bulk-selection.ts
 * Pure selection-state helpers for the Kept inbox.
 * No DOM dependencies — safe to import in Node tests.
 */

/**
 * Toggle a single thread in the selection Set.
 * Returns a new Set (does not mutate the input).
 */
export function toggleThreadSelection(selected: Set<string>, threadId: string): Set<string> {
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
 */
export function selectSection(selected: Set<string>, sectionThreadIds: string[]): Set<string> {
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
 */
export function clearSelection(): Set<string> {
  return new Set();
}

interface ThreadWithFlags {
  id: string;
  isUnread?: boolean;
  flags?: { read?: boolean };
}

/**
 * Determine the dominant read state for a bulk Mark read/unread button label.
 * Returns 'unread' when the majority of selected threads are unread (so the
 * button should say "Mark read"), otherwise returns 'read'.
 */
export function getBulkDominantReadState(threads: ThreadWithFlags[], selectedIds: Set<string>): 'read' | 'unread' {
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
 */
export function getSectionCheckboxState(sectionThreadIds: string[], selectedIds: Set<string>): 'all' | 'none' | 'indeterminate' {
  if (!sectionThreadIds || sectionThreadIds.length === 0) return 'none';
  const selectedCount = sectionThreadIds.filter((id) => selectedIds.has(id)).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === sectionThreadIds.length) return 'all';
  return 'indeterminate';
}
