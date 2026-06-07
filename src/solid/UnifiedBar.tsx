/**
 * UnifiedBar — Solid component: breadcrumb navigation, search pill,
 * contextual actions, crossfade transitions between modes.
 *
 * Design decisions:
 * - Breadcrumb nav: "Inbox › Newsletters (12)" — tappable root replaces back arrow
 * - Search pill: always visible collapsed (120px), expands full-width on focus
 * - Compose: persists across modes on desktop (subtle "+" in reader/folder)
 * - Folder mode: inline bulk actions (select all, archive all, mark read)
 * - Transitions: 150ms crossfade between modes
 */
import { Show, createMemo, createSignal } from 'solid-js';
import {
  appState, filteredThreads, selectedThread, clearBulkSelection,
  selectThread, setCategoryFilter, setSenderFilter, setDomainFilter,
} from './store';
import { icon } from '../icons';

export type UnifiedBarMode = 'inbox' | 'reader' | 'folder' | 'bulk';

/** Derive mode from store state */
function deriveMode(): UnifiedBarMode {
  if (appState.selectedIds.length > 0) return 'bulk';
  if (appState.selectedThreadId && appState.layoutMode === '2-pane') return 'reader';
  if (appState.categoryFilter || appState.senderFilter || appState.domainFilter) return 'folder';
  return 'inbox';
}

