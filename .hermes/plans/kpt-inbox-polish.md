# KPT Inbox Polish — Three-Feature Plan

## What & Why

Three issues reported after first real-mail session:

1. **Email rendering is wrong** — reader shows raw HTML tags (e.g. `<div>`, `<br>`) and garbled characters (bad charset decoding). Root cause: `extractTextBody` in `gmail.ts` falls back to `div.textContent` which strips HTML but can garble encoded chars. Also no multi-level MIME part traversal (nested `multipart/alternative` inside `multipart/mixed` silently returns empty).

2. **Mark-read doesn't reflect in inbox row** — opening a thread calls `markRead()` correctly but the in-memory `Thread` object still has `isUnread: true`. The row is not re-rendered after the read call, so the bold/dot persists until next full sync.

3. **Inbox row layout: Spark-like** — current row is text-only. Requested layout: avatar (favicon or initials fallback) + sender name bold if unread + subject + greyed snippet + time/date. Also: attachment icon if email has attachments.

## Scope

### In scope

**A. Fix mark-read visual update (KPT-A)**
- After `markRead()` succeeds in `openThread()`, mutate `t.isUnread = false` and remove `.unread` class from the row element in the DOM. No re-render needed, just a targeted DOM mutation.
- File: `src/main.ts`, `openThread()` function ~line 250

**B. Fix email body rendering (KPT-B)**
- `extractTextBody` in `gmail.ts`: recurse into nested `multipart/*` parts (walk all parts depth-first, prefer `text/plain`, fallback to `text/html` with proper entity decode)
- For HTML bodies: use `DOMParser` + strip scripts/styles, then `innerText` to get clean readable text. Replace `<br>` with newlines before stripping.
- Charset: Gmail API returns base64url-encoded parts; decode with `TextDecoder` where possible instead of `atob` to handle non-ASCII properly.
- File: `src/gmail.ts`, `extractTextBody()` function ~line 221

**C. Spark-style inbox row (KPT-C)**
- Avatar: 32x32 circle. Fetch `https://www.google.com/s2/favicons?domain=<sender_email_domain>&sz=32`. On error (404 or CORS), fall back to colored circle with initials (first letter of senderName or senderEmail).
- Row layout (single line, Spark-style):
  ```
  [avatar] [sender bold if unread]    [subject]  [· snippet greyed]   [📎 if attachment]  [time]
  ```
  Specifically:
  - Left: 32x32 avatar circle
  - Middle: sender (bold+black if unread, normal if read) | subject (normal weight) | snippet (grey, truncated)
  - Right: optional 📎 icon if thread has attachments, then time/date
- Mark attachment presence: add `hasAttachment: boolean` field to `Thread` type and populate it in `syncThread()` by checking if any message part has `filename` set.
- Time: show time (HH:MM) if today, date (MMM D) otherwise. Existing `formatDate` already does this.
- Files: `src/main.ts` `threadRow()`, `src/styles.css` `.thread-row`, `src/gmail.ts` `Thread` type + `syncThread()`

### Out of scope

- Full HTML email rendering with iframe sandboxing (deferred — security surface)
- Gravatar fetch (privacy concern — signals read state to Gravatar)
- Multi-account avatars
- Attachment download/preview

## Implementation Order

1. KPT-A (mark-read DOM update) — 15 min, zero risk, highest user-visible trust impact
2. KPT-B (body rendering fix) — 45 min, touches gmail.ts extraction logic only
3. KPT-C (Spark row) — 90 min, touches threadRow HTML + CSS + Thread type + syncThread

Each can be done sequentially on the same branch.

## Acceptance Criteria

- KPT-A: opening a thread removes the bold/unread-dot immediately without needing a sync
- KPT-B: real email bodies show readable text, no raw HTML tags, no garbled non-ASCII
- KPT-C: each row shows avatar circle, sender, subject, grey snippet, time; unread rows have bold sender; attachment icon shows on emails with attachments
- `npx tsc --noEmit` passes (no new errors)
- All changes merged to main

## Files Affected

- `src/main.ts` — `openThread()` (A), `threadRow()` (C)
- `src/gmail.ts` — `extractTextBody()` (B), `Thread` type + `syncThread()` (C attachment flag)
- `src/styles.css` — `.thread-row` and avatar styles (C)

## Branch

`feat/inbox-polish`
Worktree: `/home/le/kept.worktrees/inbox-polish`
