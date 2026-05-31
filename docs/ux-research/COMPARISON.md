# UX Comparison: Superhuman vs Spark vs Kept (Current)

## Executive Summary

Both Superhuman and Spark converge on the same core UX truth: **email power users want keyboard-first, command-palette-driven, zero-inbox workflows**. The differences are in philosophy: Superhuman is opinionated/minimal (one way to do things, very fast), Spark is flexible/feature-rich (multiple inbox modes, team collaboration).

For Kept, we take: **Superhuman's speed + minimalism + command palette**, combined with **Spark's smart categorization + quick replies + Set Aside concept**.

---

## Feature-by-Feature Comparison

### 1. Command Palette / Command Center
| | Superhuman | Spark | Kept (Current) | Kept (Target) |
|---|---|---|---|---|
| Trigger | ⌘+K | ⌘+K | ❌ None | ⌘+K / Ctrl+K |
| Search + Actions unified | ✅ | ✅ | ❌ Separate search bar | ✅ Unified |
| Fuzzy matching | ✅ | ✅ | ❌ | ✅ |
| Recent actions | ✅ | ❌ | ❌ | ✅ |
| Contextual (acts on hovered email) | ✅ | ✅ | ❌ | ✅ |

**Decision:** Copy Superhuman's Cmd+K exactly. This is THE signature interaction.

### 2. Keyboard Navigation
| | Superhuman | Spark | Kept (Current) | Kept (Target) |
|---|---|---|---|---|
| j/k navigate | ✅ | ✅ | ✅ | ✅ |
| e archive | ✅ | ✅ (varies) | ❌ (only button/swipe) | ✅ |
| r reply | ✅ | ✅ | ✅ | ✅ |
| # trash | ✅ | ❌ | ❌ | ✅ |
| x select | ✅ | ❌ | ❌ | ✅ |
| ? shortcut overlay | ✅ | ❌ | ❌ | ✅ |
| g+letter go-to | ✅ (g i = inbox) | ❌ | ❌ | ✅ |
| Tab between splits/views | ✅ | ❌ | ❌ | ✅ Tab between views |
| n/p prev/next in thread | ✅ | ❌ | ❌ | ✅ |
| Space/Shift+Space scroll | ✅ | ❌ | ❌ | ✅ |

**Decision:** Adopt Superhuman's full shortcut vocabulary. It's the industry standard for power email.

### 3. Inbox Organization
| | Superhuman | Spark | Kept (Current) | Kept (Target) |
|---|---|---|---|---|
| Split inbox | ✅ (custom filters) | ✅ (Smart categories) | Sections (New/Today/Yesterday) | Keep sections + add Focus mode |
| Smart categories | ❌ | ✅ (People/Notifications/Newsletters) | ❌ | Optional P2 |
| Gatekeeper (new senders) | ❌ | ✅ (accept/block) | ✅ (KPT-014) | ✅ Already have |
| Inbox Zero mechanics | ✅ (core philosophy) | ✅ (Mark as Done) | ✅ (archive = done) | ✅ |
| Focus mode | ❌ (splits serve this) | ✅ (Priority view) | ❌ | ✅ (filter to known senders) |

**Decision:** Keep Kept's temporal sections (they're intuitive). Add Focus mode (P1). Don't add Split Inbox complexity.

### 4. Quick Actions
| | Superhuman | Spark | Kept (Current) | Kept (Target) |
|---|---|---|---|---|
| Quick replies | ❌ | ✅ (2-tap short replies) | ❌ | ✅ Quick reply chips |
| Set Aside | ❌ | ✅ (⌘G bubble) | ❌ | Consider as "Pin" evolution |
| Snippets | ✅ (⌘+;) | ❌ | ❌ | P2 |
| Undo all actions | ✅ (Z, 5s) | ✅ (5s) | ✅ (KPT-034, 5s) | ✅ Already have |
| Swipe gestures | ❌ (desktop) | ✅ | ✅ (KPT-033) | ✅ Already have |
| Instant send | ✅ (⌘+Shift+Z) | ❌ | ❌ | P2 |

**Decision:** Add quick reply chips (Spark-inspired). Snippets are P2.

### 5. Compose & Send
| | Superhuman | Spark | Kept (Current) | Kept (Target) |
|---|---|---|---|---|
| Compose shortcut | C | C | ❌ (button only?) | C |
| Send later | ✅ (⌘+Shift+L) | ✅ | ❌ | ✅ KPT-047 |
| Follow-up reminders | ✅ (built-in) | ✅ | ❌ | ✅ KPT-048 |
| Undo send timer | ✅ (configurable) | ✅ (configurable) | ❌ | ✅ |
| Send & archive | ✅ (⌘+Shift+Enter) | ❌ | ❌ | ✅ |

**Decision:** Adopt Send Later + Follow-up reminders. Send & Archive is free.

### 6. Visual Design & Density
| | Superhuman | Spark | Kept (Current) |
|---|---|---|---|
| Row height | ~36px tight | ~48px comfortable | ~44px |
| Typography | SF Pro, mono weight hierarchy | System font, colorful | System font, lavender accent |
| Avatars | None (initials only) | ✅ Full avatars | ✅ Gravatar (KPT-039) |
| Color usage | Monochrome + 1 accent | Multi-color categories | White + lavender |
| Unread indicator | Bold weight + blue dot | Bold weight | Bold weight + dot |
| Animation | Minimal, <100ms | Spring physics | CSS transitions |

**Decision:** Tighten to 36px rows. Keep avatar (users like it). Strengthen bold/normal weight contrast.

---

## Priority Implementation Order (Final)

### P0 — Ship immediately (transforms the experience)
1. **KPT-043: Command Palette (⌘+K)** — THE feature that makes an email app feel "premium"
2. **KPT-049: Visual Density Refresh** — 36px rows, weight hierarchy, tighter spacing
3. **KPT-044: Full Keyboard Navigation** — complete the shortcuts to Superhuman parity

### P1 — Ship next (high-value additions)
4. **KPT-045: Shortcut Overlay (?)** — teaches users the shortcuts exist
5. **KPT-046: Quick Reply Chips** — Spark-inspired 2-tap replies
6. **KPT-050: Focus Mode** — filter to priority/known senders
7. **KPT-047: Scheduled Send** — expected by power users
8. **KPT-048: Follow-up Reminders** — "remind if no reply"

### P2 — Later (nice polish)
9. Snippets (saved text blocks with ⌘+;)
10. Send & Archive combo action
11. Contact sidebar (recent history with sender)
12. Undo Send configurable timer

---

## What Kept Already Has (No Work Needed)
- ✅ Swipe gestures (KPT-033)
- ✅ Undo toast (KPT-034)
- ✅ New sender gatekeeper (KPT-014)
- ✅ Thread mute (KPT-040)
- ✅ Bulk select (KPT-041)
- ✅ Full-page reader (KPT-032)
- ✅ Star toggle (KPT-029)
- ✅ Snooze (KPT-026)
- ✅ Quick reply from row (KPT-036)
- ✅ Gravatar avatars (KPT-039)
- ✅ Smart notifications (KPT-038)
- ✅ Multi-account (KPT-027)
- ✅ FTS5 search (KPT-021)

Kept is already 60-70% of the way to Superhuman/Spark feature parity. The gaps are: command palette, keyboard completeness, visual density, and send scheduling.
