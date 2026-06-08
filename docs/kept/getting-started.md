# Getting Started with Kept

Get from zero to reading your first email in under 5 minutes.

## What you'll need

- **macOS 12+**, **Windows 10+**, or **Linux** (with WebKit2GTK)
- A **Gmail account** (other providers coming soon)
- **Rust** toolchain (for building from source)
- **pnpm 11+** (Kept enforces pnpm-only — npm/yarn will be rejected)
- **Node.js 18+**

## Step 1: Clone and install dependencies

```bash
git clone https://github.com/your-org/kept.git
cd kept
pnpm install --config.trust-policy=accept
```

The `--config.trust-policy=accept` flag is required because some Tauri build dependencies need to run install scripts.

## Step 2: Start the development build

```bash
pnpm tauri dev
```

This compiles the Rust backend and opens the app window. First build takes 2-3 minutes; subsequent launches are instant.

## Step 3: Sign in with Gmail

1. The app opens to a sign-in screen
2. Click **Sign in with Google**
3. Complete OAuth in the browser window that opens
4. Your access token is stored securely in the OS keychain (never in plain files)

## Step 4: Initial sync

Once authenticated, Kept syncs your Gmail inbox automatically:

- Fetches INBOX, SENT, DRAFT, STARRED, and TRASH labels in parallel
- Stores threads in local SQLite — future loads are instant
- Progress indicator shows sync status in the bottom-right status bar

## Step 5: Read and act on email

- **Click** a thread row to open it in the reader pane
- **j/k** to navigate up/down the thread list
- **Enter** to open the focused thread
- **e** to archive, **#** to trash, **s** to star
- **c** to compose a new email

## What you now have

A fully functional email client reading your Gmail, with all data stored locally on your machine. No subscription, no cloud dependency, no tracking.

## Next steps

- [Keyboard Shortcuts](keyboard-shortcuts.md) — learn the full shortcut set
- [How to Triage Your Inbox](howto-triage.md) — reach inbox zero fast
- [Features](features.md) — see everything Kept can do
