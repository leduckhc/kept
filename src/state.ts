import type { Account } from './auth';
import type { Thread } from './gmail';
import { setActiveAccountId } from './accountContext';

export type LayoutMode = '3-pane' | '2-pane';
export type ViewName = 'Inbox' | 'Snoozed' | 'Sent' | 'Drafts' | 'Starred' | 'Scheduled' | 'Trash' | 'Archive';

export const state = {
  account: null as Account | null,
  accounts: [] as Account[],
  unifiedMode: false,
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
  layoutMode: (localStorage.getItem('kept.layoutMode') || '3-pane') as LayoutMode,
  // Newsletters & Updates + Group by Sender
  categoryFilter: null as string | null,
  senderFilter: null as string | null,
  domainFilter: null as string | null,
  groupedSenders: [] as string[],
  groupedDomains: [] as string[],
};

export function setAccount(a: Account) {
  state.account = a;
  setActiveAccountId(a.id);
}
