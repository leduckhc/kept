# Views & Navigation

Kept organizes your email into views accessible from the sidebar and keyboard shortcuts.

## Available views

| View | Sidebar icon | Shortcut | What it shows |
|------|-------------|----------|---------------|
| **Inbox** | Inbox | `gi` | Unarchived, unsnoozed, untrashed threads |
| **Starred** | Star | `gs` | All starred threads across accounts |
| **Sent** | Send | `ge` | Emails you've sent |
| **Drafts** | File | `gd` | Unsent draft compositions |
| **Snoozed** | Clock | `gn` | Threads hidden until their wake time |
| **Scheduled** | Calendar | — | Emails queued for future send |
| **Reminders** | Bell | — | Threads with active follow-up reminders |
| **Trash** | Trash | `gt` | Deleted threads (recoverable) |
| **Archive** | Archive | `ga` | All archived threads |
| **Set Aside** | Bookmark | `gb` | Quick-access shelf for later |
| **Triage** | Cards | — | Card-based one-at-a-time inbox-zero workflow |

## Unified Bar modes

The top bar adapts based on context. There are 4 modes:

### Inbox mode (default)
```
[☰ hamburger] [Account filter] [Search pill] ... [Context actions] [✏️ Compose]
```
- Search and Compose are **only visible in Inbox mode**
- Their absence signals you've navigated into a sub-context

### Reader mode
```
[← Inbox] [Subject line (truncated)] ... [⭐] [📥] [📌] [⋯ overflow]
```
- Triggered when a thread is selected (2-pane or phone layout)
- Back button returns to thread list

### Folder mode
```
[← Inbox] [🟣 Folder name + count] ... [☑ Select all] [📥 Archive] [✓ Read]
```
- Triggered when a category, sender, or domain filter is active
- Shows the filter context and bulk actions for that group

### Bulk mode
```
[✕ Cancel] ["N selected"] ... [📥] [🗑] [✓] [✉] [⭐]
```
- Triggered when 1+ threads are selected via avatar click or `x` key
- Shows actions that apply to groups

## Mode priority

When multiple conditions are true, this priority determines which mode shows:
1. `selectedIds.length > 0` → **Bulk**
2. `selectedThreadId` + 2-pane layout → **Reader**
3. Any filter active → **Folder**
4. Otherwise → **Inbox**

## Sidebar

The sidebar is a 48px icon-only column on the left (desktop only):

- Always visible on desktop (≥1024px)
- Hidden on tablet/phone (revealed via hamburger)
- Contains: Inbox, Starred, Sent, Drafts, Snoozed, Trash, Archive, Set Aside icons
- Unread badge on Inbox icon
- Active view is highlighted

## Category grouping

In Inbox view, threads can be grouped by category:
- **Updates** — automated notifications (GitHub, social media, etc.)
- **Newsletters** — subscription content detected via List-Unsubscribe header
- **Primary** — everything else

Click a category header to enter Folder mode filtered to that category.

## Sender/Domain grouping

- Click a sender pill on a grouped thread to filter by that sender
- Click a domain badge to filter by domain (e.g., all @github.com emails)
- These filters activate Folder mode with appropriate context

## Thread list display

Each thread row shows:
- Sender avatar (left)
- Sender name (bold if unread)
- Subject line
- Preview snippet
- Date/time (right-aligned)
- Unread dot indicator
- Star indicator
- Attachment paperclip (if has attachments)

### Density
Kept uses **cramped density** by default — power-user-oriented, maximum information per screen. Thread rows are 32px on desktop, 40px minimum on phone.

## Search

Available only in Inbox mode:
- Click the search pill or press `/`
- Type to filter threads in real-time (local SQLite FTS)
- Matches against subject, sender name, sender email, and snippet
- Press Escape to clear search
