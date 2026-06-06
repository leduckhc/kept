# Provider Abstraction Refactoring Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Decouple Kept's codebase from Gmail so that M365/Outlook (and any future provider) can be added next sprint without touching consumer code.

**Architecture:** Extract a `MailProvider` interface (Strategy pattern) with dependency injection. Split `gmail.ts` (1635 lines) into three layers: (1) provider-agnostic local store, (2) provider interface, (3) Gmail implementation. Auth layer gets the same treatment.

**Tech Stack:** TypeScript, Vitest, Tauri v2, SQLite, pnpm

**SOLID Principles Applied:**
- **S** (Single Responsibility) — One file = one concern. No more mixing API transport with SQLite queries.
- **O** (Open/Closed) — New providers added by implementing the interface, not modifying existing code.
- **L** (Liskov Substitution) — Any `MailProvider` implementation swappable without consumers knowing.
- **I** (Interface Segregation) — Separate interfaces for sync, send, actions (archive/trash/star), and auth.
- **D** (Dependency Inversion) — Consumers depend on interfaces, not concrete Gmail classes.

---

## Phase 1: Extract Provider-Agnostic Local Store

The first step: 50%+ of `gmail.ts` is pure SQLite queries with zero Gmail API involvement. Extract these unchanged.

### Task 1: Create `src/store.ts` — local DB query layer

**Objective:** Move all functions that only touch SQLite (no HTTP calls) into `src/store.ts`.

**Files:**
- Create: `src/store.ts`
- Modify: `src/gmail.ts` (remove moved functions, re-export from store)

**Functions to extract (no Gmail API dependency):**
- `loadThreads` (line 328)
- `loadThreadsUnified` (line 433)
- `getAllVipSenders` (line 470)
- `getAllGroupedSenders` (line 477)
- `getAllGroupedDomains` (line 484)
- `searchThreadsUnified` (line 491)
- `loadSenderEmails` (line 543)
- `loadRepliedToSenders` (line 553)
- `loadAllSenderEmails` (line 563)
- `loadSnoozedThreads` (line 572)
- `loadStarredThreads` (line 582)
- `loadSetAsideThreads` (line 803)
- `snoozeThread` (line 776) — SQLite only
- `unsnoozeThread` (line 784) — SQLite only
- `setAsideThread` (line 793) — SQLite only
- `unsetAsideThread` (line 798) — SQLite only
- `unmuteThread` (line 819) — SQLite only
- `hasSyncedBefore` (line 1456)
- `getGroupedSenders` / `addGroupedSender` / `removeGroupedSender`
- `getGroupedDomains` / `addGroupedDomain` / `removeGroupedDomain`
- `getVipSenders` / `addVipSender` / `removeVipSender`
- `groupBySection` (line 1283) — pure logic
- `invalidateSectionCache` (line 1278)
- `getSetting` / `setSetting` (line 54/63) — generic helpers

**Also extract (type only):**
- `Thread` interface (line 30)

