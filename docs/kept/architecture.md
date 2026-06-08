# Architecture Overview

How Kept is built under the hood.

## Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Desktop shell** | Tauri v2 (Rust) | Window management, OS APIs, native plugins |
| **Frontend** | SolidJS + TypeScript | Reactive UI, state management |
| **Build** | Vite 8 + vite-plugin-solid | Dev server, HMR, production builds |
| **Database** | SQLite (via @tauri-apps/plugin-sql) | Local email cache, thread storage |
| **Auth** | OAuth 2.0 + OS Keychain | Secure token storage (tauri-plugin-keyring) |
| **Email API** | Gmail REST API (via Tauri HTTP plugin) | Sync, send, label management |
| **Notifications** | @tauri-apps/plugin-notification | OS-native notifications |
| **Tests** | Vitest + SolidJS Testing Library | Unit and component tests |
| **E2E** | Playwright | End-to-end testing |
| **Package manager** | pnpm 11 (enforced) | Dependency management with security policies |

## Directory structure

```
kept/
├── src/
│   ├── solid/           # SolidJS components and reactive logic
│   │   ├── App.tsx      # Root component
│   │   ├── store.ts     # Global reactive store (single source of truth)
│   │   ├── sync.ts      # Sync orchestration
│   │   ├── keyboard.ts  # Keyboard shortcut handler
│   │   ├── actions.ts   # Action handlers (archive, trash, star, etc.)
│   │   ├── viewActions.ts # View-aware action descriptors
│   │   ├── UnifiedBar.tsx
│   │   ├── ThreadList.tsx
│   │   ├── ThreadReader.tsx
│   │   ├── Compose.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Settings.tsx
│   │   └── TriageView.tsx
│   ├── providers/       # Email provider implementations
│   │   └── gmail.ts     # GmailProvider class
│   ├── provider.ts      # MailProvider interface
│   ├── store.ts         # Data access layer (SQLite queries)
│   ├── db.ts            # Database schema + migrations
│   ├── auth.ts          # Account management
│   ├── gmail.ts         # Gmail API helpers
│   ├── snooze.ts        # Snooze UI logic
│   ├── scheduledSend.ts # Scheduled send queue
│   ├── followupReminders.ts # Follow-up reminder system
│   ├── autoLabels.ts    # Rule-based auto-labeling
│   ├── notifications.ts # OS notification helpers
│   ├── icons.ts         # SVG icon library
│   ├── styles.css       # Global styles + CSS custom properties
│   └── index.tsx        # Entry point
├── src-tauri/           # Rust backend
│   ├── src/main.rs      # Tauri app setup
│   ├── src/lib.rs       # Custom Tauri commands
│   ├── Cargo.toml       # Rust dependencies
│   └── tauri.conf.json  # Tauri configuration
├── tests/               # Vitest test suite
├── docs/                # Documentation
├── DESIGN.md            # Living design spec
├── BACKLOG.md           # Feature roadmap
└── SECURITY.md          # Security policies
```

## Key architectural decisions

### Local-first (DB is cache only)

SQLite is a **cache** — the email provider (Gmail) is the source of truth.

- On sync: fetch from Gmail → write to SQLite → render from SQLite
- On action (archive, star, etc.): call Gmail API → update SQLite cache
- If the cache is corrupted or deleted: re-sync from Gmail, no data lost
- Starred/deleted/archived states are read from Gmail, not stored independently

### Provider abstraction

The `MailProvider` interface (`src/provider.ts`) abstracts all email operations:

```typescript
interface MailProvider {
  sync(account, onProgress?): Promise<SyncResult>
  send(account, opts): Promise<void>
  archive(account, thread): Promise<void>
  trash(account, thread): Promise<void>
  markRead(account, thread): Promise<void>
  // ... etc
}
```

Currently only `GmailProvider` is implemented. The architecture supports adding IMAP, Outlook, etc. without changing UI code.

### Reactive store (SolidJS)

All UI state lives in a single SolidJS store (`src/solid/store.ts`):

- Fine-grained reactivity — only components reading changed properties re-render
- No prop drilling — components import from store directly
- Derived state via `createMemo` (filteredThreads, unreadCount, unifiedBarMode)

### View-aware actions

Actions are data-driven (Strategy pattern). Each view returns an array of `ActionDescriptor` objects that define:
- Which actions are available
- Their keyboard shortcuts
- Whether they exit the reader after execution

This means the keyboard handler doesn't need view-specific logic — it queries the current view's action set.

### Security model

- OAuth tokens in OS keychain (never in localStorage or files)
- HTML email rendered in sandboxed webview with DOMPurify sanitization
- pnpm-only with enforced security policies (minimumReleaseAge, controlled allowBuilds)
- No network calls except Gmail API — no telemetry, no analytics

## Data flow

```
Gmail API → syncInbox() → SQLite cache → loadThreads() → SolidJS store → UI components
                                                                              ↓
User action → action handler → Gmail API call → SQLite update → store update → UI re-renders
```

## Build and test

```bash
pnpm install --config.trust-policy=accept   # Install deps
pnpm dev                                     # Vite dev server (web preview)
pnpm tauri dev                               # Full Tauri app with Rust backend
pnpm test                                    # Vitest unit tests
pnpm check                                   # TypeScript + ESLint + tests + build
pnpm test:e2e                                # Playwright E2E tests
```