// ── Search Pill ─────────────────────────────────────────────
function SearchPill() {
  const [expanded, setExpanded] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  const onFocus = () => setExpanded(true);
  const onBlur = () => {
    if (!inputRef?.value) setExpanded(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (inputRef) inputRef.value = '';
      inputRef?.blur();
      setExpanded(false);
    }
  };

  return (
    <div class={`search-pill-wrap${expanded() ? ' expanded' : ''}`}>
      <span class="search-pill-icon" innerHTML={icon.search('14px')} />
      <input
        ref={inputRef}
        class="search-pill-input"
        id="search"
        type="search"
        placeholder="Search…"
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

// ── Breadcrumb ──────────────────────────────────────────────
function Breadcrumb(props: { segments: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <nav class="unified-bar-breadcrumb">
      {props.segments.map((seg, i) => (
        <>
          {i > 0 && <span class="breadcrumb-sep">›</span>}
          {seg.onClick
            ? <button class="breadcrumb-link" onClick={seg.onClick}>{seg.label}</button>
            : <span class="breadcrumb-current">{seg.label}</span>
          }
        </>
      ))}
    </nav>
  );
}

// ── Compose Button ──────────────────────────────────────────
function ComposeButton(props: { mini?: boolean }) {
  return (
    <button
      class={`btn-icon btn-compose${props.mini ? ' btn-compose-mini' : ''}`}
      id="btn-compose"
      title="Compose [c]"
      innerHTML={icon.pencil(props.mini ? '14px' : '18px')}
    />
  );
}

// ── Mode: Inbox ─────────────────────────────────────────────
function InboxMode() {
  return (
    <>
      <button class="btn-icon btn-hamburger" id="btn-hamburger" title="Menu"
        innerHTML={icon.menu('18px')} />
      <div class="account-filter-wrap" id="account-filter"></div>
      <SearchPill />
      <div class="toolbar-context-actions" id="toolbar-context-actions"></div>
      <ComposeButton />
    </>
  );
}

// ── Mode: Reader ────────────────────────────────────────────
function ReaderMode() {
  const thread = createMemo(() => selectedThread());

  const onBack = () => {
    selectThread(null);
    document.getElementById('app-shell')?.classList.remove('reader-open');
    document.dispatchEvent(new CustomEvent('unified-bar:reader-closed'));
  };

  return (
    <>
      <div class="unified-bar-row">
        <Breadcrumb segments={[
          { label: 'Inbox', onClick: onBack },
          { label: thread()?.subject ?? '' },
        ]} />
        <div class="unified-bar-actions">
          <button class="btn-icon" data-action="archive" title="Archive" innerHTML={icon.archive('16px')} />
          <button class="btn-icon" data-action="pin" title="Pin" innerHTML={icon.pin('16px')} />
          <button class="btn-icon" data-action="prioritize" title="Prioritize" innerHTML={icon.star('16px')} />
          <div class="unified-bar-overflow">
            <button class="btn-icon unified-bar-overflow-btn" title="More actions" innerHTML={icon.more('16px')} />
            <div class="unified-bar-overflow-menu">
              <button class="overflow-item" data-action="mark-unread">
                <span innerHTML={icon.emailOpen('14px')} /> Mark unread
              </button>
              <button class="overflow-item" data-action="spam">
                <span innerHTML={icon.spam('14px')} /> Report spam
              </button>
              <button class="overflow-item" data-action="move">
                <span innerHTML={icon.folderMove('14px')} /> Move to label
              </button>
              <button class="overflow-item" data-action="followup">
                <span innerHTML={icon.bell('14px')} /> Remind if no reply
              </button>
            </div>
          </div>
          <ComposeButton mini />
        </div>
      </div>
      <div class="unified-bar-subject-row">
        <span class="unified-bar-subject unified-bar-subject-phone">
          {thread()?.subject ?? ''}
        </span>
      </div>
    </>
  );
}

// ── Mode: Folder ────────────────────────────────────────────
function FolderMode() {
  const folderName = createMemo(() => {
    if (appState.categoryFilter) return appState.categoryFilter.charAt(0).toUpperCase() + appState.categoryFilter.slice(1);
    if (appState.senderFilter) return appState.senderFilter;
    if (appState.domainFilter) return appState.domainFilter;
    return '';
  });

  const folderColor = createMemo(() => {
    if (appState.categoryFilter === 'newsletters') return '#7c6ef6';
    if (appState.categoryFilter === 'updates') return '#3b82f6';
    return '#64748b';
  });

  const threadCount = createMemo(() => filteredThreads().length);
  const unreadCount = createMemo(() => filteredThreads().filter(t => t.isUnread).length);

  const countLabel = createMemo(() => {
    const unread = unreadCount();
    const total = threadCount();
    return unread > 0 ? `${unread} unread` : `${total}`;
  });

  const onBack = () => {
    setCategoryFilter(null);
    setSenderFilter(null);
    setDomainFilter(null);
    document.dispatchEvent(new CustomEvent('unified-bar:folder-back'));
  };

  const onSelectAll = () => {
    document.dispatchEvent(new CustomEvent('unified-bar:folder-select-all'));
  };
  const onArchiveAll = () => {
    document.dispatchEvent(new CustomEvent('unified-bar:folder-archive-all'));
  };
  const onMarkReadAll = () => {
    document.dispatchEvent(new CustomEvent('unified-bar:folder-mark-read-all'));
  };

  return (
    <>
      <Breadcrumb segments={[
        { label: 'Inbox', onClick: onBack },
        { label: folderName() },
      ]} />
      <span class="unified-bar-folder-dot" style={{ background: folderColor() }} />
      <span class="unified-bar-folder-count">{countLabel()}</span>
      <div class="unified-bar-actions unified-bar-folder-actions">
        <button class="btn-icon btn-folder-action" title="Select all" onClick={onSelectAll}
          innerHTML={icon.checkSquare('15px')} />
        <button class="btn-icon btn-folder-action" title="Archive all" onClick={onArchiveAll}
          innerHTML={icon.archive('15px')} />
        <button class="btn-icon btn-folder-action" title="Mark all read" onClick={onMarkReadAll}
          innerHTML={icon.markRead('15px')} />
        <ComposeButton mini />
      </div>
    </>
  );
}

// ── Mode: Bulk ──────────────────────────────────────────────
function BulkMode() {
  const count = createMemo(() => appState.selectedIds.length);
  const onCancel = () => clearBulkSelection();

  return (
    <>
      <button class="btn-icon bulk-cancel-btn" id="bulk-cancel" title="Cancel selection"
        onClick={onCancel} innerHTML={icon.close('16px')} />
      <span class="bulk-count">{count()} selected</span>
      <div class="unified-bar-actions">
        <button class="btn-icon bulk-action-btn" id="bulk-archive" title="Archive" innerHTML={icon.archive('16px')} />
        <button class="btn-icon bulk-action-btn" id="bulk-trash" title="Trash" innerHTML={icon.trash('16px')} />
        <button class="btn-icon bulk-action-btn" id="bulk-read" title="Mark Read" innerHTML={icon.markRead('16px')} />
        <button class="btn-icon bulk-action-btn" id="bulk-unread" title="Mark Unread" innerHTML={icon.email('16px')} />
        <button class="btn-icon bulk-action-btn" id="bulk-star" title="Star" innerHTML={icon.star('16px')} />
      </div>
    </>
  );
}

// ── Main Component ──────────────────────────────────────────
export function UnifiedBar() {
  const mode = createMemo(deriveMode);
  const [prevMode, setPrevMode] = createSignal<UnifiedBarMode>('inbox');
  const [transitioning, setTransitioning] = createSignal(false);

  // Track mode changes for transition direction
  const direction = createMemo(() => {
    const curr = mode();
    const prev = prevMode();
    if (curr === prev) return 'none';
    // Forward: inbox→folder→reader, Back: reader→folder→inbox
    const depth: Record<UnifiedBarMode, number> = { inbox: 0, folder: 1, reader: 2, bulk: 3 };
    return depth[curr] > depth[prev] ? 'forward' : 'back';
  });

  // Trigger transition on mode change
  createMemo(() => {
    const curr = mode();
    if (curr !== prevMode()) {
      setTransitioning(true);
      setTimeout(() => {
        setPrevMode(curr);
        setTransitioning(false);
      }, 150);
    }
  });

  return (
    <div
      class="unified-bar"
      data-mode={mode()}
      data-direction={direction()}
      classList={{ 'unified-bar--transitioning': transitioning() }}
    >
      <Show when={mode() === 'inbox'}><InboxMode /></Show>
      <Show when={mode() === 'reader'}><ReaderMode /></Show>
      <Show when={mode() === 'folder'}><FolderMode /></Show>
      <Show when={mode() === 'bulk'}><BulkMode /></Show>
    </div>
  );
}
