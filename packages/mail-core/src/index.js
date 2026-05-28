import { buildSearchRows, normalizeSearchTerms } from '../../search-core/src/index.js';

export const sampleThreads = [
  {
    id: 'thr_invoice_001',
    accountId: 'acct_demo_gmail',
    subject: 'Invoice schedule for next week',
    sender: 'Mara from Northstar Foods',
    recipients: ['you@kept.local'],
    body: 'Can you confirm the catering invoice and contract timing before next week?',
    receivedAt: '2026-05-25T10:00:00Z',
  },
  {
    id: 'thr_trip_002',
    accountId: 'acct_demo_gmail',
    subject: 'Dinner list for Milan trip',
    sender: 'Pip Demo',
    recipients: ['you@kept.local'],
    body: 'Local-first search can find restaurants, invoices, contracts, and travel planning mail offline.',
    receivedAt: '2026-05-24T16:30:00Z',
  },
];

export const sampleInboxThreads = [
  {
    id: 'inbox_priority_contract',
    sender: 'Mara Vale',
    senderEmail: 'mara.vale@demo.kept.local',
    subject: 'Review venue agreement before Friday',
    snippet: 'Synthetic preview: the venue packet is ready for a quick review window.',
    receivedAt: '2026-05-26T10:45:00Z',
    isPriority: true,
    isUnread: true,
    isNewSender: false,
    avatarInitials: 'MV',
    avatarColor: '#f3d9c7',
  },
  {
    id: 'inbox_today_brief',
    sender: 'Pip Keeper',
    senderEmail: 'pip.keeper@demo.kept.local',
    subject: 'Today\'s tidy inbox brief',
    snippet: 'Synthetic preview: three items are ready and two can wait until later.',
    receivedAt: '2026-05-26T09:20:00Z',
    isPriority: false,
    isUnread: true,
    isNewSender: false,
    avatarInitials: 'PK',
    avatarColor: '#d9ebe3',
  },
  {
    id: 'inbox_today_design',
    sender: 'June Avery',
    senderEmail: 'june.avery@example.com',
    subject: 'Soft inbox copy pass',
    snippet: 'Synthetic preview: the concise labels feel warmer with fewer dashboard words.',
    receivedAt: '2026-05-26T08:10:00Z',
    isPriority: false,
    isUnread: false,
    isNewSender: false,
    avatarInitials: 'JA',
    avatarColor: '#ddd7f2',
  },
  {
    id: 'inbox_priority_weekly',
    sender: 'Noor Park',
    senderEmail: 'noor.park@example.com',
    subject: 'Need answer on weekly send time',
    snippet: 'Synthetic preview: please choose the calmest time for the weekly note.',
    receivedAt: '2026-05-24T16:15:00Z',
    isPriority: true,
    isUnread: false,
    isNewSender: false,
    avatarInitials: 'NP',
    avatarColor: '#f1e1a6',
  },
  {
    id: 'inbox_yesterday_receipt',
    sender: 'Lina Stone',
    senderEmail: 'lina.stone@demo.kept.local',
    subject: 'Receipt export is ready',
    snippet: 'Synthetic preview: the export is attached for your local archive.',
    receivedAt: '2026-05-25T18:35:00Z',
    isPriority: false,
    isUnread: true,
    isNewSender: false,
    avatarInitials: 'LS',
    avatarColor: '#cfe3f5',
  },
  {
    id: 'inbox_yesterday_invite',
    sender: 'Owen Reed',
    senderEmail: 'owen.reed@example.com',
    subject: 'Thursday walkthrough invite',
    snippet: 'Synthetic preview: a walkthrough invite is waiting with a short agenda.',
    receivedAt: '2026-05-25T08:00:00Z',
    isPriority: false,
    isUnread: false,
    isNewSender: true,
    avatarInitials: 'OR',
    avatarColor: '#ead6df',
    status: 'new',
  },
  {
    id: 'inbox_last_week_notes',
    sender: 'Theo Finch',
    senderEmail: 'theo.finch@demo.kept.local',
    subject: 'Notes from the quiet launch list',
    snippet: 'Synthetic preview: grouped notes are ready for the next product pass.',
    receivedAt: '2026-05-22T14:45:00Z',
    isPriority: false,
    isUnread: false,
    isNewSender: false,
    avatarInitials: 'TF',
    avatarColor: '#d8e7c9',
  },
  {
    id: 'inbox_last_week_sample',
    sender: 'Ari Bloom',
    senderEmail: 'ari.bloom@example.com',
    subject: 'Sample mail import check',
    snippet: 'Synthetic preview: sample imports keep local mail behavior easy to inspect.',
    receivedAt: '2026-05-20T11:25:00Z',
    isPriority: false,
    isUnread: false,
    isNewSender: true,
    avatarInitials: 'AB',
    avatarColor: '#f0d0c8',
    status: 'accepted',
  },
];

export const sampleNewSenders = sampleInboxThreads
  .filter((thread) => thread.isNewSender)
  .concat([
    {
      id: 'new_sender_collab',
      sender: 'Sage Monroe',
      senderEmail: 'sage.monroe@demo.kept.local',
      subject: 'First note about the shared checklist',
      snippet: 'Synthetic preview: Sage sent a first note about a small shared checklist.',
      receivedAt: '2026-05-26T07:40:00Z',
      isPriority: false,
      isUnread: true,
      isNewSender: true,
      avatarInitials: 'SM',
      avatarColor: '#d7ece8',
      status: 'new',
    },
    {
      id: 'new_sender_invoice',
      sender: 'Iris Chen',
      senderEmail: 'iris.chen@demo.kept.local',
      subject: 'First invoice question for the local archive',
      snippet: 'Synthetic preview: Iris asked whether this thread should be kept for later.',
      receivedAt: '2026-05-25T13:15:00Z',
      isPriority: false,
      isUnread: false,
      isNewSender: true,
      avatarInitials: 'IC',
      avatarColor: '#e8ddc8',
      status: 'new',
    },
  ]);

const inboxSectionDefinitions = [
  { id: 'priority', title: 'Priority' },
  { id: 'today', title: 'Today' },
  { id: 'yesterday', title: 'Yesterday' },
  { id: 'last-week', title: 'Last Week' },
];

export function groupInboxThreads(threads, { now = new Date() } = {}) {
  const sectioned = Object.fromEntries(inboxSectionDefinitions.map((section) => [section.title, []]));
  const nowStart = startOfUtcDay(now);
  const tomorrowStart = addUtcDays(nowStart, 1);
  const yesterdayStart = addUtcDays(nowStart, -1);
  const lastWeekStart = addUtcDays(nowStart, -7);

  threads.forEach((thread, index) => {
    const entry = { thread, index };
    if (thread.isPriority) {
      sectioned.Priority.push(entry);
      return;
    }

    const receivedAt = new Date(thread.receivedAt);
    if (receivedAt >= nowStart && receivedAt < tomorrowStart) {
      sectioned.Today.push(entry);
    } else if (receivedAt >= yesterdayStart && receivedAt < nowStart) {
      sectioned.Yesterday.push(entry);
    } else if (receivedAt >= lastWeekStart && receivedAt < yesterdayStart) {
      sectioned['Last Week'].push(entry);
    }
  });

  return Object.fromEntries(
    inboxSectionDefinitions.map((section) => [
      section.title,
      sectioned[section.title]
        .sort(compareInboxEntries)
        .map((entry) => entry.thread),
    ]),
  );
}

export function getInboxSections(threads, { now = new Date() } = {}) {
  const grouped = groupInboxThreads(threads, { now });
  return inboxSectionDefinitions.map((section) => ({
    ...section,
    threads: grouped[section.title],
  }));
}

export const gmailMinimalScopes = ['https://www.googleapis.com/auth/gmail.readonly'];
export const gmailModifyScopes = ['https://www.googleapis.com/auth/gmail.modify'];
export const gmailTriageActionTypes = Object.freeze(['archive', 'mark-read', 'mark-unread', 'star', 'unstar']);
export const gmailTriageActionStatuses = Object.freeze(['queued', 'syncing', 'synced', 'error', 'needs-reconnect']);
export const gmailOAuthTokenKeyPrefix = 'kept.gmail.oauth';

export function buildGmailScopes({ enableModify = false } = {}) {
  return enableModify ? [...gmailMinimalScopes, ...gmailModifyScopes] : [...gmailMinimalScopes];
}

export function gmailTriageActionToModifyPayload(action) {
  switch (action) {
    case 'archive': return { addLabelIds: [], removeLabelIds: ['INBOX'] };
    case 'mark-read': return { addLabelIds: [], removeLabelIds: ['UNREAD'] };
    case 'mark-unread': return { addLabelIds: ['UNREAD'], removeLabelIds: [] };
    case 'star': return { addLabelIds: ['STARRED'], removeLabelIds: [] };
    case 'unstar': return { addLabelIds: [], removeLabelIds: ['STARRED'] };
    default: throw new Error(`Unsupported Gmail triage action: ${action}`);
  }
}

export function flagsForTriageAction(action) {
  switch (action) {
    case 'archive': return { archived: true };
    case 'mark-read': return { read: true };
    case 'mark-unread': return { read: false };
    case 'star': return { starred: true };
    case 'unstar': return { starred: false };
    default: throw new Error(`Unsupported Gmail triage action: ${action}`);
  }
}

