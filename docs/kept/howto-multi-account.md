# How to Use Multiple Accounts

Add multiple Gmail accounts and manage them from a single window.

## Adding accounts

1. Open **Settings** (gear icon in sidebar)
2. Click **Add Account**
3. Complete Google OAuth sign-in for the new account
4. The account appears in your account list immediately
5. Sync begins for the new account

You can add as many Gmail accounts as you want.

## Switching between accounts

### Account filter
In the Unified Bar (Inbox mode), click the account filter dropdown:
- Select a specific account to see only its threads
- Select "All Accounts" for unified view

### Sidebar indicators
Each account can be color-coded to visually distinguish which emails belong to which account.

## Unified Inbox

By default, Kept shows a **unified inbox** — all accounts' threads merged into one chronological stream.

### How it works
- Threads from all accounts appear together, sorted by most recent
- Each thread shows a subtle account indicator (color dot or label)
- Actions (archive, trash, star) route to the correct account automatically
- Search spans all accounts simultaneously

### Filtering to one account
Click the account name in the filter bar to see only that account's emails. Click "All" to return to unified view.

## Composing from multiple accounts

When composing a new email:
- The "From" field defaults to your last-used account
- You can switch the sending account before hitting Send
- Replies automatically use the account that received the original email

## Per-account behavior

Each account maintains independent:
- Sync state (own lastHistoryId)
- Drafts
- Stars and labels
- Sender groups and VIP lists

Shared across accounts:
- Auto-label rules (rules apply to all accounts)
- Known senders list (built from all accounts' reply history)
- Snooze and scheduled send queues

## Removing an account

1. Open **Settings** → **Accounts**
2. Click **Remove** next to the account
3. Confirm — this removes the local cache, OAuth tokens, and all synced data for that account
4. Your email remains untouched in Gmail — only the local cache is deleted
