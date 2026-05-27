export const GMAIL_ACCOUNT_ID = 'acct_local_gmail';
export const GMAIL_SYNC_STORAGE_KEY = 'kept.gmail.sync.v1';

export function getSyncedGmailThreads(syncState, { accountId = GMAIL_ACCOUNT_ID } = {}) {
  const accounts = syncState?.accounts && typeof syncState.accounts === 'object' ? syncState.accounts : {};
  const account = accounts[accountId] || Object.values(accounts).find((entry) => entry?.provider === 'gmail');
  if (!account || !Array.isArray(account.threads)) return [];
  return account.threads
    .map((thread) => ({ ...thread, source: 'gmail' }))
    .sort(compareNewestFirst);
}

export function combineInboxThreads(gmailThreads, localThreads) {
  const seen = new Set();
  return [...gmailThreads, ...localThreads].filter((thread) => {
    const key = thread.providerMessageId || thread.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterInboxThreads(threads, query) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return threads;
  return threads.filter((thread) => {
    const haystack = [
      thread.sender,
      thread.senderEmail,
      thread.subject,
      thread.snippet,
      ...(Array.isArray(thread.recipients) ? thread.recipients : []),
    ].filter(Boolean).join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function createLocalStorageAdapter(storage) {
  return {
    async getItem(key) { return storage.getItem(key); },
    async setItem(key, value) { storage.setItem(key, value); },
    async removeItem(key) { storage.removeItem(key); },
  };
}

function compareNewestFirst(left, right) {
  return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime();
}
