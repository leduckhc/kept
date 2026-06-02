# Scheduled Send Dispatch

## Problem
`scheduledSend.ts` has a localStorage queue with create/cancel/getDue, and `threadList.ts` renders a "Scheduled" view with cancel buttons. But **nothing polls `getDueEmails()` to actually send them**. The compose panel also has no "Schedule Send" button — `scheduleEmail()` is exported but never called.

## Scope
Wire scheduled send end-to-end: picker in compose → queue → dispatch timer → sent confirmation.

---

## Tasks

### 1. Schedule Send picker in compose footer (~25 min)
**File:** `src/compose.ts`

- Add a dropdown/chevron button next to "Send" → "Schedule Send"
- On click: show a small date/time picker (reuse snooze picker pattern: presets + custom datetime)
  - Presets: "Tomorrow morning (9am)", "Tomorrow afternoon (2pm)", "Monday morning (9am)"
  - Custom: `<input type="datetime-local">`
- On confirm: call `scheduleEmail()` with the payload (same shape as current send), close panel, show toast "Scheduled for {time}"
- Include `cc` and `attachments` in `ScheduledEmail` interface (currently missing)

**Acceptance:** Compose has a working schedule-send option that writes to localStorage queue.

---

### 2. Extend ScheduledEmail interface (~5 min)
**File:** `src/scheduledSend.ts`

- Add `cc?: string` and `attachments?: Array<{ filename: string; mimeType: string; data: string }>` (base64 since localStorage is string-only)
- Keep backward compat (optional fields)

**Acceptance:** Interface matches SendOptions shape (minus binary → base64 for storage).

---

### 3. Dispatch timer (~15 min)
**File:** `src/scheduledSend.ts` (new export) + `src/main.ts`

- New `startScheduledSendDispatch(getAccount: () => Account | null)` function:
  - `setInterval` every 30 seconds (same pattern as snooze resurface)
  - Calls `getDueEmails()`, for each due item:
    - Get account, call `sendEmail(account, payload)` (convert base64 attachments back to Uint8Array)
    - On success: `removeScheduled(id)`, show toast "Scheduled email to {to} sent"
    - On failure: leave in queue, show toast with error (will retry next tick)
  - Also fires on window focus (Tauri `onFocusChanged`) for immediate catch-up after sleep/lid-close
- Call `startScheduledSendDispatch()` in `main.ts` bootstrap, alongside snooze resurface setup

**Acceptance:** Due emails auto-send within 30s of their scheduled time when app is open.

---

### 4. Scheduled view: show sending state (~10 min)
**File:** `src/threadList.ts`

- While dispatching, mark items as "Sending…" in the scheduled view
- After send, remove from list and refresh view
- Already has cancel button — no change needed

**Acceptance:** User sees items disappear from Scheduled view once sent.

---

### 5. Edge cases & polish (~10 min)

- **App was closed past scheduled time:** On app launch, dispatch runs immediately (30s interval catches it fast). Toast says "Sent (was scheduled for {time})".
- **No network:** `sendEmail` throws → item stays in queue → retries next interval. No infinite retry toast spam — only toast on first failure per item, then silent retries.
- **Undo scheduled:** Already works (cancel button in Scheduled view).
- **Edit scheduled:** V2 (nice-to-have, not in this scope). User can cancel + re-compose.

---

## Out of Scope
- Rust-side background daemon for sends when app is closed (requires Tauri plugin work, low ROI for daily-driver)
- Rich text (HTML) in scheduled sends (follows rich-text-send feature)
- Editing a scheduled email in-place (cancel + recompose is fine for V1)

## Estimate
~65 minutes total implementation.

## Definition of Done
- `pnpm run typecheck` clean
- `pnpm run test` all passing
- `pnpm run lint` clean
- Committed and pushed to main
- Manual verification: schedule an email → see it in Scheduled view → wait for time → confirm it sends
