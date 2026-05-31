import type { Account } from './auth';
import type { Thread } from './gmail';
import { setActiveAccountId } from './accountContext';

export type InboxTab = 'all' | 'important' | 'other';
export type ViewName = 'Inbox' | 'Snoozed' | 'Sent' | 'Drafts' | 'Starred' | 'Scheduled';

export const state = {
  account: null as Account | null,
  accounts: [] as Account[],
  unifiedMode: false,
  threads: [] as Thread[],
  searchQuery: '',
  syncing: false,
  knownSenders: new Set<string>(),
  focusMode: localStorage.getItem('focusMode') === 'true',
  activeInboxTab: ((localStorage.getItem('kept_inbox_tab') as InboxTab) || 'all') as InboxTab,
  currentView: 'Inbox' as ViewName,
  selectedThreadId: null as string | null,
  kbRegistered: false,
  currentInlineReply: null as HTMLElement | null,
  bulkMode: false,
  selectedIds: new Set<string>(),
  gPending: false,
  gTimeout: null as ReturnType<typeof setTimeout> | null,
};

export function setAccount(a: Account) {
  state.account = a;
  setActiveAccountId(a.id);
}
