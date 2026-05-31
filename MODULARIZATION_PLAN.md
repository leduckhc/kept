# main.ts Modularization Plan

## Current State
- `src/main.ts`: 3400 lines, monolithic
- Already-extracted modules: `snippets.ts`, `followupReminders.ts`, `scheduledSend.ts`, `gmail.ts`, `auth.ts`, `accountContext.ts`, `sanitize.ts`, `notifications.ts`

## Target Modules

### 1. `src/state.ts` (~30 lines)
Shared mutable app state. Every module imports from here.
```ts
export let account, accounts, unifiedMode, threads, searchQuery, syncing
export let knownSenders, focusMode, activeInboxTab, currentView
export let selectedThreadId, bulkMode, selectedIds, gPending, gTimeout
export let currentInlineReply
// + setter functions for each
```

### 2. `src/keyboard.ts` (~350 lines)
Lines 778-1153: keyboard shortcuts registration, cheat sheet overlay
- `isInputFocused()`, `getVisibleThreadIds()`, `selectThread()`, `moveSelection()`
- `showCheatSheet()`, `openThreadWithReply()`, `registerKeyboardShortcuts()`
- `scrollReaderMessage()`
- Depends on: state, actions (doArchive etc.), views (renderInbox etc.)

### 3. `src/commandPalette.ts` (~280 lines)  
Lines 2864-3150: command palette
- `cmdRecentGet()`, `cmdRecentPush()`, `renderCommandPalette()`
- Depends on: state, views, compose

### 4. `src/compose.ts` (~250 lines)
Lines 2225-2527: compose new email, showToast, showUndoToast
- `showToast()`, `showUndoToast()`, `avatarColor()`, `openComposeNew()`
- Depends on: state, gmail

### 5. `src/threadReader.ts` (~300 lines)
Lines 2528-2831: thread reader
- `openThread()`
- Depends on: state, gmail, sanitize, compose (for reply)

### 6. `src/threadList.ts` (~400 lines)
Lines 1352-1766: inbox render, view renders, threadRow template, wireRows, avatar
- `renderInbox()`, `wireInboxTabs()`, `renderSnoozedView()`, `renderStarredView()`, `renderScheduledView()`
- `wireThreadRows()`, `avatarHtml()`, `threadRow()`, `gravatarUrl()`, `md5()`, `hashStr()`
- Depends on: state, gmail, actions

### 7. `src/actions.ts` (~200 lines)
Lines 1835-1966: row actions
- `doMarkRead()`, `doMarkUnread()`, `doToggleStar()`, `doArchive()`, `doBlock()`, `doUnsnooze()`, `doMute()`
- Depends on: state, gmail, threadList (re-render)

### 8. `src/bulk.ts` (~200 lines)
Lines 1155-1351: bulk select mode
- `toggleBulkMode()`, `exitBulkMode()`, `toggleBulkSelection()`, `updateBulkBar()`, `removeBulkBar()`, `openBulkSnoozePicker()`
- Depends on: state, actions, snooze

### 9. `src/snooze.ts` (~180 lines)
Lines 2039-2224: snooze picker + presets
- `snoozePresets()`, `openSnoozePicker()`, `doSnooze()`, `setupSnoozeResurface()`
- Depends on: state, gmail

### 10. `src/contextMenu.ts` (~70 lines)
Lines 1967-2038: right-click context menu
- `showContextMenu()`
- Depends on: state, actions, snooze

### 11. `src/inlineReply.ts` (~65 lines)
Lines 1768-1834: inline reply in thread list
- `openInlineReply()`
- Depends on: state, gmail

### 12. `src/shell.ts` (~250 lines)
Lines 151-456: auth screen, app shell, settings panel, view switching
- `showAuth()`, `showShell()`, `openSettings()`, `closeSettings()`, `renderSettingsAccounts()`
- `switchView()`, `renderLabelView()`
- Depends on: state, auth, threadList

### 13. `src/menus.ts` (~150 lines)
Lines 606-777: toolbar menu, account menu
- `showToolbarMenu()`, `showAccountMenu()`
- Depends on: state, shell

### 14. `src/helpers.ts` (~30 lines)
Lines 2832-2863: utility functions
- `applyTheme()`, `setStatus()`, `esc()`, `formatDate()`, `toDatetimeLocal()`

### 15. `src/main.ts` (~80 lines — REMAINING)
- Imports all modules
- `boot()` function
- `refreshAll()`, `syncAndRender()`, `loadUnifiedThreads()`
- `refreshKnownSenders()`, `toggleFocusMode()`, `isKnownSender()`, `applyFocusFilter()`
- App initialization, setInterval setup

## Execution Order (resolve dependencies bottom-up)

1. **state.ts** + **helpers.ts** (no deps)
2. **actions.ts** (depends on state, gmail)
3. **snooze.ts** (depends on state, gmail)
4. **contextMenu.ts** (depends on state, actions, snooze)
5. **inlineReply.ts** (depends on state, gmail)
6. **threadList.ts** (depends on state, gmail, actions)
7. **bulk.ts** (depends on state, actions, snooze)
8. **compose.ts** (depends on state, gmail)
9. **threadReader.ts** (depends on state, gmail, compose)
10. **shell.ts** (depends on state, auth, threadList)
11. **menus.ts** (depends on state, shell)
12. **keyboard.ts** (depends on state, actions, views, compose)
13. **commandPalette.ts** (depends on state, views, compose)
14. **main.ts** (orchestrator — imports everything, wires boot)

## Circular Dependency Strategy

The main risk is keyboard.ts needing to call renderInbox() and openThread(), while threadList needs selectThread() from keyboard. Solution:

- **Event bus pattern**: `src/events.ts` — a simple pub/sub. Modules emit events, other modules subscribe.
- OR **callback injection**: main.ts passes render callbacks into keyboard.ts at registration time.
- OR **lazy imports**: use `import()` for back-references (not ideal for sync code).

**Recommended: callback injection.** `registerKeyboardShortcuts({ renderInbox, openThread, switchView, ... })` — keeps deps explicit, no magic.

## Verification

After each module extraction:
- `npm run verify` must pass (tsc --noEmit && vitest run)
- No `any` type escapes
- No circular dependency warnings from tsc
- Build still produces working bundle
