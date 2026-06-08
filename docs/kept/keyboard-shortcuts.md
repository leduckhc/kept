# Keyboard Shortcuts

Kept uses Gmail-style keyboard shortcuts. All shortcuts work when focus is NOT in a text input field.

## Navigation

| Key | Action |
|-----|--------|
| `j` / `↓` | Move focus down one thread |
| `k` / `↑` | Move focus up one thread |
| `Enter` / `o` | Open focused thread in reader |
| `Escape` | Close reader → clear filter → switch to Inbox → unfocus (in that priority order) |

## Actions on current thread

| Key | Action |
|-----|--------|
| `e` | Archive |
| `#` / `Backspace` | Trash |
| `s` | Toggle star |
| `u` | Mark unread |
| `x` | Toggle bulk selection on current thread |
| `r` | Reply |
| `f` | Forward |

## Compose

| Key | Action |
|-----|--------|
| `c` | New message |
| `r` | Reply to current thread |
| `f` | Forward current thread |

## Search

| Key | Action |
|-----|--------|
| `/` | Focus the search input |
| `Escape` | Clear search query (when search is focused) |

## View switching (g-prefix)

Press `g` then immediately press one of:

| Key | View |
|-----|------|
| `i` | Inbox |
| `s` | Starred |
| `t` | Trash |
| `d` | Drafts |
| `e` | Sent |
| `n` | Snoozed |
| `a` | Archive |
| `b` | Set Aside |

The `g` prefix has a 1-second timeout. If you don't press the second key within 1 second, the prefix is cancelled.

## Bulk mode

| Key | Action |
|-----|--------|
| Click avatar | Enter bulk selection mode |
| `x` | Toggle selection on focused thread |
| `e` (in bulk) | Archive all selected |
| `#` (in bulk) | Trash all selected |
| `Escape` | Cancel selection, exit bulk mode |

## System

| Key | Action |
|-----|--------|
| `Cmd+Z` / `Ctrl+Z` | Undo last action |
| `Cmd+R` / `Ctrl+R` | Force manual sync |

## Tips

- Keyboard navigation mode activates when you press j/k/arrows. Hover highlighting is suppressed while in keyboard mode.
- Moving the mouse re-enables hover mode.
- Shortcuts are view-aware: `e` (archive) only works in views where archiving makes sense (Inbox, Starred). In Trash view, different actions are available.
- Spacebar selects the focused thread when in keyboard navigation mode.
