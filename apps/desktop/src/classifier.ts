/**
 * classifyThread — client-side thread classification.
 * Returns 'newsletter' | 'update' | 'primary'.
 *
 * Rules (in priority order):
 *  1. List-Unsubscribe header present  -> newsletter
 *  2. List-Id or List-Post header present -> newsletter
 *  3. Sender domain in UPDATE_DOMAINS   -> update
 *  4. Otherwise                         -> primary
 *
 * Thread shape used:
 *   { senderEmail, headers }
 *   headers is an optional plain object of lowercased header names to values,
 *   e.g. { 'list-unsubscribe': '<mailto:...>', 'list-id': '...' }
 */

export type InboxSection = 'newsletter' | 'update' | 'primary';

export interface ClassifiableThread {
  senderEmail?: string;
  headers?: Record<string, string>;
}

const UPDATE_DOMAINS = new Set<string>([
  'github.com',
  'github.io',
  'stripe.com',
  'vercel.com',
  'linear.app',
  'notion.so',
  'figma.com',
  'slack.com',
  'jira.com',
  'atlassian.com',
  'trello.com',
  'zapier.com',
  'asana.com',
  'hubspot.com',
  'salesforce.com',
  'intercom.io',
  'zendesk.com',
  'sentry.io',
  'datadog.com',
  'pagerduty.com',
  'circleci.com',
  'travis-ci.com',
  'netlify.com',
  'heroku.com',
  'aws.amazon.com',
  'google.com',
  'accounts.google.com',
  'noreply.github.com',
  'notifications.github.com',
]);

/**
 * Extract the domain part from an email address string.
 * Handles "Name <email@domain>" format and bare addresses.
 */
function extractDomain(email: string): string {
  if (!email) return '';
  const str = String(email);
  // Handle "Display Name <addr@domain>" — extract just the address part
  const angleMatch = str.match(/<([^>]+)>/);
  const address = angleMatch ? angleMatch[1] : str;
  const atIndex = address.lastIndexOf('@');
  if (atIndex === -1) return '';
  return address.slice(atIndex + 1).toLowerCase().trim();
}

/**
 * Classify a thread into 'newsletter', 'update', or 'primary'.
 *
 * @param thread - Thread with optional senderEmail and headers
 * @returns The inbox section for this thread
 */
export function classifyThread(thread: ClassifiableThread): InboxSection {
  const headers = thread.headers || {};

  // List-Unsubscribe present -> newsletter
  if (headers['list-unsubscribe'] || headers['list-unsubscribe-post']) {
    return 'newsletter';
  }

  // List-Id or List-Post present -> newsletter
  if (headers['list-id'] || headers['list-post']) {
    return 'newsletter';
  }

  // Known update-sending domain -> update
  const domain = extractDomain(thread.senderEmail || '');
  if (domain && UPDATE_DOMAINS.has(domain)) {
    return 'update';
  }

  return 'primary';
}
