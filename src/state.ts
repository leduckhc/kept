/**
 * state.ts — Legacy compatibility shim.
 * Types are re-exported for modules that still reference them.
 * The mutable `state` object is preserved as a thin proxy for pure-logic
 * modules (snooze.ts, helpers.ts) that haven't been refactored yet.
 * UI state lives in solid/store.ts.
 */
import type { Account } from './auth';
import type { Thread } from './store';
import { setActiveAccountId } from './accountContext';

export type LayoutMode = '3-pane' | '2-pane';
export type ViewName = 'Inbox' | 'Snoozed' | 'Sent' | 'Drafts' | 'Starred' | 'Scheduled' | 'Reminders' | 'Trash' | 'Archive' | 'SetAside' | 'Triage';

/**
 * Legacy mutable state object — kept for pure-logic modules that
 * still reference it (snooze.ts, helpers.ts). The Solid store is
 * the canonical source of truth; this is read by legacy helpers only.
 */
export const state = {
  account: null as Account | null,
  accounts: [] as Account[],
  unifiedMode: true,
  accountFilter: null as string | null,
  threads: [] as Thread[],
  searchQuery: '',
  syncing: false,
  knownSenders: new Set<string>(),
  currentView: 'Inbox' as ViewName,
  selectedThreadId: null as string | null,
  kbRegistered: false,
  currentInlineReply: null as HTMLElement | null,
  bulkMode: false,
  selectedIds: new Set<string>(),
  lastBulkSelectedId: null as string | null,
  gPending: false,
  gTimeout: null as ReturnType<typeof setTimeout> | null,
  layoutMode: '2-pane' as LayoutMode,
  categoryFilter: null as string | null,
  senderFilter: null as string | null,
  domainFilter: null as string | null,
  groupedSenders: [] as string[],
  groupedDomains: [] as string[],
  vipSenders: [] as string[],
  lastUsedAccountId: null as string | null,
};

export function setAccount(a: Account) {
  state.account = a;
  setActiveAccountId(a.id);
}
