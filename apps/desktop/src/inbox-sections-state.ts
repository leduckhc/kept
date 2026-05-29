/**
 * Inbox sections collapse state — persisted in localStorage.
 * Both sections default to collapsed (true).
 */

export const INBOX_SECTIONS_KEY = 'kept_inbox_sections';

interface InboxSectionsState {
  newsletters: boolean;
  updates: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadInboxSectionsState(storage: StorageLike = globalThis.localStorage): InboxSectionsState {
  try {
    const raw = storage?.getItem(INBOX_SECTIONS_KEY);
    const parsed: Partial<InboxSectionsState> = raw ? JSON.parse(raw) : {};
    return {
      newsletters: parsed.newsletters !== false,
      updates: parsed.updates !== false,
    };
  } catch {
    return { newsletters: true, updates: true };
  }
}

export function saveInboxSectionsState(collapsed: InboxSectionsState, storage: StorageLike = globalThis.localStorage): void {
  try {
    storage?.setItem(INBOX_SECTIONS_KEY, JSON.stringify(collapsed));
  } catch {
    // storage may be unavailable; collapse state is best-effort
  }
}
