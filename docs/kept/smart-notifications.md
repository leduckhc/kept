# Smart Notifications

Kept only notifies you about emails from people you know — everything else stays silent.

## The problem

Most email clients notify you for every incoming message. The result: constant interruptions from newsletters, marketing, and automated emails you don't care about.

## How Smart Notifications work

Kept distinguishes between **known senders** and **unknown senders**:

- **Known senders** = people you've previously replied to, or manually accepted
- **Unknown senders** = everyone else (newsletters, cold outreach, automated systems)

**Only known senders trigger OS notifications.** Unknown senders arrive silently — you'll see them next time you open the app, but they won't interrupt your focus.

## How senders become "known"

1. **Auto-seeded on first sync** — all senders already in your mailbox are treated as known (baseline)
2. **Reply-based** — when you reply to someone, they're automatically added as a known sender
3. **Manual accept** — mark any sender as "accepted" from the thread reader

## VIP Senders

Take it a step further: mark senders as **VIP** to ensure their emails always surface at the top of your inbox, regardless of arrival time.

### Setting a VIP
- Open a thread → overflow menu (⋯) → "Mark as VIP"
- Or: right-click a sender in the thread list → "VIP"

### VIP behavior
- VIP threads appear above regular threads in Inbox
- VIP threads get notification priority even in Do Not Disturb
- VIP is per-sender, applies across all their threads

## Notification permissions

Kept uses native OS notifications via Tauri:

- **macOS**: requests Notification Center permission on first new-email event
- **Windows**: uses Windows Toast notifications
- **Linux**: uses system notification daemon (libnotify)

You can deny permission at the OS level to disable all notifications.

## What gets notified

When new email arrives during sync:
1. Filter to threads from known/VIP senders only
2. Show up to 5 notifications (prevents notification flood)
3. Each notification shows: sender name + subject line
4. Clicking a notification brings Kept to foreground (planned)

## Unread badge

The dock/taskbar badge updates on every sync to show total unread count (all senders, not just known). This lets you see at a glance whether there's unread mail without being interrupted.
