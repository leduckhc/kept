# KPT — Collapsible Search Bar (Pill Expand)

Design direction: **Variant A — Pill Expand** (chosen by Milan)
Branch: `feat/kpt-collapsible-search-bar`

---

## Summary

Replace the always-visible full-width `.search-input` in the toolbar with an icon-only button that expands rightward into a pill-shaped input on click or ⌘F. When collapsed, search occupies only a 32×32px icon button — freeing toolbar space for other actions.

---

## Behaviour spec

### Collapsed state (default)
- 32×32px circle button with magnifying glass icon (use existing `icons.ts` search SVG)
- Positioned where `.toolbar-search-wrap` currently lives
- On hover: subtle lavender background `rgba(124,111,212,0.08)`
- Tooltip: "Search (⌘F)"

### Expand trigger
- Click the icon button
- Press ⌘F (already wired in `keyboard.ts` → calls `showSearchBar`)
- Press `/` when no input is focused (existing shortcut)

### Expanding animation (200ms ease-out)
- Icon button grows rightward from 32px to full available width (flex: 1, same as current `.toolbar-search-wrap`)
- Border-radius morphs from 50% (circle) to 20px (pill)
- Background fades from transparent to `var(--bg-secondary)` (existing token)
- Input text field appears with opacity fade (0→1, 100ms delay)
- Search icon slides to `left: 10px` inside the pill (same as current `.toolbar-search-icon` position)
- Close ✕ button fades in at the right end

### Expanded state
- Pill shape: `border-radius: 20px`, `height: 34px`
- Background: `var(--bg-secondary)`
- Border: `1px solid var(--border-muted)` → `var(--accent)` on focus
- Focus ring: `box-shadow: 0 0 0 2px rgba(124,111,212,0.15)` (same as current `.search-input:focus`)
- Placeholder: "Search emails…"
- Result count badge: right-aligned inside pill, same as current `#search-count`
- Close button: ✕ icon, right side of pill

### Collapse triggers
- Press Escape
- Click outside the search pill
- Click the ✕ button
- Clear query + blur (optional: keep expanded if user just unfocuses without typing)

### Collapse animation (150ms ease-in)
- Reverse of expand: width shrinks from full to 32px
- Border-radius morphs back to 50%
- Input text + close button fade out immediately
- Icon returns to centered position

---

## File changes

### `src/styles.css`

Remove or hide:
```css
/* Replace .toolbar-search-wrap, .toolbar-search-icon, .search-input styles */
```

Add new:
```css
/* ── Collapsible search pill ─────────────────────────────── */
.search-pill-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s;
  flex-shrink: 0;
  position: relative;
}
.search-pill-btn:hover {
  background: rgba(124,111,212,0.08);
}
.search-pill-btn svg {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
}

/* Expanded pill */
.search-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  border-radius: 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-muted);
  padding: 0 10px;
  overflow: hidden;
  animation: pill-expand 200ms ease-out forwards;
}
.search-pill:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(124,111,212,0.15);
}

.search-pill .search-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.search-pill input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
  min-width: 0;
  animation: pill-text-in 100ms 100ms ease-out both;
}
.search-pill input::placeholder {
  color: var(--text-muted);
}

.search-pill .search-count {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.search-pill .search-close {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  flex-shrink: 0;
  animation: pill-text-in 100ms 120ms ease-out both;
}
.search-pill .search-close:hover {
  background: rgba(0,0,0,0.06);
  color: var(--text-primary);
}

/* Collapse animation class */
.search-pill.collapsing {
  animation: pill-collapse 150ms ease-in forwards;
}

@keyframes pill-expand {
  from { width: 32px; border-radius: 50%; padding: 0; }
  to   { width: 100%; border-radius: 20px; padding: 0 10px; }
}
@keyframes pill-collapse {
  from { width: 100%; border-radius: 20px; padding: 0 10px; opacity: 1; }
  to   { width: 32px; border-radius: 50%; padding: 0; opacity: 0; }
}
@keyframes pill-text-in {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

### `src/search.ts`

Refactor `showSearchBar()`:
1. Instead of creating a full-width bar prepended to `#inbox`, replace the `.search-pill-btn` in the toolbar with the expanded `.search-pill` element
2. On dismiss, swap back to the icon button
3. Keep all existing filter logic (`getFilteredThreads`, result count, arrow-key navigation)
4. The `dismiss()` function should add `.collapsing` class, wait 150ms, then swap to icon

### `src/keyboard.ts`

No change needed — ⌘F already calls `showSearchBar(deps)`. Just ensure it still works after the refactor.

### `src/threadList.ts` / `src/main.ts`

Update the toolbar render to emit:
```html
<!-- Collapsed state -->
<button class="search-pill-btn" title="Search (⌘F)" aria-label="Search">
  <svg>…magnifying glass…</svg>
</button>
```

Instead of the current:
```html
<div class="toolbar-search-wrap">
  <span class="toolbar-search-icon">🔍</span>
  <input class="search-input" … />
</div>
```

---

## Design tokens used

All existing — no new palette additions:
- `--bg-secondary` — pill background
- `--border-muted` — pill border (inactive)
- `--accent` (#7c6fd4) — pill border (focus)
- `--text-primary` — input text
- `--text-secondary` — icon color
- `--text-muted` — placeholder, count, close button

---

## Acceptance criteria (John QA)

- [ ] Default state: only a 32px circle icon visible in toolbar, no text input
- [ ] Click icon → pill expands rightward with 200ms animation, input auto-focuses
- [ ] ⌘F → same expand behaviour
- [ ] `/` key (when no input focused) → same expand behaviour
- [ ] Typing filters the inbox list in real-time (existing behaviour preserved)
- [ ] Result count appears inside pill ("3 results")
- [ ] Escape → pill collapses back to icon (150ms)
- [ ] Click outside pill → collapses
- [ ] ✕ button inside pill → collapses
- [ ] After collapse, inbox shows full unfiltered list
- [ ] Arrow keys navigate results while pill is expanded
- [ ] Enter opens selected/first result
- [ ] Pill never overflows toolbar or pushes other buttons off-screen
- [ ] Animation is smooth at 60fps (no layout thrashing — use `width` via CSS animation on the container, not JS frame-by-frame)
- [ ] Mobile (<600px): pill expands to fill available toolbar space
- [ ] Accessible: button has `aria-label="Search"`, expanded input has `role="searchbox"`
