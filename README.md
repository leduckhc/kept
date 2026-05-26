# Kept

**Email, kept local.**

Kept is a modern local-first email client for private multi-account search and AI triage.

## Promise

Search, triage, and summarize Gmail, Outlook, and IMAP locally. Bring your own AI key. $5/month. We never read your inbox.

## Locked product decisions

- Desktop shell: Tauri
- Frontend: React + TypeScript
- Local data: SQLite, encrypted at rest
- Search: SQLite FTS5 first
- Connectors: Gmail API, Microsoft Graph, IMAP
- AI: BYO provider abstraction, no inference markup
- Pricing: $5/month or $49/year
- Trust model: open-core
- Mascot: Pip the Keeper Owl

## MVP wedge

Multi-account local search + AI-ready triage.

The hero workflow:

> “Show important emails I haven’t replied to that mention invoices, contracts, or next week.”

Kept returns ranked threads, source account, short summary, suggested action, optional AI draft, and a clear privacy status.

## Task board

See [`KANBAN.md`](./KANBAN.md).