**Step 1: Write failing tests** — `tests/store.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSelect = vi.fn();
const mockExecute = vi.fn();

vi.mock('../src/db', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  }),
}));

import { loadThreads, loadThreadsUnified, groupBySection, type Thread } from '../src/store';

describe('store - loadThreads', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns threads from DB for given account + label', async () => {
    const fakeThread = { id: '1', subject: 'Hello', snippet: '', senderName: 'A', senderEmail: 'a@b.com', receivedAt: 1000, isUnread: 1, isArchived: 0, isStarred: 0, hasAttachment: 0, gmailThreadId: 'gt1', snoozedUntil: null, snoozeLabel: null, messageCount: 1, label: 'INBOX', accountId: 'acc1', isMuted: 0, isSetAside: 0, category: 'personal', userLabels: '' };
    mockSelect.mockResolvedValueOnce([fakeThread]);
    const result = await loadThreads('acc1', 'INBOX');
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('Hello');
  });

  it('returns empty array when no threads match', async () => {
    mockSelect.mockResolvedValueOnce([]);
    const result = await loadThreads('acc1', 'INBOX');
    expect(result).toEqual([]);
  });
});

describe('store - groupBySection', () => {
  it('groups threads into VIP, grouped senders, and other', () => {
    const threads: Thread[] = [
      { id: '1', subject: 'VIP', snippet: '', senderName: 'Boss', senderEmail: 'boss@co.com', receivedAt: 2000, isUnread: true, isArchived: false, isStarred: false, hasAttachment: false, gmailThreadId: 'g1', snoozedUntil: null, snoozeLabel: null, messageCount: 1, label: 'INBOX', accountId: 'a', isMuted: false, isSetAside: false, category: 'personal', userLabels: '' },
      { id: '2', subject: 'Newsletter', snippet: '', senderName: 'News', senderEmail: 'news@letter.com', receivedAt: 1000, isUnread: true, isArchived: false, isStarred: false, hasAttachment: false, gmailThreadId: 'g2', snoozedUntil: null, snoozeLabel: null, messageCount: 1, label: 'INBOX', accountId: 'a', isMuted: false, isSetAside: false, category: 'newsletters', userLabels: '' },
    ];
    const sections = groupBySection(threads, [], [], ['boss@co.com']);
    expect(sections[0].label).toBe('VIP');
    expect(sections[0].threads).toHaveLength(1);
  });
});
```

**Step 2:** Run `pnpm vitest run tests/store.test.ts` — verify FAIL (module not found).

**Step 3:** Extract functions from `gmail.ts` → `src/store.ts`. Keep `gmail.ts` re-exports for backward compat:
```typescript
// gmail.ts — add at top after extraction
export { Thread, loadThreads, loadThreadsUnified, ... } from './store';
```

**Step 4:** Run `pnpm vitest run tests/store.test.ts` — verify PASS.

**Step 5:** Run `pnpm vitest run` — verify all 104 existing tests still pass.

**Step 6:** Commit: `refactor: extract provider-agnostic store from gmail.ts`

---

### Task 2: Create `src/provider.ts` — MailProvider interface

**Objective:** Define the interface contract that all providers must implement.

**Files:**
- Create: `src/provider.ts`

**Step 1: Write failing test** — `tests/provider.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import type { MailProvider, SyncResult, SendOptions, MessageBody } from '../src/provider';

describe('MailProvider interface', () => {
  it('can be implemented by a mock provider', () => {
    const mock: MailProvider = {
      id: 'mock',
      displayName: 'Mock Provider',

      sync: async () => ({ threads: [], historyId: '1' }),
      syncIncremental: async () => ({ threads: [], historyId: '2' }),

      send: async () => {},
      reply: async () => {},
      createDraft: async () => 'draft-1',
      updateDraft: async () => {},
      deleteDraft: async () => {},
      fetchDraftByThread: async () => null,

      archive: async () => {},
      unarchive: async () => {},
      trash: async () => {},
      untrash: async () => {},
      markRead: async () => {},
      markUnread: async () => {},
      toggleStar: async () => true,
      blockSender: async () => {},
      reportSpam: async () => {},
      moveToLabel: async () => {},
      fetchLabels: async () => [],
      mute: async () => {},

      fetchMessageBody: async () => ({ messages: [] }),
      loadAttachments: async () => [],
      downloadAttachment: async () => new Uint8Array(),
      loadSenderPhotos: async () => ({}),
    };

    expect(mock.id).toBe('mock');
    expect(typeof mock.sync).toBe('function');
    expect(typeof mock.send).toBe('function');
  });
});
```

**Step 2:** Run `pnpm vitest run tests/provider.test.ts` — verify FAIL.

**Step 3:** Create `src/provider.ts`:

