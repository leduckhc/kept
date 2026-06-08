# Kept — Feature List

Complete inventory of shipped features as of v0.1.0.

---

## Email Management

| Feature | Description |
|---------|-------------|
| **Gmail sync** | Full bidirectional sync via Gmail API (OAuth 2.0). Fetches INBOX, SENT, DRAFT, STARRED, TRASH in parallel. |
| **Archive** | Remove from inbox without deleting. Keyboard: `e` |
| **Trash** | Move to trash. Keyboard: `#` or `Backspace` |
| **Star/Unstar** | Toggle star. Keyboard: `s` |
| **Mark read/unread** | Toggle read state. Keyboard: `u` (unread) |
| **Block sender** | Block a sender (applies Gmail block) |
| **Report spam** | Report as spam via Gmail API |
| **Move to label** | Assign Gmail labels to threads |
| **Mute thread** | Mute thread (no future notifications) |

## Compose & Drafts

| Feature | Description |
|---------|-------------|
| **New message** | Compose new emails with To, CC, BCC fields. Keyboard: `c` |
| **Reply / Reply All** | Reply to the last message in a thread. Keyboard: `r` |
| **Forward** | Forward with `Fwd:` prefix. Keyboard: `f` |
| **Draft auto-save** | Drafts save automatically to Gmail as you type |
| **Undo send** | 5-second delay with undo toast after hitting Send |
| **Scheduled send** | Pick a date/time to send later (stored in localStorage, dispatched when app is open) |
| **Attachments** | View, download, and send file attachments |

## Snooze & Reminders

| Feature | Description |
|---------|-------------|
| **Snooze** | Temporarily hide a thread and resurface it at a chosen time |
| **Snooze presets** | In 3 hours, Tomorrow 9am, Saturday 9am, Monday 9am |
| **Custom snooze** | Pick any date/time via datetime picker |
| **Follow-up reminders** | "Remind if no reply" — set a timer, get reminded if no one responds |
| **Auto-cancel** | Reminders auto-dismiss when a reply arrives |
| **Reminders view** | Dedicated sidebar view showing all active reminders |

## Views & Navigation

| Feature | Description |
|---------|-------------|
| **Inbox** | Default view — all unarchived, unsnoozed threads |
| **Sent** | Emails you've sent |
| **Drafts** | Unsent draft compositions |
| **Starred** | All starred threads |
| **Snoozed** | Threads sleeping until their wake time |
| **Scheduled** | Emails queued for future send |
| **Reminders** | Threads with active follow-up reminders |
| **Trash** | Deleted threads |
| **Archive** | All archived threads |
| **Set Aside** | Quick-access shelf for "not now but not archive" |
| **Triage** | One-by-one inbox-zero workflow (card-based) |

## Keyboard Shortcuts

| Feature | Description |
|---------|-------------|
| **Gmail-style navigation** | j/k to move, Enter/o to open, Escape to close/back |
| **g-prefix views** | `gi` inbox, `gs` starred, `gt` trash, `gd` drafts, `ge` sent, `gn` snoozed, `ga` archive, `gb` set aside |
| **Actions** | `e` archive, `#` trash, `s` star, `u` unread, `c` compose, `r` reply, `f` forward |
| **Bulk select** | Click avatar or `x` to toggle selection, bulk actions on selection |
| **Search** | `/` focuses the search input |
| **Undo** | `Cmd+Z` / `Ctrl+Z` |
| **Sync** | `Cmd+R` / `Ctrl+R` forces a manual sync |

## UI & Layout

| Feature | Description |
|---------|-------------|
| **3-pane desktop** | Sidebar + thread list + reader pane (≥1024px) |
| **2-pane tablet** | Thread list with fullscreen reader overlay (601–1023px) |
| **Stacked phone** | Single column with stacked thread rows (≤600px) |
| **Unified Bar** | Context-aware top bar with 4 modes: Inbox, Reader, Folder, Bulk |
| **Dark mode** | System-aware dark theme with CSS custom properties |
| **Icon-only sidebar** | 48px slim sidebar with Inbox, Starred, Sent, Drafts, Trash, etc. |
| **Sender avatars** | Generated avatars with photo resolution via Google People API |
| **Category grouping** | Threads grouped by Updates, Newsletters, sender domain |

## Smart Features

| Feature | Description |
|---------|-------------|
| **Auto Labels** | Rule-based auto-labeling: define conditions (from/subject/to/has:attachment) and auto-apply labels on sync |
| **Smart Notifications** | Only notify for emails from known senders (people you've replied to). New/unknown senders are silent. |
| **VIP Senders** | Mark senders as VIP — their emails surface at top |
| **Grouped Senders** | Group threads by sender or domain for batch processing |

## Multi-Account

| Feature | Description |
|---------|-------------|
| **Multiple Gmail accounts** | Add and switch between accounts |
| **Unified inbox** | See all accounts' threads in one stream |
| **Per-account filter** | Filter to a single account in unified mode |
| **Account color coding** | Visual distinction between accounts |

## Security & Privacy

| Feature | Description |
|---------|-------------|
| **Local-first storage** | All data in local SQLite — nothing in the cloud |
| **OS keychain** | Tokens stored in macOS Keychain / Windows Credential Manager / Linux Secret Service |
| **No telemetry** | Zero tracking, zero analytics, zero phone-home |
| **HTML sanitization** | DOMPurify sanitizes all rendered email HTML |
| **pnpm-only** | Enforced package manager with security policies |

---

## Planned (Not Yet Shipped)

See [BACKLOG.md](../../BACKLOG.md) for the full roadmap. Highlights:

- AI thread summaries (local Ollama)
- Background send daemon (launchd/systemd)
- Priority Senders
- Smart Folders (saved search)
- Multi-Window (detachable reader & composer)
- Calendar integration
- Read receipts
- Gatekeeper (sender screening)
