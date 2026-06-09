# KPT-092: Background Send — Micro-Sidecar Architecture

## Problem
Scheduled send only fires when app is open. User schedules "send Monday 9am", closes laptop → email never goes out. Trust-breaking failure.

## Solution: Micro-Sidecar + Catch-Up on Open

Two-part approach:
1. **`kept-dispatch`** — tiny Rust CLI binary, runs via OS scheduler every 5 min. Fires due sends.
2. **Catch-up on open** — app startup scans for past-due snooze/reminders, surfaces immediately.

### Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Kept (Tauri)   │         │  kept-dispatch    │
│                 │         │  (Rust CLI)       │
│  Schedule send  │────────▶│                   │
│  (writes to DB) │  SQLite │  Reads due jobs   │
│                 │◀────────│  Fires Gmail API  │
│  On open:       │         │  Marks complete   │
│  catch-up all   │         └──────────────────┘
│  snooze/remind  │                ▲
└─────────────────┘                │
                            OS scheduler (5 min)
```

### Shared Workspace

```
crates/
  kept-core/       ← DB access, Gmail API, OAuth token read, job types
  kept-app/        ← Tauri commands (imports kept-core)
  kept-dispatch/   ← CLI binary (imports kept-core)
```

## Phase 1: Jobs Table + Frontend Integration (TypeScript)

### 1.1 DB Migration — `scheduled_jobs` table

```sql
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  job_type TEXT NOT NULL,       -- 'send' | 'snooze_wake' | 'reminder_fire'
  payload TEXT NOT NULL,        -- JSON: { draft_id, thread_id, subject, to, ... }
  fire_at INTEGER NOT NULL,     -- unix timestamp (seconds)
  status TEXT DEFAULT 'pending', -- 'pending' | 'fired' | 'failed' | 'cancelled'
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_jobs_fire_at ON scheduled_jobs(fire_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jobs_status ON scheduled_jobs(status, job_type);
```

### 1.2 Domain — `src/scheduledJobs.ts`

Types + pure logic:
- `ScheduledJob` type
- `JobType = 'send' | 'snooze_wake' | 'reminder_fire'`
- `SendPayload`, `SnoozePayload`, `ReminderPayload`
- `isDue(job, now)` — pure function
- `getNextRetryDelay(attempts)` — exponential backoff (30s, 2min, 10min)

### 1.3 Repository — `src/scheduledJobsDb.ts`

- `createJob(input): Promise<ScheduledJob>`
- `getDueJobs(now): Promise<ScheduledJob[]>` — pending + fire_at <= now
- `markFired(id): Promise<void>`
- `markFailed(id, error): Promise<void>`
- `cancelJob(id): Promise<void>`
- `getJobsByThread(threadId): Promise<ScheduledJob[]>`

### 1.4 Service — `src/solid/scheduledJobActions.ts`

- `scheduleSend(draftId, sendAt, accountId)` — creates job + shows toast
- `cancelScheduledSend(jobId)` — cancels + shows toast
- `catchUpOnOpen()` — processes past-due snooze/reminder jobs on app start

### 1.5 Refactor Existing Scheduled Send

Current: localStorage-based, only fires when app is open.
New: writes to `scheduled_jobs` table instead. Remove localStorage path.

### 1.6 Catch-Up on App Open

In `sync.ts` `refreshAll()`:
1. Query `getDueJobs(Date.now())`
2. For `snooze_wake`: unsnooze the thread (already exists)
3. For `reminder_fire`: surface the reminder (already exists)
4. For `send`: fire immediately via Gmail API, mark complete
5. Mark all processed

## Phase 2: Rust Sidecar — `kept-dispatch`

### 2.1 Workspace Setup

Convert to Cargo workspace:
```toml
# Cargo.toml (workspace root)
[workspace]
members = ["src-tauri", "crates/kept-core", "crates/kept-dispatch"]
```

### 2.2 `kept-core` Crate

Shared between Tauri app and dispatch CLI:
- SQLite access (read `scheduled_jobs` table)
- Gmail API send (OAuth token from OS keychain)
- Job processing logic (mark fired/failed, retry)

### 2.3 `kept-dispatch` Binary

```rust
fn main() {
    let db = open_db(app_data_path());
    let due_jobs = get_due_send_jobs(&db, now());
    for job in due_jobs {
        match send_email(&job) {
            Ok(_) => mark_fired(&db, &job.id),
            Err(e) => mark_failed(&db, &job.id, &e, job.attempts),
        }
    }
}
```

- Reads OAuth token from keychain (same path as Tauri app)
- Only processes `job_type = 'send'` (snooze/reminder = app-only)
- Exits after processing. Not a daemon.

### 2.4 OS Integration

**macOS:** LaunchAgent plist (~/Library/LaunchAgents/com.kept.dispatch.plist)
**Linux:** systemd user timer (~/.config/systemd/user/kept-dispatch.timer)
**Windows:** Task Scheduler XML

Installer creates these on first run. Kept Settings UI shows enable/disable toggle.

## Phase 3: Testing Strategy

### Unit Tests (Vitest)
- `scheduledJobs.ts` — `isDue()`, `getNextRetryDelay()`, payload validation
- `scheduledJobsDb.ts` — CRUD with mocked DB
- `scheduledJobActions.ts` — integration (mock DB + store)
- Catch-up logic — processes past-due correctly

### E2E Tests (Playwright)
- Schedule a send → verify job in DB
- Cancel scheduled send → verify job cancelled
- Catch-up on open → verify past-due snooze wakes thread

### Rust Tests (cargo test)
- `kept-core` — job query, send dispatch, retry logic
- `kept-dispatch` — integration test with test DB

## Acceptance Criteria

1. User schedules send → job persists in SQLite (not localStorage)
2. App open at fire time → email sends, toast confirms
3. App closed at fire time → `kept-dispatch` sends within 5 minutes
4. Failed send → retries 3x with exponential backoff
5. Snooze past-due → surfaces on next app open
6. Reminder past-due → surfaces on next app open
7. Settings toggle to enable/disable background dispatch
8. No battery drain (process runs <1s every 5 min, not a daemon)

## Build Order

1. Domain types + unit tests (TDD)
2. Repository + unit tests (TDD)
3. Service + refactor existing scheduled send
4. Catch-up on open integration
5. E2E tests
6. Rust workspace setup + kept-core
7. kept-dispatch binary + cargo tests
8. OS installer integration
9. Settings UI toggle
10. Full QA loop