```typescript
import type { Account } from './auth';
import type { Thread } from './store';

export interface SyncResult {
  threads: Array<{
    id: string;
    subject: string;
    snippet: string;
    senderName: string;
    senderEmail: string;
    receivedAt: number;
    isUnread: boolean;
    hasAttachment: boolean;
    providerThreadId: string;
    messageCount: number;
    label: string;
  }>;
  historyId: string | null;
}

export interface SendOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface MessageBody {
  messages: Array<{
    from: string;
    to: string;
    cc: string;
    body: string;
    htmlBody: string | null;
    sanitizedHtml: string | null;
    receivedAt: number;
    messageId: string;
  }>;
}

export interface AttachmentMeta {
  id: string;
  message_id: string;
  thread_id: string;
  account_id: string;
  filename: string;
  mime_type: string;
  size: number;
  attachment_id: string;
}

export interface MailProvider {
  id: string;          // 'gmail' | 'outlook' | 'm365'
  displayName: string; // 'Gmail' | 'Outlook' | 'Microsoft 365'

  // Sync
  sync(account: Account, onProgress?: (n: number) => void): Promise<SyncResult>;
  syncIncremental(account: Account, historyId: string, onProgress?: (n: number) => void): Promise<SyncResult | null>;

  // Compose
  send(account: Account, opts: SendOptions): Promise<void>;
  reply(account: Account, opts: SendOptions): Promise<void>;
  createDraft(account: Account, opts: SendOptions): Promise<string>;
  updateDraft(account: Account, draftId: string, opts: SendOptions): Promise<void>;
  deleteDraft(account: Account, draftId: string): Promise<void>;
  fetchDraftByThread(account: Account, threadId: string): Promise<{ draftId: string; to: string; cc: string; bcc: string; subject: string; body: string } | null>;

  // Thread actions
  archive(account: Account, thread: Thread): Promise<void>;
  unarchive(account: Account, thread: Thread): Promise<void>;
  trash(account: Account, thread: Thread): Promise<void>;
  untrash(account: Account, thread: Thread): Promise<void>;
  markRead(account: Account, thread: Thread): Promise<void>;
  markUnread(account: Account, thread: Thread): Promise<void>;
  toggleStar(account: Account, thread: Thread): Promise<boolean>;
  blockSender(account: Account, thread: Thread): Promise<void>;
  reportSpam(account: Account, threadId: string): Promise<void>;
  moveToLabel(account: Account, threadId: string, labelId: string, removeFromInbox?: boolean): Promise<void>;
  fetchLabels(account: Account): Promise<Array<{ id: string; name: string }>>;
  mute(account: Account, thread: Thread): Promise<void>;

  // Message content
  fetchMessageBody(account: Account, threadId: string): Promise<MessageBody>;
  loadAttachments(account: Account, threadId: string): Promise<AttachmentMeta[]>;
  downloadAttachment(account: Account, messageId: string, attachmentId: string): Promise<Uint8Array>;

  // Contact/photo resolution
  loadSenderPhotos(account: Account, emails: string[]): Promise<Record<string, string>>;
}
```

**Step 4:** Run `pnpm vitest run tests/provider.test.ts` — verify PASS.

**Step 5:** Commit: `feat: add MailProvider interface (provider abstraction)`

---

### Task 3: Create `src/providerRegistry.ts` — DI container

**Objective:** Registry + factory that returns the correct provider for an account. Dependency Inversion via injection.

**Files:**
- Create: `src/providerRegistry.ts`
- Create: `tests/providerRegistry.test.ts`

**Step 1: Write failing test:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { registerProvider, getProviderForAccount, resetRegistry } from '../src/providerRegistry';
import type { MailProvider } from '../src/provider';

