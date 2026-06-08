# Thread Actions (Per-Message)

## Overview

Per-message Reply / Reply All / Forward actions using Variant C ("Apple Mail Clean") design — always-visible muted text links below each expanded message. No footer buttons.

## Design (Variant C)

- **Always visible** — no hover required, mobile-friendly
- **Muted gray text links** with left-arrow icon, turn blue on hover
- **Spacing**: 16px gap between links, 8px top padding
- **Font**: 12px, `var(--text-muted)` → `var(--primary)` on hover

## Behaviors

### Reply
- Opens inline compose card below the message
- **To**: message sender (`msg.from`)
- **Exception**: if sender is current user (own sent message), targets `msg.to` instead
- **Subject**: prepends "Re:" if not already present

### Reply All
- Opens inline compose card
- **To**: all recipients minus self (via `buildReplyAllRecipients`)
- **Cc**: preserved from original

### Forward
- Opens **floating compose panel** (not inline) — user needs to pick new recipient
- **To**: empty
- **Subject**: prepends "Fwd:"
- Original message body included

### Quote Reply
- Select text in any expanded message body → popup appears ("Reply with quote")
- Click opens inline compose with quoted text:
  ```
  On May 30, 2025 8:06 PM, David Park wrote:
  > quoted text here
  ```
- Attribution line + `>` prefix per line

## Inline Compose Card

- Rounded card with subtle shadow
- Fields: label (Reply/Reply All), To, Subject (Re:), textarea body
- **Close** (✕) dismisses without sending
- **Send** button (blue pill, bottom-right)
- Switching actions (e.g. Reply → Reply All) updates label + recipients in-place

## Collapsed vs Expanded Messages

- Only the **last message** auto-expands on thread open
- Collapsed messages show one-line preview — no action links
- Click collapsed header to expand → action links appear
- All expanded messages get their own action links

## Files

| File | Role |
|------|------|
| `src/solid/ThreadReader.tsx` | Handlers, inline compose, quote popup |
| `src/solid/store.ts` | `openCompose()` / `closeCompose()` state |
| `src/styles.css` | `.msg-actions`, `.msg-action-btn`, `.inline-compose`, `.quote-popup` |
| `tests/threadActions.test.ts` | Unit tests (12 cases) |
| `e2e-tests/thread-actions.spec.ts` | Playwright tier-2 tests |
