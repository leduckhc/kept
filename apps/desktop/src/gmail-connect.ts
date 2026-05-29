// @ts-nocheck
export const GMAIL_ACCOUNT_ID = 'acct_local_gmail';
export const GMAIL_SYNC_STORAGE_KEY = 'kept.gmail.sync.v1';
export const GMAIL_OAUTH_VERIFICATION_BLOCKED_MESSAGE = 'Google blocked this alpha OAuth app. Ask the Kept operator to add your Google account as a test user, or import a Gmail Takeout mbox while verification is pending.';
export const GMAIL_OAUTH_TIMEOUT_MESSAGE = 'Gmail sign-in did not return to Kept. If Google showed “Access blocked,” ask to be added as a Kept test user; otherwise try Connect Gmail again.';
export const inboxSearchStates = Object.freeze(['disabled', 'indexing', 'ready', 'stale', 'no-results', 'error']);

export function getSyncedGmailThreads(syncState, { accountId = GMAIL_ACCOUNT_ID } = {}) {
  const accounts = syncState?.accounts && typeof syncState.accounts === 'object' ? syncState.accounts : {};
  const account = accounts[accountId] || Object.values(accounts).find((entry) => entry?.provider === 'gmail');
  if (!account || !Array.isArray(account.threads)) return [];
  return account.threads
    .map((thread) => ({ ...thread, source: 'gmail' }))
    .sort(compareNewestFirst);
}

export function getGmailSyncStatus(syncState, { accountId = GMAIL_ACCOUNT_ID } = {}) {
  const accounts = syncState?.accounts && typeof syncState.accounts === 'object' ? syncState.accounts : {};
  const account = accounts[accountId] || Object.values(accounts).find((entry) => entry?.provider === 'gmail');
  if (!account) return 'never-connected';
  if (account.status) return account.status;
  return Array.isArray(account.threads) && account.threads.length > 0 ? 'connected' : 'connected-empty';
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
  const terms = normalizeInboxSearchTerms(query);
  if (terms.length === 0) return threads;
  return threads.filter((thread) => {
    const haystack = [
      thread.sender,
      thread.senderEmail,
      thread.subject,
      thread.snippet,
      thread.body,
      thread.textBody,
      ...(Array.isArray(thread.searchTokens) ? thread.searchTokens : []),
      ...(Array.isArray(thread.recipients) ? thread.recipients : []),
    ].filter(Boolean).join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function repositoryMessagesToInboxThreads(messages = []) {
  return messages.map((message) => {
    const flags = { read: false, starred: false, archived: false, ...(message.flags || {}) };
    return {
      id: message.threadId || message.id,
      localMessageId: message.id,
      providerMessageId: message.providerMessageId || message.id,
      providerThreadId: message.providerThreadId || message.threadId || null,
      accountId: message.accountId || GMAIL_ACCOUNT_ID,
      sender: message.sender?.name || message.sender?.email || 'unknown sender',
      senderEmail: message.sender?.email || '',
      subject: message.subject || '(no subject)',
      snippet: message.snippet || '',
      recipients: (message.recipients || []).map((recipient) => recipient.email || recipient.name).filter(Boolean),
      receivedAt: message.receivedAt,
      flags,
      isPriority: Boolean(flags.starred),
      isUnread: !flags.read,
      isStarred: Boolean(flags.starred),
      isArchived: Boolean(flags.archived),
      isNewSender: false,
      source: 'gmail',
    };
  });
}

export function getInboxSearchState({ enabled = true, indexing = false, stale = false, errorMessage = '', query = '', totalCount = 0, visibleCount = 0 } = {}) {
  if (errorMessage) return { status: 'error', label: 'Search error', detail: errorMessage };
  if (indexing) return { status: 'indexing', label: 'Indexing', detail: 'Kept is refreshing local search.' };
  if (stale) return { status: 'stale', label: 'Search updating', detail: 'Saved mail is available; new rows are catching up.' };
  if (!enabled || totalCount === 0) return { status: 'disabled', label: 'Search disabled', detail: 'Connect Gmail or import mbox to search local mail.' };
  if (String(query || '').trim() && visibleCount === 0) return { status: 'no-results', label: 'No results', detail: 'No synced or imported local mail matches.' };
  return { status: 'ready', label: 'Search ready', detail: 'Offline local search is ready.' };
}

export function userFacingGmailOAuthError(error, fallback = 'Could not finish Gmail sign-in.') {
  const message = String(error?.message || error || '').trim();
  if (!message) return fallback;
  if (isGoogleVerificationBlocked(message)) return GMAIL_OAUTH_VERIFICATION_BLOCKED_MESSAGE;
  if (/timed?\s*out|timeout|before the browser returned/i.test(message)) return GMAIL_OAUTH_TIMEOUT_MESSAGE;
  if (/oauth is not configured|desktop bridge is not available|sync bridge is not available/i.test(message)) {
    return 'Gmail Connect is not enabled in this desktop build. Import a Gmail Takeout mbox for local mail until the packaged build is configured.';
  }
  if (/gmail sign-in reached kept/i.test(message)) return message;
  if (/token|secret|authorization\s*code|code_verifier|access_token|refresh_token/i.test(message)) return fallback;
  return message;
}

export function createLocalStorageAdapter(storage) {
  return {
    async getItem(key) { return storage.getItem(key); },
    async setItem(key, value) { storage.setItem(key, value); },
    async removeItem(key) { storage.removeItem(key); },
  };
}

function normalizeInboxSearchTerms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}@._-]+|[^\p{L}\p{N}@._-]+$/gu, ''))
    .filter(Boolean);
}

function isGoogleVerificationBlocked(message) {
  return /access blocked/i.test(message)
    || /not completed (the )?google verification process/i.test(message)
    || /app has not completed verification/i.test(message)
    || /unverified app/i.test(message);
}

function compareNewestFirst(left, right) {
  return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime();
}