describe('providerRegistry', () => {
  beforeEach(() => resetRegistry());

  it('registers and retrieves a provider', () => {
    const mockProvider = { id: 'gmail', displayName: 'Gmail' } as MailProvider;
    registerProvider('gmail', mockProvider);
    const result = getProviderForAccount({ id: '1', email: 'x@gmail.com', provider: 'gmail' } as any);
    expect(result.id).toBe('gmail');
  });

  it('throws when provider not registered', () => {
    expect(() => getProviderForAccount({ id: '1', email: 'x@outlook.com', provider: 'outlook' } as any))
      .toThrow(/no provider registered/i);
  });

  it('can register multiple providers', () => {
    const gmail = { id: 'gmail', displayName: 'Gmail' } as MailProvider;
    const outlook = { id: 'outlook', displayName: 'Outlook' } as MailProvider;
    registerProvider('gmail', gmail);
    registerProvider('outlook', outlook);
    expect(getProviderForAccount({ provider: 'gmail' } as any).id).toBe('gmail');
    expect(getProviderForAccount({ provider: 'outlook' } as any).id).toBe('outlook');
  });
});
```

**Step 2:** Verify FAIL.

**Step 3:** Implement `src/providerRegistry.ts`:

```typescript
import type { MailProvider } from './provider';

const _providers: Map<string, MailProvider> = new Map();

export function registerProvider(id: string, provider: MailProvider): void {
  _providers.set(id, provider);
}

export function getProviderForAccount(account: { provider?: string }): MailProvider {
  const providerId = account.provider ?? 'gmail';
  const provider = _providers.get(providerId);
  if (!provider) throw new Error(`No provider registered for "${providerId}"`);
  return provider;
}

export function resetRegistry(): void {
  _providers.clear();
}
```

**Step 4:** Verify PASS + full suite green.

**Step 5:** Commit: `feat: add provider registry with DI lookup`

---

### Task 4: Add `provider` field to Account interface

**Objective:** Each account knows which provider it uses. Default to 'gmail' for existing accounts.

**Files:**
- Modify: `src/auth.ts` — add `provider: string` to Account interface and AccountRow
- Modify: `src/db.ts` — migration adds `provider` column to accounts table (default 'gmail')
- Create: `tests/accountProvider.test.ts`

**Step 1: Write failing test:**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockExecute = vi.fn();
const mockSelect = vi.fn();
vi.mock('../src/db', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  }),
}));
vi.mock('../src/keychain', () => ({
  saveTokensToKeychain: vi.fn().mockResolvedValue(undefined),
  getTokensFromKeychain: vi.fn().mockResolvedValue(null),
  deleteTokensFromKeychain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@fabianlars/tauri-plugin-oauth', () => ({ start: vi.fn(), cancel: vi.fn() }));
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import type { Account } from '../src/auth';

describe('Account.provider field', () => {
  it('Account interface has provider field', () => {
    const account: Account = {
      id: '1', email: 'x@gmail.com', accessToken: 'tok',
      refreshToken: 'ref', tokenExpiry: 999, signature: '',
      colorIndex: 0, provider: 'gmail',
    };
    expect(account.provider).toBe('gmail');
  });

  it('defaults to gmail when provider column is null in DB', async () => {
    mockSelect.mockResolvedValueOnce([{
      id: '1', email: 'x@gmail.com', access_token: '', refresh_token: '',
      token_expiry: 0, signature: null, color_index: 0, provider: null,
    }]);
    const { getAllAccounts } = await import('../src/auth');
    const accounts = await getAllAccounts();
    expect(accounts[0].provider).toBe('gmail');
  });
});
```

**Step 2:** Verify FAIL.

**Step 3:** Add `provider` to Account interface:
```typescript
export interface Account {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  signature: string;
  colorIndex: number;
  provider: string;  // 'gmail' | 'outlook' | 'm365'
}
```

Update `rowToAccount` to set `provider: r.provider ?? 'gmail'`. Update `saveAccount` SQL to include provider column. Add migration in `db.ts`.

**Step 4:** Verify PASS + full suite green (existing tests updated where Account is constructed).

