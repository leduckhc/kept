/**
 * Inbox sections collapse state — persisted in localStorage.
 * Both sections default to collapsed (true).
 */

export const INBOX_SECTIONS_KEY = 'kept_inbox_sections';

export function loadInboxSectionsState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(INBOX_SECTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      newsletters: parsed.newsletters !== false,
      updates: parsed.updates !== false,
    };
  } catch {
    return { newsletters: true, updates: true };
  }
}

export function saveInboxSectionsState(collapsed, storage = globalThis.localStorage) {
  try {
    storage?.setItem(INBOX_SECTIONS_KEY, JSON.stringify(collapsed));
  } catch {
    // storage may be unavailable; collapse state is best-effort
  }
}
