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