**Step 5:** Commit: `feat: add provider field to Account (default 'gmail')`

---

### Task 5: Implement `src/providers/gmail.ts` — GmailProvider class

**Objective:** Wrap all Gmail API calls from `gmail.ts` into a class implementing `MailProvider`.

**Files:**
- Create: `src/providers/gmail.ts`
- Create: `tests/providers/gmail.test.ts`

**Step 1: Write failing test** covering the most critical method — sync:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Account } from '../../src/auth';

// Mock fetch at module level
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../../src/db', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: vi.fn(),
    select: vi.fn().mockResolvedValue([]),
  }),
}));
vi.mock('../../src/auth', () => ({
  ensureFreshToken: vi.fn((a: Account) => Promise.resolve(a)),
}));

import { GmailProvider } from '../../src/providers/gmail';

describe('GmailProvider', () => {
  const account: Account = {
    id: 'acc1', email: 'test@gmail.com', accessToken: 'tok123',
    refreshToken: 'ref', tokenExpiry: Date.now() + 60000,
    signature: '', colorIndex: 0, provider: 'gmail',
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('implements MailProvider interface', () => {
    const provider = new GmailProvider();
    expect(provider.id).toBe('gmail');
    expect(provider.displayName).toBe('Gmail');
    expect(typeof provider.sync).toBe('function');
    expect(typeof provider.send).toBe('function');
    expect(typeof provider.archive).toBe('function');
  });

  it('sync calls Gmail threads.list API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ threads: [], resultSizeEstimate: 0 }),
    });
    // Profile call for historyId
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ historyId: '12345' }),
    });

    const provider = new GmailProvider();
    const result = await provider.sync(account);
    expect(result.historyId).toBe('12345');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('gmail.googleapis.com'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok123' }) })
    );
  });
});
```

**Step 2:** Verify FAIL.

**Step 3:** Create `src/providers/gmail.ts` implementing `MailProvider`. Move Gmail API methods from `gmail.ts` into the class. Keep private helpers (fetchWithRetry, gmailGet, etc.) as private methods or module-level.

**Step 4:** Verify PASS.

**Step 5:** Run full suite — all 104+ tests green.

**Step 6:** Commit: `feat: implement GmailProvider class (MailProvider interface)`

---

### Task 6: Wire GmailProvider into registry at app boot

**Objective:** Register GmailProvider in main.ts so the rest of the app uses the provider registry.

**Files:**
- Modify: `src/main.ts` — import and register GmailProvider on boot
- Create: `tests/boot.test.ts`

**Step 1: Write failing test:**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/providers/gmail', () => ({
  GmailProvider: class { id = 'gmail'; displayName = 'Gmail'; },
}));

import { registerProvider, getProviderForAccount, resetRegistry } from '../src/providerRegistry';
import { GmailProvider } from '../src/providers/gmail';

describe('boot registration', () => {
  it('GmailProvider can be registered and looked up', () => {
    resetRegistry();
    registerProvider('gmail', new GmailProvider() as any);
    const p = getProviderForAccount({ provider: 'gmail' } as any);
    expect(p.id).toBe('gmail');
  });
});
```

**Step 2:** Verify FAIL → PASS after wiring.

**Step 3:** In `main.ts` boot path:
```typescript
import { GmailProvider } from './providers/gmail';
import { registerProvider } from './providerRegistry';
registerProvider('gmail', new GmailProvider());
```

**Step 4:** Run full suite green.

**Step 5:** Commit: `feat: register GmailProvider at boot`

---

### Task 7: Migrate consumers to use provider registry

**Objective:** Replace direct `gmail.ts` API-call imports with provider registry lookups in consumer files.

