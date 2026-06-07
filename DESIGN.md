# Kept — Design System

> Living design spec. All visual decisions go here.  
> Last updated: 2026-06-07

---

## 1. Identity

**Product:** Kept — a local-first, BYO-AI email client.  
**Voice:** Fast, quiet, professional. No whimsy, no gradients, no illustrations.  
**Reference:** Superhuman density × Spark structure × Mimestream restraint.

---

## 2. Color Tokens

### Light theme (default)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#ffffff` | Page/app background |
| `--surface` | `#f8f8f8` | Cards, panels, elevated regions |
| `--surface-hover` | `#f0f0f0` | Hovered rows/buttons |
| `--surface-active` | `#e8e8f4` | Active/pressed state |
| `--border` | `#e2e2e2` | Separators, input borders |
| `--text` | `#1a1a1a` | Primary body text |
| `--text-secondary` | `#666666` | Secondary labels, dates |
| `--text-muted` | `#888888` | Placeholders, hints |
| `--text-disabled` | `#bbbbbb` | Disabled state |
| `--accent` | `#2563eb` | Interactive: links, focus rings |
| `--accent-hover` | `#1d4ed8` | Hovered interactive |
| `--danger` | `#dc2626` | Destructive actions |
| `--lavender-tint` | `#f5f3ff` | Category highlight background |
| `--lavender-accent` | `#7c3aed` | Category/identity accent |
| `--lavender-text` | `#6d28d9` | Category text |
| `--lavender-border` | `#e9e5f5` | Category borders |

### Dark theme

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#1f2121` | Page background (cool neutral) |
| `--surface` | `#111111` | Panels |
| `--surface-hover` | `#2a2c2c` | Hovered rows |
| `--border` | `#1e1e1e` | Separators |
| `--text` | `#e8e8e8` | Body text |
| `--accent` | `#4a9eff` | Interactive (higher contrast) |
| `--lavender-accent` | `#7c6fd4` | Category accent |

### Semantic aliases

```css
--hover: rgba(0,0,0,0.04);          /* light */
--hover: rgba(255,255,255,0.05);    /* dark */
--danger-bg: rgba(220,38,38,0.08);  /* light */
--danger-bg: rgba(255,68,68,0.12);  /* dark */
--unread-dot: var(--accent);
```

---

## 3. Typography

| Role | Font | Size | Weight | Line-height |
|------|------|------|--------|-------------|
| Body | SF Pro Text / system-ui | 13px | 400 | 1.4 |
| Sender name | SF Pro Text | 13px | 500 (600 if unread) | 1.4 |
| Subject | SF Pro Text | 13px | 400 | 1.4 |
| Preview | SF Pro Text | 12px | 400 | 1.4 |
| Section header | SF Pro Text | 11px | 600 | 1.2 |
| Date | SF Pro Text | 11px | 400 | 1.2 |
| Unified bar subject | SF Pro Text | 15px | 600 | 1.2 |
| Folder name | SF Pro Text | 14px | 600 | 1.2 |
| Breadcrumb link | SF Pro Text | 14px | 500 | 1.2 |
| Bulk count | SF Pro Text | 14px | 600 | 1.2 |