export async function createPkcePair({ cryptoImpl = globalThis.crypto } = {}) {
  const verifier = createPkceVerifier({ cryptoImpl });
  const challenge = await createPkceChallenge(verifier, { cryptoImpl });
  return { verifier, challenge, method: 'S256' };
}

export function createPkceVerifier({ cryptoImpl = globalThis.crypto, byteLength = 64 } = {}) {
  if (!cryptoImpl?.getRandomValues) throw new Error('Web Crypto getRandomValues is required for Gmail PKCE');
  const bytes = new Uint8Array(byteLength);
  cryptoImpl.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createPkceChallenge(verifier, { cryptoImpl = globalThis.crypto } = {}) {
  requireField('verifier', verifier);
  if (!cryptoImpl?.subtle?.digest) throw new Error('Web Crypto subtle.digest is required for Gmail PKCE');
  const bytes = new TextEncoder().encode(verifier);
  const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

export function parseGmailOAuthCallback(callbackUrl, { expectedState } = {}) {
  requireField('callbackUrl', callbackUrl);
  requireField('expectedState', expectedState);
  const parsed = new URL(callbackUrl, 'http://127.0.0.1');
  const state = parsed.searchParams.get('state') || '';
  if (state !== expectedState) throw new Error('Gmail OAuth state mismatch');
  const error = parsed.searchParams.get('error');
  if (error) return { ok: false, state, error, errorDescription: parsed.searchParams.get('error_description') || '' };
  const code = parsed.searchParams.get('code');
  if (!code) throw new Error('Gmail OAuth callback missing authorization code');
  return { ok: true, state, code };
}

export function createKeychainTokenStore({ keychain, service = gmailOAuthTokenKeyPrefix } = {}) {
  requireField('keychain', keychain);
  ['setPassword', 'getPassword', 'deletePassword'].forEach((method) => {
    if (typeof keychain[method] !== 'function') throw new Error(`keychain.${method} is required`);
  });

  return {
    async saveTokens(accountId, tokens) {
      requireField('accountId', accountId);
      validateTokenPayload(tokens);
      const normalized = normalizeTokenPayload(tokens);
      const existingRaw = await keychain.getPassword(service, accountId);
      if (existingRaw) {
        try {
          const existing = normalizeTokenPayload(JSON.parse(existingRaw));
          if (JSON.stringify(existing) === JSON.stringify(normalized)) {
            return { accountId, service, stored: 'keychain', skipped: true };
          }
        } catch (_error) {
          // Fall through and rewrite malformed legacy payloads safely.
        }
      }
      await keychain.setPassword(service, accountId, JSON.stringify(normalized));
      return { accountId, service, stored: 'keychain' };
    },
    async loadTokens(accountId) {
      requireField('accountId', accountId);
      const raw = await keychain.getPassword(service, accountId);
      return raw ? JSON.parse(raw) : null;
    },
    async clearTokens(accountId) {
      requireField('accountId', accountId);
      await keychain.deletePassword(service, accountId);
    },
  };
}

export function createMemoryKeychain() {
  const entries = new Map();
  return {
    entries,
    async setPassword(service, account, secret) { entries.set(`${service}:${account}`, secret); },
    async getPassword(service, account) { return entries.get(`${service}:${account}`) || null; },
    async deletePassword(service, account) { entries.delete(`${service}:${account}`); },
  };
}

export function createGmailApiConnector({
  tokenStore,
  fetchImpl = globalThis.fetch,
  accountId = 'acct_gmail_primary',
  tokenUrl = 'https://oauth2.googleapis.com/token',
  clientId = '',
  clientSecret = '',
  now = () => new Date(),
} = {}) {
  requireField('tokenStore', tokenStore);
  requireField('fetchImpl', fetchImpl);

  return {
    provider: 'gmail',
    async listRecentMessages({ maxResults = 25 } = {}) {
      const accessToken = await readAccessToken(tokenStore, accountId, { fetchImpl, tokenUrl, clientId, clientSecret, now });
      try {
        const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
        listUrl.searchParams.set('labelIds', 'INBOX');
        listUrl.searchParams.set('maxResults', String(maxResults));
        const listJson = await fetchGmailJson(fetchImpl, listUrl, accessToken);
        const messageRefs = Array.isArray(listJson.messages) ? listJson.messages : [];
        const messages = [];
        for (const ref of messageRefs) {
          const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}`);
          messageUrl.searchParams.set('format', 'full');
          messages.push(normalizeGmailApiMessage(await fetchGmailJson(fetchImpl, messageUrl, accessToken)));
        }
        return { historyId: listJson.historyId || messages.at(-1)?.historyId || null, messages };
      } catch (error) {
        if (error?.code === 'GMAIL_AUTH_REVOKED' && typeof tokenStore.clearTokens === 'function') {
          await tokenStore.clearTokens(accountId);
        }
        throw error;
      }
    },
    async modifyMessageLabels(messageId, payload) {
      return modifyGmailMessageLabels({ tokenStore, accountId, fetchImpl, tokenUrl, clientId, clientSecret, now, messageId, payload });
    },
    async applyTriageAction(messageId, action) {
      return modifyGmailMessageLabels({ tokenStore, accountId, fetchImpl, tokenUrl, clientId, clientSecret, now, messageId, payload: gmailTriageActionToModifyPayload(action) });
    },
    async archiveMessage(messageId) { return this.applyTriageAction(messageId, 'archive'); },
    async markMessageRead(messageId) { return this.applyTriageAction(messageId, 'mark-read'); },
    async markMessageUnread(messageId) { return this.applyTriageAction(messageId, 'mark-unread'); },
    async starMessage(messageId) { return this.applyTriageAction(messageId, 'star'); },
    async unstarMessage(messageId) { return this.applyTriageAction(messageId, 'unstar'); },
  };
}

export function normalizeGmailApiMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers || []).map((header) => [String(header.name || '').toLowerCase(), header.value || '']));
  const textBody = extractGmailTextBody(message.payload);
  const receivedAt = gmailInternalDateToIso(message.internalDate) || parseHeaderDate(headers.date);
  const labelIds = normalizeGmailLabelIds(message.labelIds);
  return {
    id: message.id,
    threadId: message.threadId || message.id,
    historyId: message.historyId || null,
    labelIds,
    flags: gmailFlagsFromLabelIds(labelIds),
    subject: headers.subject || message.subject || '(no subject)',
    from: headers.from || message.from || 'unknown sender',
    to: headers.to || message.to || '',
    snippet: summarizeBody(textBody) || message.snippet || '',
    textBody,
    receivedAt: receivedAt || message.receivedAt || new Date(0).toISOString(),
  };
}

export function createJsonMailStore({ storage, key = 'kept.gmail.sync.v1' } = {}) {
  requireField('storage', storage);
  ['getItem', 'setItem', 'removeItem'].forEach((method) => {
    if (typeof storage[method] !== 'function') throw new Error(`storage.${method} is required`);
  });

  return {
    async saveSyncResult(syncResult) {
      const existing = await this.loadSyncState();
      const nextAccounts = { ...existing.accounts };
      nextAccounts[syncResult.accountId] = {
        provider: syncResult.provider,
        cursor: syncResult.cursor,
        threads: syncResult.threads.map(stripPrivateBodyForPersistence),
        savedAt: new Date(0).toISOString(),
      };
      const payload = { version: 1, accounts: nextAccounts };
      await storage.setItem(key, JSON.stringify(payload));
      return payload;
    },
    async loadSyncState() {
      const raw = await storage.getItem(key);
      if (!raw) return { version: 1, accounts: {} };
      const parsed = JSON.parse(raw);
      return { version: 1, accounts: parsed.accounts || {} };
    },
    async clear() { await storage.removeItem(key); },
  };
}

export function createMemoryJsonStorage() {
  const entries = new Map();
  return {
    entries,
    async getItem(key) { return entries.get(key) || null; },
    async setItem(key, value) { entries.set(key, String(value)); },
    async removeItem(key) { entries.delete(key); },
  };
}

export async function syncGmailInbox({ connector, accountId, mailStore, repository, accountEmail, maxResults = 25 } = {}) {
  requireField('accountId', accountId);
  try {
    const result = await ingestGmailMessages({ connector, accountId, maxResults });
    const status = result.threads.length > 0 ? 'connected' : 'connected-empty';
    const nextResult = { ...result, status };
    if (repository) await saveGmailSyncToRepository({ repository, accountId, accountEmail, connector, result: nextResult });
    if (mailStore) await mailStore.saveSyncResult(nextResult);
    return repository ? { ...nextResult, threads: await repository.listThreads({ accountId }) } : nextResult;
  } catch (error) {
    if (repository) {
      await repository.saveSyncState(accountId, {
        provider: 'gmail',
        status: error?.code === 'GMAIL_AUTH_REVOKED' ? 'auth-revoked' : 'sync-error',
        error: redactForLogs(error?.message || error),
        syncedAt: new Date(0).toISOString(),
      });
    }
    throw error;
  }
}

export const gmailSyncCursorPlan = {
  primary: 'Store the Gmail historyId returned with each successful list/get batch and use users.history.list for the next incremental sync.',
  fallback: 'If Gmail expires the historyId, run a bounded full resync for recent mail, dedupe by immutable Gmail message id, then store the newest historyId.',
  localOnly: 'Persist cursors and message content in the encrypted local database; never send message bodies through a Kept app server.',
};

export function createGmailOAuthUrl({ clientId, redirectUri, state, codeChallenge, enableModify = false } = {}) {
  requireField('clientId', clientId);
  requireField('redirectUri', redirectUri);
  requireField('state', state);
  requireField('codeChallenge', codeChallenge);

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', buildGmailScopes({ enableModify }).join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url;
}

export function createFakeGmailConnector(messages = fakeGmailMessages) {
  return {
    provider: 'gmail',
    async listRecentMessages({ maxResults = 10 } = {}) {
      const selected = messages.slice(0, maxResults).map((message) => ({ ...message }));
      return {
        historyId: selected.at(-1)?.historyId || 'fake-history-empty',
        messages: selected,
      };
    },
  };
}

export async function ingestGmailMessages({ connector, accountId, maxResults = 10 }) {
  requireField('connector', connector);
  requireField('accountId', accountId);

  const page = await connector.listRecentMessages({ maxResults });
  const threads = page.messages.map((message) => gmailMessageToThread(message, accountId));
  return {
    accountId,
    provider: connector.provider || 'gmail',
    cursor: {
      provider: 'gmail',
      historyId: page.historyId,
      syncedAt: new Date(0).toISOString(),
    },
    threads,
    rows: threads.map((thread) => buildSearchRows(thread)),
  };
}

async function saveGmailSyncToRepository({ repository, accountId, accountEmail, connector, result }) {
  await repository.upsertAccount({
    id: accountId,
    provider: connector?.provider || result.provider || 'gmail',
    email: accountEmail || `${accountId}@local.kept`,
    updatedAt: result.cursor.syncedAt,
  });

  for (const thread of result.threads) {
    await repository.upsertMessage(gmailThreadToLocalMessage(thread));
  }

  await repository.saveSyncState(accountId, {
    provider: result.provider || 'gmail',
    status: result.status,
    historyId: result.cursor.historyId,
    syncedAt: result.cursor.syncedAt,
  });
}

function gmailThreadToLocalMessage(thread) {
  return {
    id: thread.providerMessageId || thread.id,
    accountId: thread.accountId,
    threadId: thread.id,
    providerMessageId: thread.providerMessageId || thread.id,
    sender: { name: thread.sender || 'unknown sender', email: thread.senderEmail || '' },
    recipients: thread.recipients || [],
    subject: thread.subject || '(no subject)',
    body: thread.body || thread.snippet || '',
    snippet: thread.snippet || summarizeBody(thread.body || ''),
    receivedAt: thread.receivedAt || new Date(0).toISOString(),
    flags: thread.flags || { read: !thread.isUnread, starred: Boolean(thread.isStarred), archived: Boolean(thread.isArchived) },
    metadata: { provider: 'gmail', historyId: thread.historyId || null, gmailLabelIds: normalizeGmailLabelIds(thread.labelIds) },
  };
}

export function gmailMessageToThread(message, accountId) {
  const parsedSender = parseMailbox(message.from || 'unknown sender');
  const body = message.textBody || message.snippet || '';
  return {
    id: message.threadId || message.id,
    accountId,
    subject: message.subject || '(no subject)',
    sender: parsedSender.name,
    senderEmail: parsedSender.email,
    recipients: message.to ? [message.to] : [],
    body,
    snippet: message.snippet || summarizeBody(body),
    receivedAt: message.receivedAt || new Date(0).toISOString(),
    providerMessageId: message.id,
    historyId: message.historyId,
    labelIds: normalizeGmailLabelIds(message.labelIds),
    flags: message.flags || gmailFlagsFromLabelIds(message.labelIds),
    isPriority: Boolean(message.flags?.starred || gmailFlagsFromLabelIds(message.labelIds).starred),
    isUnread: message.flags ? !message.flags.read : !gmailFlagsFromLabelIds(message.labelIds).read,
    isStarred: Boolean(message.flags?.starred || gmailFlagsFromLabelIds(message.labelIds).starred),
    isArchived: Boolean(message.flags?.archived ?? gmailFlagsFromLabelIds(message.labelIds).archived),
    isNewSender: false,
    isSynthetic: false,
    avatarInitials: initialsFor(parsedSender.name),
    avatarColor: '#ddd7f2',
  };
}

export function parseMboxToThreads(mboxText, { accountId = 'acct_local_import' } = {}) {
  if (!mboxText || !mboxText.includes('\nFrom:')) return [];

  return splitMboxMessages(mboxText)
    .map((message, index) => parseMboxMessage(message, { accountId, index }))
    .filter(Boolean)
    .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());
}

export function redactForLogs(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(redactStructuredValue(value));
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[secret-redacted]')
    .replace(/1\/\/[A-Za-z0-9._-]+/g, '[secret-redacted]')
    .replace(/RAW_[A-Z0-9_]*KEY/g, '[secret-redacted]')
    .replace(/sk-[A-Za-z0-9._-]+/g, '[secret-redacted]')
    .replace(/(access_token|refresh_token|id_token|client_secret|authorization_code|code_verifier)":"[^"]+"/gi, '$1":"[secret-redacted]"')
    .replace(/("?(?:body|raw|payload|prompt|messages|snippet|responseBody|response_body|response)"?\s*[:=]\s*)"[^"]*"/gi, '$1"[body-redacted]"')
    .replace(/\b(body|raw|payload|prompt|messages|snippet|responseBody|response_body|response)\b\s+([^.;\n]+)/gi, '$1 [body-redacted]')
    .replace(/responseBody|response_body/gi, 'response [body-redacted]');
}

const fakeGmailMessages = [
  {
    id: 'gmail_msg_001',
    threadId: 'gmail_thr_welcome_001',
    historyId: 'fake-history-001',
    subject: 'Welcome to Kept',
    from: 'Pip the Keeper Owl <pip@kept.local>',
    to: 'you@kept.local',
    snippet: 'Welcome to Kept — your mail stays on this device.',
    textBody: 'Welcome to Kept. This fake Gmail sample proves local ingestion without real credentials.',
    receivedAt: '2026-05-25T09:30:00Z',
  },
  {
    id: 'gmail_msg_002',
    threadId: 'gmail_thr_invoice_002',
    historyId: 'fake-history-002',
    subject: 'Invoice for design review',
    from: 'Mara from Northstar Foods <mara@example.com>',
    to: 'you@kept.local',
    snippet: 'Can you confirm the invoice timing?',
    textBody: 'Can you confirm the invoice timing before the design review next week?',
    receivedAt: '2026-05-24T16:30:00Z',
  },
];

function redactStructuredValue(value) {
  if (Array.isArray(value)) return value.map(redactStructuredValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (/body|raw|payload|snippet|prompt|messages|responseBody|response_body|response/i.test(key)) return [key, '[body-redacted]'];
      if (/token|secret|codeVerifier|code_verifier|authorization_code|code$/i.test(key)) return [key, '[secret-redacted]'];
      return [key, redactStructuredValue(nested)];
    }),
  );
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function validateTokenPayload(tokens) {
  requireField('tokens', tokens);
  requireField('accessToken', tokens.accessToken);
}

function normalizeTokenPayload(tokens) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || null,
    expiresAt: tokens.expiresAt || null,
    scope: tokens.scope || gmailMinimalScopes.join(' '),
    tokenType: tokens.tokenType || 'Bearer',
  };
}

async function readAccessToken(tokenStore, accountId, refreshOptions = {}) {
  const tokens = await tokenStore.loadTokens(accountId);
  if (!tokens?.accessToken) throw new Error('Gmail access token not found in keychain');
  if (isTokenExpired(tokens, refreshOptions.now) && tokens.refreshToken) {
    const refreshed = await refreshGmailAccessToken(tokens, refreshOptions);
    const nextTokens = normalizeTokenPayload({
      ...tokens,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || tokens.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: refreshed.scope || tokens.scope,
      tokenType: refreshed.tokenType || tokens.tokenType,
    });
    if (typeof tokenStore.saveTokens === 'function') await tokenStore.saveTokens(accountId, nextTokens);
    return nextTokens.accessToken;
  }
  return tokens.accessToken;
}

function isTokenExpired(tokens, now = () => new Date()) {
  if (!tokens?.expiresAt) return false;
  const expiresAt = Date.parse(tokens.expiresAt);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= now().getTime() + 60_000;
}

async function refreshGmailAccessToken(tokens, { fetchImpl, tokenUrl, clientId, clientSecret, now = () => new Date() } = {}) {
  requireField('refreshToken', tokens.refreshToken);
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', tokens.refreshToken);
  if (clientId) body.set('client_id', clientId);
  if (clientSecret) body.set('client_secret', clientSecret);
  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response?.ok) throw createGmailAuthRevokedError(`Gmail token refresh failed with ${response?.status || 'unknown'} status`);
  const json = await response.json();
  const expiresInSeconds = Number(json.expires_in || 3600);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || tokens.refreshToken,
    expiresAt: new Date(now().getTime() + expiresInSeconds * 1000).toISOString(),
    scope: json.scope || tokens.scope,
    tokenType: json.token_type || tokens.tokenType || 'Bearer',
  };
}

async function fetchGmailJson(fetchImpl, url, accessToken) {
  const response = await fetchImpl(String(url), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (response?.status === 401 || response?.status === 403) throw createGmailAuthRevokedError(`Gmail credentials were revoked or expired with ${response.status} status`);
  if (!response?.ok) throw new Error(`Gmail API request failed with ${response?.status || 'unknown'} status`);
  return response.json();
}

async function modifyGmailMessageLabels({ tokenStore, accountId, fetchImpl, tokenUrl, clientId, clientSecret, now, messageId, payload }) {
  requireField('messageId', messageId);
  const accessToken = await readAccessToken(tokenStore, accountId, { fetchImpl, tokenUrl, clientId, clientSecret, now });
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`);
  const response = await fetchImpl(String(url), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeGmailModifyPayload(payload)),
  });
  if (response?.status === 401 || response?.status === 403) {
    if (typeof tokenStore.clearTokens === 'function') await tokenStore.clearTokens(accountId);
    throw createGmailAuthRevokedError(`Gmail credentials were revoked or expired with ${response.status} status`);
  }
  if (!response?.ok) throw new Error(`Gmail API modify failed with ${response?.status || 'unknown'} status`);
  return response.json();
}

function normalizeGmailModifyPayload(payload = {}) {
  return {
    addLabelIds: Array.isArray(payload.addLabelIds) ? payload.addLabelIds.map(String) : [],
    removeLabelIds: Array.isArray(payload.removeLabelIds) ? payload.removeLabelIds.map(String) : [],
  };
}

function normalizeGmailLabelIds(labelIds) {
  if (!Array.isArray(labelIds)) return ['INBOX', 'UNREAD'];
  return [...new Set(labelIds.map(String))];
}

function gmailFlagsFromLabelIds(labelIds) {
  const labels = new Set(normalizeGmailLabelIds(labelIds));
  return {
    read: !labels.has('UNREAD'),
    starred: labels.has('STARRED'),
    archived: !labels.has('INBOX'),
  };
}

function createGmailAuthRevokedError(message) {
  const error = new Error(message || 'Gmail authorization was revoked.');
  error.code = 'GMAIL_AUTH_REVOKED';
  return error;
}

function extractGmailTextBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeGmailBody(payload.body.data);
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  const textPart = parts.find((part) => part.mimeType === 'text/plain' && part.body?.data);
  if (textPart) return decodeGmailBody(textPart.body.data);
  for (const part of parts) {
    const text = extractGmailTextBody(part);
    if (text) return text;
  }
  return payload.mimeType === 'text/html' ? '' : (payload.body?.data ? decodeGmailBody(payload.body.data) : '');
}

function decodeGmailBody(data) {
  try {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))).trim();
  } catch (_error) {
    return '';
  }
}