**Files:**
- Modify: `src/sync.ts` — use `getProviderForAccount(account).sync(account)` instead of `syncInbox(account)`
- Modify: `src/threadReader.ts` — use provider for `fetchMessageBody`, `sendEmail`, `markRead`, etc.
- Modify: `src/actions.ts` — use provider for thread actions
- Modify: `src/compose.ts` — use provider for `sendEmail`, `createDraft`, etc.
- Modify: `src/inlineReply.ts` — use provider for `sendEmail`
- Modify: `src/bulk.ts` — use provider for bulk operations

**Pattern:**
```typescript
// Before:
import { archiveThread } from './gmail';
await archiveThread(account, thread);

// After:
import { getProviderForAccount } from './providerRegistry';
const provider = getProviderForAccount(account);
await provider.archive(account, thread);
```

**Step 1: Write failing test** — tests that verify sync.ts uses the provider interface (update `tests/staggerSync.test.ts`):

```typescript
it('syncAccount calls provider.sync for the account', async () => {
  const mockSync = vi.fn().mockResolvedValue({ threads: [], historyId: '1' });
  registerProvider('gmail', { id: 'gmail', sync: mockSync } as any);
  // ... trigger sync for a gmail account
  expect(mockSync).toHaveBeenCalledWith(expect.objectContaining({ provider: 'gmail' }), expect.any(Function));
});
```

**Step 2-5:** Migrate each consumer file. Run full suite after each. Commit per logical group:
- `refactor: migrate sync.ts to provider registry`
- `refactor: migrate threadReader.ts to provider registry`
- `refactor: migrate actions.ts + compose.ts to provider registry`

---

### Task 8: Extract auth provider interface

**Objective:** Decouple OAuth flow from Google-specific implementation.

**Files:**
- Create: `src/authProvider.ts` — interface
- Create: `src/authProviders/google.ts` — current Google OAuth extracted
- Modify: `src/auth.ts` — delegates to auth provider

**Interface:**
```typescript
export interface AuthProvider {
  id: string;
  startOAuth(): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; profile: { id: string; email: string } }>;
  refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  revokeToken(token: string): Promise<void>;
}
```

**Step 1:** Write test that verifies Google auth provider implements the interface.

**Step 2-5:** Extract, verify, commit: `refactor: extract Google OAuth into AuthProvider implementation`

---

### Task 9: Remove `gmail.ts` re-exports — clean break

**Objective:** After all consumers migrated, remove the backward-compat re-exports from `gmail.ts`. The file should only contain Gmail-specific internal helpers used by `GmailProvider`.

**Files:**
- Modify: `src/gmail.ts` — remove all exports except internal helpers
- Update all remaining `import ... from './gmail'` to import from `./store` or `./providerRegistry`

**Step 1:** `grep -r "from './gmail'" src/` should return zero results (except provider impl).

**Step 2:** Run full suite green.

**Step 3:** Commit: `refactor: remove gmail.ts public API — consumers use store + provider`

---

### Task 10: Final cleanup — rename & document

**Objective:** Rename `src/gmail.ts` → `src/providers/gmail-internal.ts` (or inline into provider class). Add JSDoc on interfaces.

**Step 1:** Run full suite green.

**Step 2:** Commit: `refactor: final cleanup — gmail internals moved under providers/`

---

## Verification Checklist

After all tasks:
- [ ] `pnpm vitest run` — all tests pass (should be 130+ tests after new ones)
- [ ] `pnpm tsc --noEmit` — clean
- [ ] No file imports from `./gmail` except `src/providers/gmail.ts` internal use
- [ ] `Thread` type imported from `./store` everywhere
- [ ] Provider actions routed through `getProviderForAccount()`
- [ ] `Account.provider` field defaults to `'gmail'`
- [ ] Adding a new provider = (1) implement MailProvider, (2) implement AuthProvider, (3) register at boot

## Definition of Done

- Merged to `main`
- All tests green
- TypeScript clean
- No runtime regressions (dev server still works, sign-in + sync functional)
- `import ... from './gmail'` eliminated from consumer code
