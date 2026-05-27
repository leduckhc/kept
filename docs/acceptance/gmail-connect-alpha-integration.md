# Gmail Connect Alpha integration acceptance

Date: 2026-05-27T13:39:43Z
Owner: Bob
Worktree: /home/le/kept
Branch: main

## Integrated commits

- 4760ab6 feat: add Gmail sync foundation
- d0a0ff7 feat: wire Gmail connect inbox UI
- 834abfb design: polish Gmail connect alpha states

## Verification

- `git diff --check origin/main..main` passed.
- `npm run verify` passed:
  - typecheck passed.
  - lint passed.
  - 34/34 node tests passed.
  - desktop static shell build passed.
  - Tauri scaffold check passed.

## Browser smoke

Preview server: `PORT=5180 npm run dev` from `/home/le/kept`.

Observed states:

1. Fresh local state loaded Kept with no sample inbox: title `Inbox`, count `No local mail connected`, visible `Connect Gmail` CTA, and mbox fallback.
2. Clicking `Connect Gmail` in the browser-only build moved to a safe auth-error state: `Gmail did not connect yet.` with `Gmail desktop bridge is not available in this build.` No token or OAuth code appeared.
3. Seeded a local Gmail sync state in browser localStorage to simulate a completed readonly sync result, then reloaded the page to mimic quit/reopen.
4. Reopened inbox showed `Gmail connected · 1 local message`, `1 message · 1 unread`, and the row `Smoke synced Gmail row` from `Mara Vale`.
5. Search over local synced mail returned the Gmail row for `Smoke` and the empty local search state for `notfound`.
6. Browser console had 0 console messages and 0 JavaScript errors after smoke.

## Redaction check

- Unit test `redaction removes message bodies, snippets, and OAuth secrets from logs` passed.
- Unit test `local JSON mail store persists synced Gmail state and reloads without plaintext bodies or tokens` passed.
- Browser smoke console showed no token, OAuth code, body, or snippet leakage.

## Acceptance call

Gmail Connect Alpha is accepted for merge to `main` as an alpha slice. It has the mail-core OAuth/sync contract, local UI persistence path, empty/auth/sync/connected/error UI states, local Gmail-cache-first inbox rendering, search over synced local mail, mbox fallback retained, and redaction coverage. Full production OAuth bridge credentials/wiring remain a later hardening task, but the alpha integration is safe and shippable to `main`.