**Font stack:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`

No display font. Single stack everywhere. Consistency over personality.

---

## 4. Spacing & Density

**Philosophy:** Cramped. Power-user density on all viewports. Information density > white space.

| Element | Value |
|---------|-------|
| Unified bar height | 48px (single line, all modes) |
| Thread row padding | 6px vertical, 12px horizontal |
| Thread row height | 32px (desktop grid), 40px min (phone stacked) |
| Section header padding | 8px 12px |
| Gap between zones (unified bar) | 10px |
| Icon button hit area | 28×28px (visual 16px icon) |
| Sidebar width | 48px (icon-only) |
| Reader top padding | 48px (tablet/phone, below fixed bar) |
| Phone reader 2-line bar | 48px actions + 28px subject = 76px total |

### Responsive overrides (phone ≤600px)

- Unified bar gap: 4px
- Unified bar padding: 0 8px
- Search pill width: 100px (expands to 200px max)
- Thread row grid: 4px / 40px / 1fr / auto

### Responsive overrides (tablet ≤1023px)

- Sidebar hidden
- Reader: fullscreen overlay with fixed unified bar (z-index: 60)
- Thread rows: 5-column grid with preview on row 2

---

## 5. Unified Bar — The Core UI Pattern

### Architecture

3-zone layout: **NAV** (auto) / **CONTEXT** (flex:1) / **ACTIONS** (auto)

```
┌────────────────────────────────────────────────────┐
│ [NAV]     [────── CONTEXT ──────]     [ACTIONS]    │
└────────────────────────────────────────────────────┘
```

### 4 Modes (Strategy Pattern)

| Mode | NAV | CONTEXT | ACTIONS | Trigger |
|------|-----|---------|---------|---------|
| **Inbox** | ☰ hamburger | Account filter + Search pill | Context actions + ✏️ Compose | Default state |
| **Reader** | ← Inbox (breadcrumb) | Subject line (truncated) | ⭐ 📥 📌 ⋯ (overflow) | Thread selected + 2-pane layout |
| **Folder** | ← Inbox (breadcrumb) | 🟣 Folder name + count | ☑ Select all, 📥 Archive, ✓ Read | Category/sender/domain filter active |
| **Bulk** | ✕ Cancel | "N selected" | 📥 🗑 ✓ ✉ ⭐ | selectedIds.length > 0 |

### Mode derivation priority

```
1. selectedIds.length > 0 → bulk
2. selectedThreadId + layoutMode === '2-pane' → reader
3. categoryFilter | senderFilter | domainFilter → folder
4. else → inbox
```

### Context-aware button visibility

- **Search + Compose**: inbox-ONLY. Their absence signals "you are in a sub-context."
- **Reader/Folder/Bulk**: no search, no compose. Breadcrumb or cancel is the only nav.
- This is intentional UX: fewer buttons = clearer context.

### Transitions

- **Direction-aware:** forward (inbox→folder→reader) slides content left; back slides right
- **Duration:** 150ms ease
- **Mechanism:** `data-direction="forward|back"`, `.unified-bar--transitioning` class
- **Crossfade:** opacity 0→1 + translateX(±4px)

---

## 6. Layout Modes

### Desktop (≥1024px) — 3-pane

```
┌──────┬──────────────────┬──────────────────────────┐
│      │ [Unified Bar]    │                          │
│ Side │ [Thread List]    │ [Reader Pane]            │
│ bar  │                  │                          │
│ 48px │                  │                          │
└──────┴──────────────────┴──────────────────────────┘
```

- Sidebar: icon-only, 48px wide
- Unified bar stays in inbox mode even when reader is open (3-pane shows both)
- Reader pane: resizable via drag handle

### Tablet (601–1023px) — stacked

- Sidebar hidden (hamburger reveals it)
- Inbox fills width
- Reader: fullscreen overlay, unified bar switches to reader mode (fixed top)

### Phone (≤600px) — stacked

- Same as tablet but:
  - Thread rows: 3-row stacked grid (sender / subject / preview)
  - Reader bar: 2-line (actions row + subject row)
  - Search pill: narrower (100px collapsed)

---

## 7. Interaction Patterns

### Thread selection
- **Click row:** open thread in reader
- **Click avatar:** toggle bulk selection (checkbox appears)
- **Keyboard j/k:** move highlight
- **Keyboard Enter/o:** open highlighted thread

### Unified bar back
- Reader mode: deselects thread, removes `reader-open` class, emits `unified-bar:reader-closed`
- Folder mode: clears all filters, emits `unified-bar:folder-back`

### Overflow menu
- Reader mode: "⋯" button toggles `.open` class on `.unified-bar-overflow`
- Click outside: closes
- Actions: mark-unread, spam, move-to-label, remind-if-no-reply

### Bulk mode
- Activated by avatar click (first selection)
- Cancel (✕): clears all selections
- Actions: archive, trash, mark-read, mark-unread, star

---

## 8. Motion

| Interaction | Duration | Easing | Property |
|-------------|----------|--------|----------|
| Mode crossfade | 150ms | ease | opacity, transform |
| Row hover | 100ms | ease | background |
| Search pill expand | 200ms | ease | width, box-shadow |
| Compose button reveal | 150ms | ease | opacity |
| Theme switch | 150ms | ease | background, color |
| Overflow menu | instant | — | display toggle |

No spring physics. No bounce. Minimal, functional transitions only.

---

## 9. Iconography

- **Source:** Custom SVG icon set (see `src/icons.ts`)
- **Default size:** 16px (inline actions), 18px (bar buttons)
- **Stroke:** 1.5px, round caps/joins
- **Color:** inherits `currentColor`
- **Hit area:** always 28×28px minimum (icon centered)

---

## 10. Scrollbar

```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-track { background: transparent; }
```

Thin, unobtrusive, matches border color.

---

## 11. Dark Mode

- Triggered by `[data-theme="dark"]` on root
- Token-based: all components use CSS custom properties, no hardcoded colors
- Cool neutrals (not warm gray): `#1f2121` bg, `#111111` surface
- Accent shifts warmer for contrast: `#4a9eff` (light blue vs. dark blue in light)
- Transitions on theme switch: 150ms for bg/color

---

## 12. Accessibility

- Focus rings: 2px solid `var(--accent)` with 2px offset
- Color contrast: all text meets WCAG AA (4.5:1 minimum)
- Interactive targets: 28px minimum (icon buttons), full-row for thread selection
- Keyboard: full navigation (j/k/Enter/Escape/Tab)
- Screen reader: semantic HTML (`<nav>`, `<button>`, `aria-label` on icon buttons)
- Reduced motion: respects `prefers-reduced-motion` (disables all transitions)

---

## 13. Component Inventory

| Component | File | Modes/States |
|-----------|------|--------------|
| UnifiedBar | `src/solid/UnifiedBar.tsx` | inbox, reader, folder, bulk |
| ThreadList | `src/solid/ThreadList.tsx` | inbox, filtered, grouped |
| ThreadReader | `src/solid/ThreadReader.tsx` | single, conversation |
| Sidebar | `src/solid/Sidebar.tsx` | expanded (desktop), hidden (mobile) |
| Compose | `src/solid/Compose.tsx` | floating panel, expandable fullscreen |
| Settings | `src/solid/Settings.tsx` | full-page overlay |
| Keyboard | `src/solid/Keyboard.tsx` | reactive shortcut handler |

---

## 14. Anti-patterns (Do NOT)

- ❌ No gradients, no shadows on cards (flat surfaces only)
- ❌ No rounded avatars larger than 32px
- ❌ No toast/notification stacking — one at a time
- ❌ No popup/dialog for email preview — always full-page reader
- ❌ No search/compose buttons outside inbox mode
- ❌ No feature flags in CSS — design is the code
- ❌ No skeleton loaders — instant render or nothing
- ❌ No custom scrollbars on mobile (system native)
- ❌ No hamburger menu on desktop (sidebar is always visible)
