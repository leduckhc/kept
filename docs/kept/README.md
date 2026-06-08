# Kept Documentation

> User guides, feature reference, and how-tos for Kept — the local-first, BYO-AI email client.

## What is Kept?

Kept is a desktop email client built with Tauri (Rust + SolidJS). It stores all data locally in SQLite, connects to Gmail via OAuth, and gives you Superhuman-level keyboard shortcuts and triage workflows without a $30/month subscription.

**Core principles:**

- **Local-first** — your email data lives on your machine, not in someone's cloud
- **Privacy** — no email routing through third-party servers
- **Speed** — Rust backend + SQLite = instant search and startup
- **Keyboard-driven** — Gmail-style shortcuts for everything
- **BYO-AI** — (coming soon) plug in your own local LLM for summaries and smart replies

## Documentation Index

### Getting Started

| Doc | Description |
|-----|-------------|
| [Getting Started](getting-started.md) | Install, authenticate, and send your first email |

### Features

| Doc | Description |
|-----|-------------|
| [Feature List](features.md) | Complete list of current features |
| [Keyboard Shortcuts](keyboard-shortcuts.md) | All keyboard shortcuts and navigation |
| [Snooze & Scheduled Send](snooze-and-scheduled-send.md) | Defer emails and schedule sends |
| [Follow-up Reminders](follow-up-reminders.md) | Get reminded when someone doesn't reply |
| [Auto Labels](auto-labels.md) | Rule-based automatic email labeling |
| [Smart Notifications](smart-notifications.md) | Only get notified about emails from people you know |
| [Compose & Drafts](compose.md) | Writing, replying, and draft management |
| [Views & Navigation](views-and-navigation.md) | Inbox, Sent, Drafts, Starred, Trash, Archive, and more |

### How-To Guides

| Doc | Description |
|-----|-------------|
| [How to Triage Your Inbox](howto-triage.md) | Reach inbox zero with keyboard-driven triage |
| [How to Use Multiple Accounts](howto-multi-account.md) | Add accounts and use unified inbox |
| [How to Create Auto-Label Rules](howto-auto-labels.md) | Set up automatic email categorization |

### Architecture

| Doc | Description |
|-----|-------------|
| [Architecture Overview](architecture.md) | How Kept is built: Tauri, SolidJS, SQLite, providers |
| [Provider Architecture](../PROVIDER_ARCHITECTURE.md) | Email provider abstraction layer |

---

*Last updated: 2026-06-08*