function gmailInternalDateToIso(internalDate) {
  const millis = Number(internalDate);
  if (!Number.isFinite(millis)) return null;
  const parsed = new Date(millis);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseHeaderDate(dateHeader) {
  const parsed = new Date(dateHeader || 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function stripPrivateBodyForPersistence(thread) {
  const { body, textBody, ...safeThread } = thread;
  return {
    ...safeThread,
    snippet: thread.snippet || summarizeBody(textBody || body || '') || '',
    searchTokens: createSearchTokens(thread),
  };
}

function createSearchTokens(thread) {
  return [
    thread.sender,
    thread.senderEmail,
    thread.subject,
    thread.snippet,
    thread.body,
    thread.textBody,
    ...(Array.isArray(thread.recipients) ? thread.recipients : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}@._-]+|[^\p{L}\p{N}@._-]+$/gu, ''))
    .filter(Boolean);
}

function splitMboxMessages(mboxText) {
  const normalized = mboxText.replace(/\r\n/g, '\n');
  return normalized
    .split(/\n(?=From [^\n]+\n)/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('From '));
}

function parseMboxMessage(rawMessage, { accountId, index }) {
  const lines = rawMessage.split('\n');
  if (!lines[0]?.startsWith('From ')) return null;

  const headerLines = [];
  let bodyStart = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '') {
      bodyStart = i + 1;
      break;
    }
    headerLines.push(lines[i]);
  }
  if (bodyStart === -1) return null;

  const headers = parseMboxHeaders(headerLines);
  const body = cleanMboxBody(lines.slice(bodyStart).join('\n'));
  const from = headers.from || 'unknown sender';
  const parsedSender = parseMailbox(from);
  const subject = decodeHeader(headers.subject || '(no subject)');
  const receivedAt = parseMboxDate(headers.date, lines[0]);
  const messageId = headers['message-id'] || `local-mbox-${index}`;

  return {
    id: stableLocalMessageId(messageId, index),
    accountId,
    subject,
    sender: parsedSender.name,
    senderEmail: parsedSender.email,
    recipients: headers.to ? [headers.to] : [],
    body,
    snippet: summarizeBody(body),
    receivedAt,
    providerMessageId: messageId,
    historyId: null,
    isPriority: false,
    isUnread: false,
    isNewSender: false,
    isSynthetic: false,
    avatarInitials: initialsFor(parsedSender.name),
    avatarColor: '#ddd7f2',
  };
}

