# Architecture: Service + Repository Pattern

Kept uses a **Service + Repository** layered architecture. Every new feature must follow this structure. Existing code is migrated to this pattern via strangler fig — refactor on touch, don't rewrite wholesale.

## Layers

```
src/
  domain/          ← Pure types + business rules
  repositories/    ← DB access (reads + writes)
  services/        ← Orchestration (repo + store coordination)
  solid/           ← UI components + reactive store
```

### 1. Domain (`src/domain/` or `src/<feature>.ts` for small features)

- **Pure functions and types.** Zero imports from DB, store, or UI.
- Contains: type definitions, validation, filter/match logic, business rules.
- Fully unit-testable with no mocks.

```ts
// src/smartFolders.ts — GOOD domain layer
export function matchesThread(thread: FilterableThread, folder: SmartFolder): boolean { ... }
```

### 2. Repository (`src/<feature>Db.ts` or `src/repositories/`)

- **SQL operations only.** Imports `getDb()` and domain types.
- Returns domain types (never raw SQL rows to callers).
- Maps between DB column naming (`snake_case`) and domain types (`camelCase`) internally.
- No business logic. No store updates.

```ts
// src/smartFolderDb.ts — GOOD repository layer
export async function createSmartFolder(input: SmartFolderInput): Promise<SmartFolder> { ... }
export async function getSmartFolders(accountId: string): Promise<SmartFolder[]> { ... }
```

### 3. Service (`src/solid/<feature>Actions.ts` or `src/services/`)

- **Orchestration.** Coordinates repository calls with store updates.
- Handles error cases, loading states, side effects.
- One service function per user intent.
- UI calls services — never repositories directly.

```ts
// src/solid/smartFolderActions.ts — GOOD service layer
export async function createSmartFolder(input: SmartFolderInput): Promise<void> {
  const folder = await dbCreate(input);  // repo
  storeAdd(folder);                      // store update
}
```

### 4. UI (`src/solid/`)

- **Render + user interaction only.**
- Imports from store (reactive state) and services (actions).
- Never imports from repositories or calls `getDb()`.
- Components are single-responsibility: one component, one job.

```ts
// src/solid/SmartFolderSidebar.tsx — GOOD UI layer
// Renders the list, calls createSmartFolder service on form submit
```

## Dependency Flow (one-way only)

```
UI → Services → Repositories → DB
↓         ↓
Store    Domain types
```

- UI depends on: store, services
- Services depend on: repositories, store, domain
- Repositories depend on: db.ts, domain types
- Domain depends on: nothing

**Never** go backwards: no repository importing from UI, no domain importing from store.

## Reactive Store (`src/solid/store.ts`)

- Single source of truth for UI state.
- Contains: state shape, derived memos (filteredThreads, etc.), mutation functions.
- Filter/transform logic in store memos should delegate to domain functions.
- Store mutations are thin setters — business logic lives in services.

## Testing Strategy

| Layer | Test type | Mocks needed |
|-------|-----------|--------------|
| Domain | Unit (vitest) | None — pure functions |
| Repository | Unit (vitest) | Mock `getDb()` |
| Service | Unit (vitest) | Mock repo + store |
| UI/Integration | E2E (Playwright) | Full app running |

Target: domain tests cover all business rules, E2E tests cover user journeys. Repository tests verify SQL correctness.

## File Naming Conventions

| Pattern | Example | Purpose |
|---------|---------|---------|
| `src/<feature>.ts` | `src/smartFolders.ts` | Domain logic |
| `src/<feature>Db.ts` | `src/smartFolderDb.ts` | Repository |
| `src/solid/<feature>Actions.ts` | `src/solid/smartFolderActions.ts` | Service |
| `src/solid/<Feature>.tsx` | `src/solid/SmartFolderSidebar.tsx` | UI component |
| `tests/<feature>.test.ts` | `tests/smartFolders.test.ts` | Unit tests |
| `e2e-tests/<feature>.spec.ts` | `e2e-tests/smart-folders.spec.ts` | E2E tests |

## Migration Rules

1. **New features:** Must follow this architecture from day one.
2. **Touching existing code:** Refactor the touched file into the correct layer.
3. **Don't rewrite untouched code** — strangler fig, not big bang.
4. **Reference implementation:** Smart Folders (KPT-090) is the canonical example.

## Anti-patterns (do NOT)

- ❌ DB queries inside UI components
- ❌ Business logic inside `store.ts` mutation functions
- ❌ Domain functions importing from `solid-js` or DB
- ❌ One file doing CRUD + filtering + rendering
- ❌ Services that return JSX or depend on UI framework
