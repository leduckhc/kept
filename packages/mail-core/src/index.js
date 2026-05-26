import { buildSearchRows } from '../../search-core/src/index.js';

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

export const gmailMinimalScopes = ['https://www.googleapis.com/auth/gmail.readonly'];

export const gmailSyncCursorPlan = {
  primary: 'Store the Gmail historyId returned with each successful list/get batch and use users.history.list for the next incremental sync.',
  fallback: 'If Gmail expires the historyId, run a bounded full resync for recent mail, dedupe by immutable Gmail message id, then store the newest historyId.',
  localOnly: 'Persist cursors and message content in the encrypted local database; never send message bodies through a Kept app server.',
};

export function createGmailOAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
  requireField('clientId', clientId);
  requireField('redirectUri', redirectUri);
  requireField('state', state);
  requireField('codeChallenge', codeChallenge);

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', gmailMinimalScopes.join(' '));
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

export function gmailMessageToThread(message, accountId) {
  return {
    id: message.threadId || message.id,
    accountId,
    subject: message.subject || '(no subject)',
    sender: message.from || 'unknown sender',
    recipients: message.to ? [message.to] : [],
    body: message.textBody || message.snippet || '',
    receivedAt: message.receivedAt || new Date(0).toISOString(),
    providerMessageId: message.id,
    historyId: message.historyId,
  };
}

export function redactForLogs(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(redactStructuredValue(value));
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[secret-redacted]')
    .replace(/1\/\/[A-Za-z0-9._-]+/g, '[secret-redacted]')
    .replace(/(access_token|refresh_token|id_token|client_secret|authorization_code|code_verifier)":"[^"]+"/gi, '$1":"[secret-redacted]"');
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
      if (/body|raw|payload|snippet/i.test(key)) return [key, '[body-redacted]'];
      if (/token|secret|codeVerifier|code_verifier|authorization_code/i.test(key)) return [key, '[secret-redacted]'];
      return [key, redactStructuredValue(nested)];
    }),
  );
}

function requireField(name, value) {
  if (!value) throw new Error(`${name} is required`);
}