function parseMboxHeaders(headerLines) {
  const unfolded = [];
  headerLines.forEach((line) => {
    if (/^[\t ]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  });

  return Object.fromEntries(
    unfolded
      .map((line) => {
        const separator = line.indexOf(':');
        if (separator === -1) return null;
        return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
      })
      .filter(Boolean),
  );
}

function parseMailbox(value) {
  const decoded = decodeHeader(value);
  const match = decoded.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { name: decoded, email: decoded.includes('@') ? decoded : '' };
  const name = match[1].replace(/^"|"$/g, '').trim() || match[2];
  return { name, email: match[2].trim() };
}

function parseMboxDate(dateHeader, fromLine) {
  const parsed = new Date(dateHeader || fromLine.replace(/^From\s+\S+\s+/, ''));
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function cleanMboxBody(body) {
  return body
    .replace(/\n--[^\n]+\n[\s\S]*$/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function summarizeBody(body) {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > 160 ? `${compact.slice(0, 157)}…` : compact;
}

function decodeHeader(value) {
  return value.replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi, (_, encoded) => encoded.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, hex) => String.fromCharCode(Number.parseInt(hex, 16))));
}

function initialsFor(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '??';
}

function stableLocalMessageId(messageId, index) {
  return `local_${index}_${messageId.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 48)}`;
}

export const localMailRepositoryContractVersion = 1;

export const canonicalMailStateMatrix = Object.freeze([
  {
    system: 'gmail',
    sourceOfTruth: 'Remote provider metadata and immutable provider message ids; OAuth tokens stay in keychain only.',
    persistedLocally: 'historyId cursor, provider ids, normalized headers, body copy after explicit sync/import.',
    staleDataBehavior: 'Use historyId for incremental sync; if expired, run bounded deduping resync by providerMessageId.',
    tokenPolicy: 'Never store access tokens, refresh tokens, API keys, or client secrets in the local mail repository.',
  },
  {
    system: 'localStore',
    sourceOfTruth: 'Durable normalized LocalAccount, LocalThread, LocalMessage, AttachmentMetadata, sync state, flags, and AI audit entries.',
    persistedLocally: 'Message bodies, snippets, attachments metadata, local flags, provider cursors, and audit records.',
    staleDataBehavior: 'Reader and search read local snapshots until a sync updates matching provider ids.',
    tokenPolicy: 'Store non-secret provider cursors only; secret fields are stripped at repository boundaries.',
  },
  {
    system: 'search',
    sourceOfTruth: 'Rebuildable index derived from localStore messages, never an independent body authority.',
    persistedLocally: 'Index terms and bounded previews may be regenerated from stored messages.',
    staleDataBehavior: 'If missing or stale, rebuild from localStore before querying.',
    tokenPolicy: 'Search rows never include tokens, API keys, or OAuth payloads.',
  },
  {
    system: 'reader',
    sourceOfTruth: 'LocalMessage body and attachment metadata selected by message id.',
    persistedLocally: 'Reader state is flags and selected local ids; body content remains in localStore.',
    staleDataBehavior: 'Render last synced local body clearly; sync refresh can replace by provider id.',
    tokenPolicy: 'Reader receives no provider credentials.',
  },
  {
    system: 'ai',
    sourceOfTruth: 'User-approved selected local thread/message excerpts plus AiAuditEntry records.',
    persistedLocally: 'Audit metadata records provider, purpose, approval, content description, and local ids.',
    staleDataBehavior: 'AI output is advisory and tied to the local content version described in the audit entry.',
    tokenPolicy: 'BYO provider keys stay in keychain or local provider config references, never in mail repository rows.',
  },
]);

export function normalizeLocalAccount(account = {}) {
  requireField('account.id', account.id);
  requireField('account.provider', account.provider);
  requireField('account.email', account.email);
  return {
    id: String(account.id),
    provider: String(account.provider),
    email: String(account.email),
    displayName: account.displayName ? String(account.displayName) : '',
    createdAt: account.createdAt || new Date(0).toISOString(),
    updatedAt: account.updatedAt || account.createdAt || new Date(0).toISOString(),
  };
}

export function normalizeLocalThread(thread = {}) {
  requireField('thread.id', thread.id);
  requireField('thread.accountId', thread.accountId);
  return {
    id: String(thread.id),
    accountId: String(thread.accountId),
    subject: thread.subject || '(no subject)',
    updatedAt: thread.updatedAt || thread.receivedAt || new Date(0).toISOString(),
    messageIds: Array.isArray(thread.messageIds) ? [...new Set(thread.messageIds.map(String))] : [],
    metadata: sanitizeSecretFields(thread.metadata || {}),
  };
}

export function normalizeLocalMessage(message = {}) {
  requireField('message.id', message.id);
  requireField('message.accountId', message.accountId);
  requireField('message.threadId', message.threadId);
  const sender = normalizeMailContact(message.sender);
  const body = String(message.body || '');
  return {
    id: String(message.id),
    accountId: String(message.accountId),
    threadId: String(message.threadId),
    providerMessageId: message.providerMessageId ? String(message.providerMessageId) : String(message.id),
    sender,
    recipients: normalizeRecipients(message.recipients),
    subject: message.subject || '(no subject)',
    snippet: message.snippet || summarizeBody(body),
    body,
    receivedAt: message.receivedAt || new Date(0).toISOString(),
    attachments: Array.isArray(message.attachments) ? message.attachments.map(normalizeAttachmentMetadata) : [],
    flags: normalizeLocalFlags(message.flags),
    metadata: sanitizeSecretFields(message.metadata || {}),
  };
}

export function normalizeAttachmentMetadata(attachment = {}) {
  requireField('attachment.id', attachment.id);
  return {
    id: String(attachment.id),
    messageId: attachment.messageId ? String(attachment.messageId) : null,
    filename: attachment.filename ? String(attachment.filename) : 'attachment',
    mimeType: attachment.mimeType || attachment.mime_type || 'application/octet-stream',
    byteSize: Number.isFinite(Number(attachment.byteSize ?? attachment.byte_size)) ? Number(attachment.byteSize ?? attachment.byte_size) : 0,
    metadata: sanitizeSecretFields(attachment.metadata || {}),
  };
}

export function normalizeAiAuditEntry(entry = {}) {
  requireField('aiAudit.id', entry.id);
  return {
    id: String(entry.id),
    threadId: entry.threadId ? String(entry.threadId) : null,
    messageId: entry.messageId ? String(entry.messageId) : null,
    provider: entry.provider || 'none',
    model: entry.model ? String(entry.model) : null,
    purpose: entry.purpose || 'unknown',
    action: entry.action || entry.purpose || 'unknown',
    selectedIds: Array.isArray(entry.selectedIds) ? entry.selectedIds.map(String) : [],
    payloadPreview: entry.payloadPreview ? String(entry.payloadPreview) : '',
    payloadHash: entry.payloadHash ? String(entry.payloadHash) : '',
    approvalState: entry.approvalState || (entry.approved ? 'approved' : 'denied'),
    approved: Boolean(entry.approved),
    requiresExplicitApproval: entry.requiresExplicitApproval ?? true,
    contentDescription: entry.contentDescription || 'selected local mail content',
    result: redactAuditValue(entry.result ?? null),
    error: entry.error ? redactForLogs(String(entry.error)) : null,
    createdAt: entry.createdAt || new Date(0).toISOString(),
    metadata: sanitizeSecretFields(entry.metadata || {}),
  };
}

export const localMailSearchStates = Object.freeze(['disabled', 'indexing', 'ready', 'stale', 'no-results', 'error']);

export function getLocalMailSearchState({ enabled = true, indexing = false, query = '', resultCount = null, index = null, repositoryUpdatedAt = null, error = null } = {}) {
  if (!enabled) return { status: 'disabled', label: 'Search disabled', detail: 'Local search is unavailable until mail storage is enabled.' };
  if (error) return { status: 'error', label: 'Search error', detail: userSafeSearchError(error) };
  if (indexing) return { status: 'indexing', label: 'Indexing local mail', detail: 'Kept is preparing local mail search on this device.' };
  if (index && repositoryUpdatedAt && Date.parse(repositoryUpdatedAt) > Date.parse(index.sourceUpdatedAt || '')) {
    return { status: 'stale', label: 'Search updating', detail: 'Recent local mail is saved; search is catching up.' };
  }
  if (String(query || '').trim() && resultCount === 0) {
    return { status: 'no-results', label: 'No search results', detail: 'No synced or imported local mail matches that search.' };
  }
  return { status: 'ready', label: 'Search ready', detail: 'Search runs offline over synced and imported local mail.' };
}

export async function searchLocalMailRepository({ repository, query, enabled = true } = {}) {
  if (!enabled || !repository) {
    return { state: getLocalMailSearchState({ enabled: false }), results: [], query: String(query || '') };
  }

  try {
    const metadata = await repository.getSearchMetadata();
    const index = await repository.rebuildSearchIndex();
    const results = await index.search(query);
    return {
      state: getLocalMailSearchState({ query, resultCount: results.length, index, repositoryUpdatedAt: metadata.repositoryUpdatedAt }),
      results,
      query: String(query || ''),
      index,
    };
  } catch (error) {
    return { state: getLocalMailSearchState({ error }), results: [], query: String(query || '') };
  }
}

export async function upsertThreadsIntoLocalRepository({ repository, account, threads, provider = account?.provider || 'local' } = {}) {
  requireField('repository', repository);
  requireField('account', account);
  const normalizedAccount = await repository.upsertAccount({ ...account, provider });
  const savedMessages = [];

  for (const thread of threads || []) {
    const rawThreadId = thread.id || thread.threadId || thread.providerMessageId;
    requireField('thread.id', rawThreadId);
    const threadId = String(rawThreadId);
    await repository.upsertThread({
      id: threadId,
      accountId: normalizedAccount.id,
      subject: thread.subject || '(no subject)',
      updatedAt: thread.updatedAt || thread.receivedAt || new Date(0).toISOString(),
      messageIds: [`${threadId}:msg0`],
    });
    savedMessages.push(await repository.upsertMessage({
      id: `${threadId}:msg0`,
      accountId: normalizedAccount.id,
      threadId,
      providerMessageId: thread.providerMessageId || thread.messageId || thread.id || threadId,
      sender: { name: thread.sender || 'unknown sender', email: thread.senderEmail || '' },
      recipients: normalizeThreadRecipients(thread.recipients),
      subject: thread.subject || '(no subject)',
      body: thread.body || thread.textBody || thread.snippet || '',
      snippet: thread.snippet || summarizeBody(thread.body || thread.textBody || ''),
      receivedAt: thread.receivedAt || new Date(0).toISOString(),
      flags: { read: !thread.isUnread, starred: Boolean(thread.isPriority), archived: false },
      metadata: { source: thread.source || provider },
    }));
  }

  return { account: normalizedAccount, messageCount: savedMessages.length, messages: savedMessages };
}

export async function createLocalMailRepository({ path: storePath, initialData, bodyEncryptionKey } = {}) {
  requireField('path', storePath);
  const bodyEncryption = await createBodyEncryptionContext({ storePath, bodyEncryptionKey });
  let state = await loadLocalMailState(storePath, initialData, bodyEncryption);

  async function persist() {
    const { mkdir, rename, writeFile, dirname } = await localRepositoryFileOps();
    await mkdir(dirname(storePath), { recursive: true });
    const tmpPath = `${storePath}.tmp`;
    const diskState = serializeLocalMailStateForDisk(state, bodyEncryption);
    await writeFile(tmpPath, `${JSON.stringify(diskState, null, 2)}\n`, 'utf8');
    await rename(tmpPath, storePath);
  }

  const api = {
    path: storePath,
    async close() { await persist(); },
    async upsertAccount(account) {
      const normalized = normalizeLocalAccount(account);
      state.accounts[normalized.id] = { ...state.accounts[normalized.id], ...normalized };
      await persist();
      return state.accounts[normalized.id];
    },
    async listAccounts() { return Object.values(state.accounts).map(clone); },
    async getAccount(accountId) { return clone(state.accounts[accountId] || null); },
    async upsertThread(thread) {
      const normalized = normalizeLocalThread(thread);
      const previous = state.threads[normalized.id] || {};
      state.threads[normalized.id] = { ...previous, ...normalized, messageIds: normalized.messageIds.length ? normalized.messageIds : (previous.messageIds || []) };
      await persist();
      return clone(state.threads[normalized.id]);
    },
    async listThreads({ accountId } = {}) {
      return Object.values(state.threads)
        .filter((thread) => !accountId || thread.accountId === accountId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(clone);
    },
    async getThread(threadId) { return clone(state.threads[threadId] || null); },
    async upsertMessage(message) {
      const normalizedInput = normalizeLocalMessage(message);
      const existingId = findMessageIdByProvider(state, normalizedInput.accountId, normalizedInput.providerMessageId);
      const id = existingId || normalizedInput.id;
      const normalized = { ...normalizedInput, id, attachments: normalizedInput.attachments.map((attachment) => ({ ...attachment, messageId: id })) };
      const previousMessage = state.messages[id];
      if (previousMessage?.threadId && previousMessage.threadId !== normalized.threadId && state.threads[previousMessage.threadId]) {
        state.threads[previousMessage.threadId].messageIds = (state.threads[previousMessage.threadId].messageIds || []).filter((messageId) => messageId !== id);
      }
      const reconciled = hasUnresolvedTriageActionForMessage(state, normalized.accountId, id, normalized.providerMessageId)
        ? { ...normalized, flags: previousMessage?.flags || normalized.flags }
        : normalized;
      state.messages[id] = reconciled;
      state.attachments = Object.fromEntries(Object.entries(state.attachments).filter(([, attachment]) => attachment.messageId !== id));
      reconciled.attachments.forEach((attachment) => { state.attachments[scopedAttachmentKey(id, attachment.id)] = attachment; });
      const thread = state.threads[reconciled.threadId] || normalizeLocalThread({ id: reconciled.threadId, accountId: reconciled.accountId, subject: reconciled.subject, updatedAt: reconciled.receivedAt });
      const messageIds = new Set(thread.messageIds || []);
      messageIds.add(id);
      state.threads[reconciled.threadId] = {
        ...thread,
        subject: reconciled.subject || thread.subject,
        updatedAt: maxIsoTimestamp(thread.updatedAt, reconciled.receivedAt),
        messageIds: [...messageIds],
      };
      await persist();
      return clone(state.messages[id]);
    },
    async getMessage(messageId) { return clone(state.messages[messageId] || null); },
    async listMessages({ accountId, threadId } = {}) {
      return Object.values(state.messages)
        .filter((message) => (!accountId || message.accountId === accountId) && (!threadId || message.threadId === threadId))
        .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
        .map(clone);
    },
    async getSearchMetadata() {
      const repositoryUpdatedAt = Object.values(state.messages)
        .map((message) => message.receivedAt)
        .concat(Object.values(state.threads).map((thread) => thread.updatedAt))
        .filter(Boolean)
        .sort()
        .at(-1) || new Date(0).toISOString();
      return { messageCount: Object.keys(state.messages).length, repositoryUpdatedAt };
    },
    async setFlags(messageId, flags) {
      requireField('messageId', messageId);
      if (!state.messages[messageId]) throw new Error(`Local message not found: ${messageId}`);
      state.messages[messageId].flags = normalizeLocalFlags({ ...state.messages[messageId].flags, ...flags });
      await persist();
      return clone(state.messages[messageId].flags);
    },
    async queueTriageAction(action) {
      const normalized = normalizeTriageActionEntry(action);
      state.triageActions[normalized.id] = normalized;
      if (normalized.messageId && state.messages[normalized.messageId] && Object.keys(normalized.desiredFlags).length > 0) {
        state.messages[normalized.messageId].flags = normalizeLocalFlags({ ...state.messages[normalized.messageId].flags, ...normalized.desiredFlags });
      }
      await persist();
      return clone(state.triageActions[normalized.id]);
    },
    async updateTriageActionStatus(actionId, patch = {}) {
      requireField('actionId', actionId);
      if (!state.triageActions[actionId]) throw new Error(`Triage action not found: ${actionId}`);
      const next = normalizeTriageActionEntry({ ...state.triageActions[actionId], ...patch, id: actionId });
      state.triageActions[actionId] = next;
      await persist();
      return clone(next);
    },
    async listTriageActions({ status, accountId, messageId } = {}) {
      return Object.values(state.triageActions)
        .filter((entry) => (!status || entry.status === status) && (!accountId || entry.accountId === accountId) && (!messageId || entry.messageId === messageId))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(clone);
    },
    async saveSyncState(accountId, syncState) {
      requireField('accountId', accountId);
      state.syncStates[accountId] = sanitizeSecretFields({ ...syncState, updatedAt: syncState.updatedAt || syncState.syncedAt || new Date(0).toISOString() });
      await persist();
      return clone(state.syncStates[accountId]);
    },
    async getSyncState(accountId) { return clone(state.syncStates[accountId] || null); },
    async recordAiAudit(entry) {
      const normalized = normalizeAiAuditEntry(entry);
      state.aiAudits[normalized.id] = normalized;
      await persist();
      return clone(normalized);
    },
    async listAiAuditEntries({ threadId, messageId } = {}) {
      return Object.values(state.aiAudits)
        .filter((entry) => (!threadId || entry.threadId === threadId) && (!messageId || entry.messageId === messageId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(clone);
    },
    async rebuildSearchIndex() {
      const metadata = await this.getSearchMetadata();
      const rows = Object.values(state.messages).map((message) => ({
        messageId: message.id,
        threadId: message.threadId,
        subject: message.subject,
        sender: message.sender.name || message.sender.email,
        senderEmail: message.sender.email || '',
        recipients: message.recipients.map((recipient) => recipient.email || recipient.name),
        snippet: message.snippet || '',
        body: message.body,
        receivedAt: message.receivedAt,
      }));
      return createRebuiltSearchIndex(rows, metadata);
    },
    exportState() { return clone(state); },
  };

  await persist();
  return api;
}

export async function createBrowserLocalMailRepository({ storage, key = 'kept.localMailRepository.v1', initialData, bodyEncryptionKey, cryptoImpl = globalThis.crypto } = {}) {
  requireField('storage', storage);
  const bodyEncryption = await createBrowserBodyEncryptionContext({ key, bodyEncryptionKey, cryptoImpl });
  let state = initialData
    ? await migrateBrowserLocalMailState(initialData, bodyEncryption)
    : await loadBrowserLocalMailState(storage, key, bodyEncryption);

  async function persist() {
    const diskState = await serializeBrowserLocalMailStateForDisk(state, bodyEncryption);
    await storage.setItem(key, `${JSON.stringify(diskState)}\n`);
  }

  const api = {
    key,
    async close() { await persist(); },
    async upsertAccount(account) {
      const normalized = normalizeLocalAccount(account);
      state.accounts[normalized.id] = { ...state.accounts[normalized.id], ...normalized };
      await persist();
      return state.accounts[normalized.id];
    },
    async listAccounts() { return Object.values(state.accounts).map(clone); },
    async getAccount(accountId) { return clone(state.accounts[accountId] || null); },
    async upsertThread(thread) {
      const normalized = normalizeLocalThread(thread);
      const previous = state.threads[normalized.id] || {};
      state.threads[normalized.id] = { ...previous, ...normalized, messageIds: normalized.messageIds.length ? normalized.messageIds : (previous.messageIds || []) };
      await persist();
      return clone(state.threads[normalized.id]);
    },
    async listThreads({ accountId } = {}) {
      return Object.values(state.threads)
        .filter((thread) => !accountId || thread.accountId === accountId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(clone);
    },
    async getThread(threadId) { return clone(state.threads[threadId] || null); },
    async upsertMessage(message) {
      const normalizedInput = normalizeLocalMessage(message);
      const existingId = findMessageIdByProvider(state, normalizedInput.accountId, normalizedInput.providerMessageId);
      const id = existingId || normalizedInput.id;
      const normalized = { ...normalizedInput, id, attachments: normalizedInput.attachments.map((attachment) => ({ ...attachment, messageId: id })) };
      const previousMessage = state.messages[id];
      if (previousMessage?.threadId && previousMessage.threadId !== normalized.threadId && state.threads[previousMessage.threadId]) {
        state.threads[previousMessage.threadId].messageIds = (state.threads[previousMessage.threadId].messageIds || []).filter((messageId) => messageId !== id);
      }
      const reconciled = hasUnresolvedTriageActionForMessage(state, normalized.accountId, id, normalized.providerMessageId)
        ? { ...normalized, flags: previousMessage?.flags || normalized.flags }
        : normalized;
      state.messages[id] = reconciled;
      state.attachments = Object.fromEntries(Object.entries(state.attachments).filter(([, attachment]) => attachment.messageId !== id));
      reconciled.attachments.forEach((attachment) => { state.attachments[scopedAttachmentKey(id, attachment.id)] = attachment; });
      const thread = state.threads[reconciled.threadId] || normalizeLocalThread({ id: reconciled.threadId, accountId: reconciled.accountId, subject: reconciled.subject, updatedAt: reconciled.receivedAt });
      const messageIds = new Set(thread.messageIds || []);
      messageIds.add(id);
      state.threads[reconciled.threadId] = {
        ...thread,
        subject: reconciled.subject || thread.subject,
        updatedAt: maxIsoTimestamp(thread.updatedAt, reconciled.receivedAt),
        messageIds: [...messageIds],
      };
      await persist();
      return clone(state.messages[id]);
    },
    async getMessage(messageId) { return clone(state.messages[messageId] || null); },
    async listMessages({ accountId, threadId } = {}) {
      return Object.values(state.messages)
        .filter((message) => (!accountId || message.accountId === accountId) && (!threadId || message.threadId === threadId))
        .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
        .map(clone);
    },
    async setFlags(messageId, flags) {
      requireField('messageId', messageId);
      if (!state.messages[messageId]) throw new Error(`Local message not found: ${messageId}`);
      state.messages[messageId].flags = normalizeLocalFlags({ ...state.messages[messageId].flags, ...flags });
      await persist();
      return clone(state.messages[messageId].flags);
    },
    async queueTriageAction(action) {
      const normalized = normalizeTriageActionEntry(action);
      state.triageActions[normalized.id] = normalized;
      if (normalized.messageId && state.messages[normalized.messageId] && Object.keys(normalized.desiredFlags).length > 0) {
        state.messages[normalized.messageId].flags = normalizeLocalFlags({ ...state.messages[normalized.messageId].flags, ...normalized.desiredFlags });
      }
      await persist();
      return clone(state.triageActions[normalized.id]);
    },
    async updateTriageActionStatus(actionId, patch = {}) {
      requireField('actionId', actionId);
      if (!state.triageActions[actionId]) throw new Error(`Triage action not found: ${actionId}`);
      const next = normalizeTriageActionEntry({ ...state.triageActions[actionId], ...patch, id: actionId });
      state.triageActions[actionId] = next;
      await persist();
      return clone(next);
    },
    async listTriageActions({ status, accountId, messageId } = {}) {
      return Object.values(state.triageActions)
        .filter((entry) => (!status || entry.status === status) && (!accountId || entry.accountId === accountId) && (!messageId || entry.messageId === messageId))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(clone);
    },
    async saveSyncState(accountId, syncState) {
      requireField('accountId', accountId);
      state.syncStates[accountId] = sanitizeSecretFields({ ...syncState, updatedAt: syncState.updatedAt || syncState.syncedAt || new Date(0).toISOString() });
      await persist();
      return clone(state.syncStates[accountId]);
    },
    async getSyncState(accountId) { return clone(state.syncStates[accountId] || null); },
    async recordAiAudit(entry) {
      const normalized = normalizeAiAuditEntry(entry);
      state.aiAudits[normalized.id] = normalized;
      await persist();
      return clone(normalized);
    },
    async listAiAuditEntries({ threadId, messageId } = {}) {
      return Object.values(state.aiAudits)
        .filter((entry) => (!threadId || entry.threadId === threadId) && (!messageId || entry.messageId === messageId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(clone);
    },
    async rebuildSearchIndex() {
      const rows = Object.values(state.messages).map((message) => ({
        messageId: message.id,
        threadId: message.threadId,
        subject: message.subject,
        sender: message.sender.name || message.sender.email,
        recipients: message.recipients.map((recipient) => recipient.email || recipient.name),
        body: message.body,
        receivedAt: message.receivedAt,
      }));
      return createRebuiltSearchIndex(rows);
    },
    exportState() { return clone(state); },
  };

  await persist();
  return api;
}

export function createRepositoryCorruptionError(details = '') {
  const error = new Error(`Kept local mail store is corrupt. Move the store aside and rebuild from provider/local import. Details: ${redactForLogs(String(details)).slice(0, 180)}`);
  error.code = 'KEPT_LOCAL_STORE_CORRUPT';
  return error;
}

async function loadLocalMailState(storePath, initialData, bodyEncryption) {
  if (initialData) return migrateLocalMailState(initialData, bodyEncryption);
  try {
    const { readFile } = await localRepositoryFileOps();
    const raw = await readFile(storePath, 'utf8');
    return migrateLocalMailState(JSON.parse(raw), bodyEncryption);
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyLocalMailState();
    if (error?.code === 'KEPT_LOCAL_STORE_CORRUPT') throw error;
    throw createRepositoryCorruptionError(error?.message || error);
  }
}

function migrateLocalMailState(raw, bodyEncryption) {
  if (!raw || typeof raw !== 'object') throw createRepositoryCorruptionError('local store root is not an object');
  const next = emptyLocalMailState();
  Object.values(raw.accounts || {}).forEach((account) => { next.accounts[account.id] = normalizeLocalAccount(account); });
  Object.values(raw.threads || {}).forEach((thread) => { next.threads[thread.id] = normalizeLocalThread(thread); });
  Object.values(raw.messages || {}).forEach((message) => {
    const normalized = normalizeLocalMessage(deserializeLocalMessageFromDisk(message, bodyEncryption));
    next.messages[normalized.id] = normalized;
    normalized.attachments.forEach((attachment) => { next.attachments[scopedAttachmentKey(normalized.id, attachment.id)] = attachment; });
  });
  Object.values(raw.attachments || {}).forEach((attachment) => {
    const normalized = normalizeAttachmentMetadata(attachment);
    next.attachments[scopedAttachmentKey(normalized.messageId || 'unscoped', normalized.id)] = normalized;
  });
  Object.entries(raw.syncStates || {}).forEach(([accountId, syncState]) => { next.syncStates[accountId] = sanitizeSecretFields(syncState); });
  Object.values(raw.aiAudits || {}).forEach((entry) => { next.aiAudits[entry.id] = normalizeAiAuditEntry(entry); });
  Object.values(raw.triageActions || raw.actionQueue || {}).forEach((entry) => { next.triageActions[entry.id] = normalizeTriageActionEntry(entry); });
  return next;
}

function emptyLocalMailState() {
  return {
    schemaVersion: localMailRepositoryContractVersion,
    accounts: {},
    threads: {},
    messages: {},
    attachments: {},
    syncStates: {},
    aiAudits: {},
    triageActions: {},
  };
}


function serializeLocalMailStateForDisk(state, bodyEncryption) {
  const diskState = clone(state);
  diskState.messages = Object.fromEntries(
    Object.entries(diskState.messages).map(([id, message]) => {
      const encrypted = { ...message };
      encrypted.bodyCiphertext = encryptRepositoryText(message.body || '', bodyEncryption);
      encrypted.snippetCiphertext = encryptRepositoryText(message.snippet || '', bodyEncryption);
      delete encrypted.body;
      delete encrypted.snippet;
      return [id, encrypted];
    }),
  );
  return diskState;
}

function deserializeLocalMessageFromDisk(message, bodyEncryption) {
  if (!message || typeof message !== 'object') return message;
  if (!message.bodyCiphertext && !message.snippetCiphertext) return message;
  return {
    ...message,
    body: decryptRepositoryText(message.bodyCiphertext, bodyEncryption),
    snippet: decryptRepositoryText(message.snippetCiphertext, bodyEncryption),
  };
}

async function loadBrowserLocalMailState(storage, key, bodyEncryption) {
  try {
    const raw = await storage.getItem(key);
    if (!raw) return emptyLocalMailState();
    return migrateBrowserLocalMailState(JSON.parse(raw), bodyEncryption);
  } catch (error) {
    if (error?.code === 'KEPT_LOCAL_STORE_CORRUPT') throw error;
    throw createRepositoryCorruptionError(error?.message || error);
  }
}

async function migrateBrowserLocalMailState(raw, bodyEncryption) {
  if (!raw || typeof raw !== 'object') throw createRepositoryCorruptionError('local store root is not an object');
  const next = emptyLocalMailState();
  Object.values(raw.accounts || {}).forEach((account) => { next.accounts[account.id] = normalizeLocalAccount(account); });
  Object.values(raw.threads || {}).forEach((thread) => { next.threads[thread.id] = normalizeLocalThread(thread); });
  for (const message of Object.values(raw.messages || {})) {
    const normalized = normalizeLocalMessage(await deserializeBrowserLocalMessageFromDisk(message, bodyEncryption));
    next.messages[normalized.id] = normalized;
    normalized.attachments.forEach((attachment) => { next.attachments[scopedAttachmentKey(normalized.id, attachment.id)] = attachment; });
  }
  Object.values(raw.attachments || {}).forEach((attachment) => {
    const normalized = normalizeAttachmentMetadata(attachment);
    next.attachments[scopedAttachmentKey(normalized.messageId || 'unscoped', normalized.id)] = normalized;
  });
  Object.entries(raw.syncStates || {}).forEach(([accountId, syncState]) => { next.syncStates[accountId] = sanitizeSecretFields(syncState); });
  Object.values(raw.aiAudits || {}).forEach((entry) => { next.aiAudits[entry.id] = normalizeAiAuditEntry(entry); });
  Object.values(raw.triageActions || raw.actionQueue || {}).forEach((entry) => { next.triageActions[entry.id] = normalizeTriageActionEntry(entry); });
  return next;
}

async function serializeBrowserLocalMailStateForDisk(state, bodyEncryption) {
  const diskState = clone(state);
  diskState.messages = Object.fromEntries(await Promise.all(
    Object.entries(diskState.messages).map(async ([id, message]) => {
      const encrypted = { ...message };
      encrypted.bodyCiphertext = await encryptBrowserRepositoryText(message.body || '', bodyEncryption);
      encrypted.snippetCiphertext = await encryptBrowserRepositoryText(message.snippet || '', bodyEncryption);
      delete encrypted.body;
      delete encrypted.snippet;
      return [id, encrypted];
    }),
  ));
  return diskState;
}

async function deserializeBrowserLocalMessageFromDisk(message, bodyEncryption) {
  if (!message || typeof message !== 'object') return message;
  if (!message.bodyCiphertext && !message.snippetCiphertext) return message;
  return {
    ...message,
    body: await decryptBrowserRepositoryText(message.bodyCiphertext, bodyEncryption),
    snippet: await decryptBrowserRepositoryText(message.snippetCiphertext, bodyEncryption),
  };
}

async function createBodyEncryptionContext({ storePath, bodyEncryptionKey }) {
  const crypto = await import('node:crypto');
  const keyMaterial = bodyEncryptionKey
    ? Buffer.from(String(bodyEncryptionKey))
    : Buffer.from(`kept-local-mail-repository-v1:${storePath}`);
  return {
    crypto,
    key: crypto.createHash('sha256').update(keyMaterial).digest(),
    keySource: bodyEncryptionKey ? 'caller-provided' : 'store-path-fallback',
  };
}

async function createBrowserBodyEncryptionContext({ key, bodyEncryptionKey, cryptoImpl }) {
  const subtle = cryptoImpl?.subtle;
  if (!subtle || !cryptoImpl?.getRandomValues) throw new Error('Web Crypto is required for browser local mail repository encryption');
  const encoder = new TextEncoder();
  const keyMaterial = bodyEncryptionKey ? String(bodyEncryptionKey) : `kept-browser-local-mail-repository-v1:${key}`;
  const digest = await subtle.digest('SHA-256', encoder.encode(keyMaterial));
  return {
    crypto: cryptoImpl,
    subtle,
    key: await subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']),
    keySource: bodyEncryptionKey ? 'caller-provided' : 'storage-key-fallback',
  };
}

function encryptRepositoryText(value, bodyEncryption) {
  const text = String(value || '');
  const iv = bodyEncryption.crypto.randomBytes(12);
  const cipher = bodyEncryption.crypto.createCipheriv('aes-256-gcm', bodyEncryption.key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptRepositoryText(value, bodyEncryption) {
  if (!value) return '';
  const [version, ivBase64, tagBase64, ciphertextBase64] = String(value).split(':');
  if (version !== 'v1' || !ivBase64 || !tagBase64 || !ciphertextBase64) throw createRepositoryCorruptionError('invalid encrypted body payload');
  try {
    const decipher = bodyEncryption.crypto.createDecipheriv('aes-256-gcm', bodyEncryption.key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextBase64, 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    throw createRepositoryCorruptionError(error?.message || 'body decrypt failed');
  }
}

async function encryptBrowserRepositoryText(value, bodyEncryption) {
  const iv = new Uint8Array(12);
  bodyEncryption.crypto.getRandomValues(iv);
  const ciphertext = await bodyEncryption.subtle.encrypt(
    { name: 'AES-GCM', iv },
    bodyEncryption.key,
    new TextEncoder().encode(String(value || '')),
  );
  return `web-v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decryptBrowserRepositoryText(value, bodyEncryption) {
  if (!value) return '';
  const [version, ivBase64, ciphertextBase64] = String(value).split(':');
  if (version !== 'web-v1' || !ivBase64 || !ciphertextBase64) throw createRepositoryCorruptionError('invalid encrypted body payload');
  try {
    const plaintext = await bodyEncryption.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivBase64) },
      bodyEncryption.key,
      base64ToBytes(ciphertextBase64),
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    throw createRepositoryCorruptionError(error?.message || 'body decrypt failed');
  }
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64');
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function scopedAttachmentKey(messageId, attachmentId) {
  return `${messageId}:${attachmentId}`;
}

function maxIsoTimestamp(left, right) {
  const leftValue = Date.parse(left || '');
  const rightValue = Date.parse(right || '');
  if (Number.isNaN(leftValue)) return right || left || new Date(0).toISOString();
  if (Number.isNaN(rightValue)) return left || right || new Date(0).toISOString();
  return rightValue > leftValue ? right : left;
}

function createRebuiltSearchIndex(rows, { repositoryUpdatedAt = new Date(0).toISOString() } = {}) {
  return {
    rows: rows.map(clone),
    sourceUpdatedAt: repositoryUpdatedAt,
    builtAt: new Date(0).toISOString(),
    async search(query) {
      const terms = normalizeSearchTerms(query);
      if (terms.length === 0) return [];
      return rows
        .map((row) => {
          const haystack = `${row.subject} ${row.sender} ${row.senderEmail} ${row.recipients.join(' ')} ${row.snippet} ${row.body}`.toLowerCase();
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
          return { ...clone(row), score, snippet: (row.snippet || row.body).slice(0, 160) };
        })
        .filter((row) => row.score > 0)
        .sort((left, right) => right.score - left.score || right.receivedAt.localeCompare(left.receivedAt));
    },
  };
}

function findMessageIdByProvider(state, accountId, providerMessageId) {
  return Object.values(state.messages).find((message) => message.accountId === accountId && message.providerMessageId === providerMessageId)?.id || null;
}

function normalizeMailContact(contact) {
  if (typeof contact === 'string') return parseMailbox(contact);
  if (!contact || typeof contact !== 'object') return { name: 'unknown sender', email: '' };
  return { name: contact.name || contact.email || 'unknown sender', email: contact.email || '' };
}

function normalizeRecipients(recipients) {
  if (!Array.isArray(recipients)) return [];
  return recipients.map((recipient) => normalizeMailContact(recipient));
}

function normalizeThreadRecipients(recipients) {
  if (!Array.isArray(recipients)) return [];
  return recipients.map((recipient) => (typeof recipient === 'string' ? recipient : (recipient.email || recipient.name || ''))).filter(Boolean);
}

function userSafeSearchError(error) {
  return redactForLogs(error?.message || 'Local search could not finish.');
}

function normalizeLocalFlags(flags = {}) {
  return {
    read: Boolean(flags.read),
    starred: Boolean(flags.starred),
    archived: Boolean(flags.archived),
  };
}

function normalizeTriageActionEntry(entry = {}) {
  requireField('triageAction.id', entry.id);
  requireField('triageAction.accountId', entry.accountId);
  requireField('triageAction.action', entry.action);
  if (!gmailTriageActionTypes.includes(entry.action)) throw new Error(`Unsupported Gmail triage action: ${entry.action}`);
  const status = entry.status || 'queued';
  if (!gmailTriageActionStatuses.includes(status)) throw new Error(`Unsupported triage action status: ${status}`);
  const createdAt = entry.createdAt || new Date(0).toISOString();
  return {
    id: String(entry.id),
    accountId: String(entry.accountId),
    messageId: entry.messageId ? String(entry.messageId) : null,
    threadId: entry.threadId ? String(entry.threadId) : null,
    providerMessageId: entry.providerMessageId ? String(entry.providerMessageId) : null,
    providerThreadId: entry.providerThreadId ? String(entry.providerThreadId) : null,
    action: entry.action,
    desiredFlags: normalizePartialLocalFlags(entry.desiredFlags || flagsForTriageAction(entry.action)),
    status,
    createdAt,
    attemptedAt: entry.attemptedAt || null,
    confirmedAt: entry.confirmedAt || (status === 'synced' ? createdAt : null),
    error: entry.error ? redactForLogs(entry.error) : null,
    metadata: sanitizeSecretFields(entry.metadata || {}),
  };
}

function normalizePartialLocalFlags(flags = {}) {
  const next = {};
  if (Object.hasOwn(flags, 'read')) next.read = Boolean(flags.read);
  if (Object.hasOwn(flags, 'starred')) next.starred = Boolean(flags.starred);
  if (Object.hasOwn(flags, 'archived')) next.archived = Boolean(flags.archived);
  return next;
}

function hasUnresolvedTriageActionForMessage(state, accountId, messageId, providerMessageId) {
  const unresolved = new Set(['queued', 'syncing', 'error', 'needs-reconnect']);
  return Object.values(state.triageActions || {}).some((entry) => unresolved.has(entry.status)
    && entry.accountId === accountId
    && ((messageId && entry.messageId === messageId) || (providerMessageId && entry.providerMessageId === providerMessageId)));
}

function redactAuditValue(value) {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (typeof value === 'string') return redactForLogs(value);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (/(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|authorization[_-]?code|code[_-]?verifier|password|secret)$/i.test(key)) {
        return [key, '[secret-redacted]'];
      }
      if (/(body|raw|payload|prompt|messages|snippet)/i.test(key)) {
        return [key, '[body-redacted]'];
      }
      return [key, redactAuditValue(nested)];
    }),
  );
}

function sanitizeSecretFields(value) {
  if (Array.isArray(value)) return value.map(sanitizeSecretFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|authorization[_-]?code|code[_-]?verifier|password|secret)$/i.test(key))
      .map(([key, nested]) => [
        key,
        /(body|raw|payload|prompt|messages|snippet|responseBody|response_body|response)/i.test(key) ? '[body-redacted]' : sanitizeSecretFields(nested),
      ]),
  );
}

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

async function localRepositoryFileOps() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  return { ...fs, dirname: path.dirname };
}

function compareInboxEntries(left, right) {
  const timeDifference = new Date(right.thread.receivedAt).getTime() - new Date(left.thread.receivedAt).getTime();
  return timeDifference || left.index - right.index;
}

function startOfUtcDay(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function requireField(name, value) {
  if (!value) throw new Error(`${name} is required`);
}
