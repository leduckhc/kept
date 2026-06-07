/**
 * UnifiedBar — Solid component: 3-zone layout (NAV / CONTEXT / ACTIONS)
 * with Strategy pattern for mode-specific rendering.
 *
 * Architecture:
 * - ModeStrategy interface: { nav, context, actions } — each is a Solid component
 * - getModeStrategy(mode): returns the strategy for a given mode
 * - deriveMode(): derives current mode from store state
 * - UnifiedBar: orchestrator that renders 3 fixed zones, delegating to the active strategy
 *
 * Design rules:
 * - Search + Compose are inbox-ONLY (absence signals context change)
 * - Breadcrumb is the nav pattern for folder + reader (tappable root)
 * - Bar is always 48px, single line (subject truncated on desktop)
 * - 150ms crossfade on mode transitions
 */
import { createMemo, createSignal, createEffect, onCleanup, Component, JSX } from 'solid-js';
import {
  appState, filteredThreads, selectedThread, clearBulkSelection,
  selectThread, setCategoryFilter, setSenderFilter, setDomainFilter,
  setSearchQuery, openCompose, toggleNavDrawer, switchView,
} from './store';
import { doArchive, doToggleStar, doMarkUnread, doMute, doSetAside, bulkArchive, bulkTrash, bulkMarkRead, bulkMarkUnread, bulkStar } from './actions';
import { icon } from '../icons';

// ── Types ───────────────────────────────────────────────────────
export type UnifiedBarMode = 'inbox' | 'reader' | 'folder' | 'bulk' | 'view';

/** Strategy interface: each zone is a Solid component with an id for testability */
export interface ZoneComponent extends Component {
  id: string;
}

export interface ModeStrategy {
  nav: ZoneComponent;
  context: ZoneComponent;
  actions: ZoneComponent;
}

// ── Constants ───────────────────────────────────────────────────
export const ZONE_CLASSES = {
  nav: 'unified-bar-zone-nav',
  context: 'unified-bar-zone-context',
  actions: 'unified-bar-zone-actions',
} as const;

// ── Derive Mode (exported for testing) ──────────────────────────
export function deriveMode(): UnifiedBarMode {
  if (appState.selectedIds.length > 0) return 'bulk';
  if (appState.selectedThreadId && appState.layoutMode === '2-pane') return 'reader';
  if (appState.categoryFilter || appState.senderFilter || appState.domainFilter) return 'folder';
  if (appState.currentView !== 'Inbox') return 'view';
  return 'inbox';
}

// ── Shared Components ───────────────────────────────────────────

