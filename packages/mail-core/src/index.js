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

export function redactForLogs(value) {
  return String(value).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]');
}