function SearchPill(): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const [ref, setRef] = createSignal<HTMLInputElement | null>(null);

  const onFocus = () => setExpanded(true);
  const onBlur = () => {
    if (!ref()?.value) setExpanded(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const el = ref();
      if (el) { el.value = ''; el.blur(); }
      setSearchQuery('');
      setExpanded(false);
    }
  };

  return (
    <div class={`search-pill-wrap${expanded() ? ' expanded' : ''}`}>
      <span class="search-pill-icon" innerHTML={icon.search('14px')} />
      <input
        ref={(el) => setRef(el)}
        class="search-pill-input"
        id="search"
        type="search"
        placeholder="Search…"
        value={appState.searchQuery}
        onInput={(e) => setSearchQuery(e.currentTarget.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

function Breadcrumb(props: { segments: Array<{ label: string; onClick?: () => void }> }): JSX.Element {
  return (
    <nav class="unified-bar-breadcrumb">
      {props.segments.map((seg, i) => (
        <>
          {i > 0 && <span class="breadcrumb-sep">›</span>}
          {seg.onClick
            ? <button class="breadcrumb-link" onClick={seg.onClick}>
                <span class="breadcrumb-back-arrow" innerHTML={icon.arrowLeft('16px')} />
                {seg.label}
              </button>
            : <span class="breadcrumb-current">{seg.label}</span>
          }
        </>
      ))}
    </nav>
  );
}

// ── Inbox Strategy ──────────────────────────────────────────────

const InboxNav: ZoneComponent = Object.assign(
  () => (
    <button class="btn-icon btn-hamburger" id="btn-hamburger" title="Menu"
      onClick={toggleNavDrawer} innerHTML={icon.menu('20px')} />
  ),
  { id: 'hamburger' }
);

const InboxContext: ZoneComponent = Object.assign(
  () => (
    <>
      <div class="account-filter-wrap" id="account-filter"></div>
      <SearchPill />
    </>
  ),
  { id: 'search-pill' }
);

const InboxActions: ZoneComponent = Object.assign(
  () => (
    <>
      <div class="toolbar-context-actions" id="toolbar-context-actions"></div>
      <button class="btn-icon btn-compose" id="btn-compose" title="Compose [c]"
        onClick={() => openCompose()} innerHTML={icon.pencil('18px')} />
    </>
  ),
  { id: 'compose' }
);

const inboxStrategy: ModeStrategy = {
  nav: InboxNav,
  context: InboxContext,
  actions: InboxActions,
};

// ── Reader scroll state (mobile: 2-line→1-line on scroll) ────────
const [readerScrolled, setReaderScrolled] = createSignal(false);

// ── Reader Strategy ─────────────────────────────────────────────

const ReaderNav: ZoneComponent = Object.assign(
  () => {
    const onBack = () => {
      selectThread(null);
      document.getElementById('app-shell')?.classList.remove('reader-open');
      document.dispatchEvent(new CustomEvent('unified-bar:reader-closed'));
    };
    return (
      <Breadcrumb segments={[
        { label: 'Inbox', onClick: onBack },
      ]} />
    );
  },
  { id: 'breadcrumb' }
);

const ReaderContext: ZoneComponent = Object.assign(
  () => {
    const thread = createMemo(() => selectedThread());
    return (
      <>
        <span class="unified-bar-subject-inline" title={thread()?.subject ?? ''}>
          {thread()?.subject ?? ''}
        </span>
      </>
    );
  },
  { id: 'subject' }
);

const ReaderActions: ZoneComponent = Object.assign(
  () => {
    // Read isStarred from the store proxy directly for fine-grained reactivity
    const isStarred = createMemo(() => {
      const id = appState.selectedThreadId;
      if (!id) return false;
      const idx = appState.threads.findIndex(t => t.id === id);
      return idx >= 0 ? appState.threads[idx].isStarred : false;
    });
    const handleAction = (action: string) => {
      const t = selectedThread();
      if (!t) return;
      switch (action) {
        case 'archive': doArchive(t); selectThread(null); break;
        case 'prioritize': doToggleStar(t); break;
        case 'mark-unread': doMarkUnread(t); selectThread(null); break;
        case 'mute': doMute(t); selectThread(null); break;
        case 'set-aside': doSetAside(t); selectThread(null); break;
      }
    };
    return (
      <div class="unified-bar-actions">
        <button class="btn-icon" data-action="archive" title="Archive" innerHTML={icon.archive('16px')} onClick={() => handleAction('archive')} />
        <button class="btn-icon" data-action="prioritize" title={isStarred() ? "Deprioritize" : "Prioritize"} innerHTML={isStarred() ? icon.starFilled('16px') : icon.star('16px')} onClick={() => handleAction('prioritize')} />
      </div>
    );
  },
  { id: 'thread-actions' }
);

const readerStrategy: ModeStrategy = {
  nav: ReaderNav,
  context: ReaderContext,
  actions: ReaderActions,
};

// ── Folder Strategy ─────────────────────────────────────────────

const FolderNav: ZoneComponent = Object.assign(
  () => {
    const onBack = () => {
      setCategoryFilter(null);
      setSenderFilter(null);
      setDomainFilter(null);
      document.dispatchEvent(new CustomEvent('unified-bar:folder-back'));
    };
    return (
      <Breadcrumb segments={[
        { label: 'Inbox', onClick: onBack },
      ]} />
    );
  },
  { id: 'breadcrumb' }
);

const FolderContext: ZoneComponent = Object.assign(
  () => {
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

    return (
      <div class="unified-bar-folder-info">
        <span class="unified-bar-folder-dot" style={{ background: folderColor() }} />
        <span class="unified-bar-folder-name">{folderName()}</span>
        <span class="unified-bar-folder-count">{countLabel()}</span>
      </div>
    );
  },
  { id: 'folder-info' }
);

const FolderActions: ZoneComponent = Object.assign(
  () => {
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
      <div class="unified-bar-actions unified-bar-folder-actions">
        <button class="btn-icon btn-folder-action" title="Select all" onClick={onSelectAll}
          innerHTML={icon.checkSquare('15px')} />
        <button class="btn-icon btn-folder-action" title="Archive all" onClick={onArchiveAll}
          innerHTML={icon.archive('15px')} />
        <button class="btn-icon btn-folder-action" title="Mark all read" onClick={onMarkReadAll}
          innerHTML={icon.markRead('15px')} />
      </div>
    );
  },
  { id: 'folder-actions' }
);

const folderStrategy: ModeStrategy = {
  nav: FolderNav,
  context: FolderContext,
  actions: FolderActions,
};

// ── View Strategy (non-Inbox views: Triage, Scheduled, Reminders, etc.) ──

const ViewNav: ZoneComponent = Object.assign(
  () => {
    const onBack = () => {
      switchView('Inbox');
    };
    return (
      <Breadcrumb segments={[
        { label: 'Inbox', onClick: onBack },
      ]} />
    );
  },
  { id: 'breadcrumb' }
);

const ViewContext: ZoneComponent = Object.assign(
  () => {
    const viewName = createMemo(() => appState.currentView);
    return <span class="unified-bar-view-title">{viewName()}</span>;
  },
  { id: 'view-title' }
);

const ViewActions: ZoneComponent = Object.assign(
  () => <div class="unified-bar-actions" />,
  { id: 'view-actions' }
);

const viewStrategy: ModeStrategy = {
  nav: ViewNav,
  context: ViewContext,
  actions: ViewActions,
};

// ── Bulk Strategy ───────────────────────────────────────────────

const BulkNav: ZoneComponent = Object.assign(
  () => {
    const onCancel = () => clearBulkSelection();
    return (
      <button class="btn-icon bulk-cancel-btn" id="bulk-cancel" title="Cancel selection"
        onClick={onCancel} innerHTML={icon.close('16px')} />
    );
  },
  { id: 'bulk-cancel' }
);

const BulkContext: ZoneComponent = Object.assign(
  () => {
    const count = createMemo(() => appState.selectedIds.length);
    return <span class="bulk-count">{count()} selected</span>;
  },
  { id: 'selection-count' }
);

const BulkActions: ZoneComponent = Object.assign(
  () => (
    <div class="unified-bar-actions">
      <button class="btn-icon bulk-action-btn" id="bulk-archive" title="Archive" innerHTML={icon.archive('16px')} onClick={() => bulkArchive()} />
      <button class="btn-icon bulk-action-btn" id="bulk-trash" title="Trash" innerHTML={icon.trash('16px')} onClick={() => bulkTrash()} />
      <button class="btn-icon bulk-action-btn" id="bulk-read" title="Mark Read" innerHTML={icon.markRead('16px')} onClick={() => bulkMarkRead()} />
      <button class="btn-icon bulk-action-btn" id="bulk-unread" title="Mark Unread" innerHTML={icon.email('16px')} onClick={() => bulkMarkUnread()} />
      <button class="btn-icon bulk-action-btn" id="bulk-star" title="Star" innerHTML={icon.star('16px')} onClick={() => bulkStar()} />
    </div>
  ),
  { id: 'bulk-actions' }
);

const bulkStrategy: ModeStrategy = {
  nav: BulkNav,
  context: BulkContext,
  actions: BulkActions,
};

// ── Strategy Registry ───────────────────────────────────────────

const strategies: Record<UnifiedBarMode, ModeStrategy> = {
  inbox: inboxStrategy,
  reader: readerStrategy,
  folder: folderStrategy,
  view: viewStrategy,
  bulk: bulkStrategy,
};

/** Get the strategy for a mode (exported for testing) */
export function getModeStrategy(mode: UnifiedBarMode): ModeStrategy {
  return strategies[mode];
}

// ── Main Component (Orchestrator) ───────────────────────────────
export function UnifiedBar() {
  const mode = createMemo(deriveMode);
  const [prevMode, setPrevMode] = createSignal<UnifiedBarMode>('inbox');
  const [transitioning, setTransitioning] = createSignal(false);

  // Track mode changes for transition direction
  const direction = createMemo(() => {
    const curr = mode();
    const prev = prevMode();
    if (curr === prev) return 'none';
    const depth: Record<UnifiedBarMode, number> = { inbox: 0, view: 1, folder: 1, reader: 2, bulk: 3 };
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

  const strategy = createMemo(() => getModeStrategy(mode()));

  // Track reader pane scroll for mobile 2-line→1-line collapse
  createEffect(() => {
    if (mode() !== 'reader') {
      setReaderScrolled(false);
      return;
    }
    const pane = document.getElementById('reader-pane');
    if (!pane) return;
    const onScroll = () => setReaderScrolled(pane.scrollTop > 40);
    pane.addEventListener('scroll', onScroll, { passive: true });
    onCleanup(() => pane.removeEventListener('scroll', onScroll));
  });

  const thread = createMemo(() => selectedThread());

  return (
    <div
      class="unified-bar"
      data-mode={mode()}
      data-direction={direction()}
      data-scrolled={readerScrolled() ? '' : undefined}
      classList={{ 'unified-bar--transitioning': transitioning() }}
    >
      <div class={ZONE_CLASSES.nav}>
        {(() => { const Nav = strategy().nav; return <Nav />; })()}
      </div>
      <div class={ZONE_CLASSES.context}>
        {(() => { const Context = strategy().context; return <Context />; })()}
      </div>
      <div class={ZONE_CLASSES.actions}>
        {(() => { const Actions = strategy().actions; return <Actions />; })()}
      </div>
      {/* Phone-only 2nd row: subject (hidden when scrolled) */}
      <div class="unified-bar-subject-row">
        <span class="unified-bar-subject-phone">{thread()?.subject ?? ''}</span>
      </div>
    </div>
  );
}
