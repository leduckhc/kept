// unifiedBar.ts — Unified context bar: one bar, four modes (inbox/reader/folder/bulk)
// SRP: Each mode has its own render function. The orchestrator picks by state.

import { icon } from './icons';

export type UnifiedBarMode = 'inbox' | 'reader' | 'folder' | 'bulk';

export type UnifiedBarState =
  | { mode: 'inbox' }
  | { mode: 'reader'; subject: string }
  | { mode: 'folder'; folderName: string; folderColor: string; folderCount: number }
  | { mode: 'bulk'; count: number };

// ── Mode renderers (SRP: one function per concern) ──────────────

function renderInboxMode(): string {
  return `
    <button class="btn-icon btn-hamburger" id="btn-hamburger" title="Menu">${icon.menu('18px')}</button>
    <div class="account-filter-wrap" id="account-filter"></div>
    <div class="unified-bar-right">
      <div class="toolbar-search-wrap collapsed" id="toolbar-search-wrap">
        <button class="btn-icon btn-search-toggle" id="btn-search-toggle" title="Search [⌘F]">${icon.search('16px')}</button>
        <div class="search-pill">
          <span class="toolbar-search-icon">${icon.search('14px')}</span>
          <input class="search-input" id="search" placeholder="Search…" type="search" />
        </div>
      </div>
      <div class="toolbar-context-actions" id="toolbar-context-actions"></div>
      <button class="btn-icon btn-compose" id="btn-compose" title="Compose [c]">${icon.pencil('18px')}</button>
    </div>`;
}

function renderReaderMode(subject: string): string {
  return `
    <div class="unified-bar-row">
      <button class="btn-icon unified-bar-back" id="unified-bar-back" title="Back to inbox [Escape]">${icon.arrowLeft('16px')}</button>
      <div class="unified-bar-subject unified-bar-subject-inline">${escapeHtml(subject)}</div>
      <div class="unified-bar-actions">
        <button class="btn-icon" data-action="archive" title="Archive">${icon.archive('16px')}</button>
        <button class="btn-icon" data-action="pin" title="Pin">${icon.pin('16px')}</button>
        <button class="btn-icon" data-action="prioritize" title="Prioritize">${icon.star('16px')}</button>
        <div class="unified-bar-overflow">
          <button class="btn-icon unified-bar-overflow-btn" title="More actions">${icon.more('16px')}</button>
          <div class="unified-bar-overflow-menu">
            <button class="overflow-item" data-action="mark-unread">${icon.emailOpen('14px')} Mark unread</button>
            <button class="overflow-item" data-action="spam">${icon.spam('14px')} Report spam</button>
            <button class="overflow-item" data-action="move">${icon.folderMove('14px')} Move to label</button>
            <button class="overflow-item" data-action="followup">${icon.bell('14px')} Remind if no reply</button>
          </div>
        </div>
      </div>
    </div>
    <div class="unified-bar-subject-row">
      <span class="unified-bar-subject unified-bar-subject-phone">${escapeHtml(subject)}</span>
    </div>`;
}

function renderFolderMode(name: string, color: string, count: number): string {
  return `
    <button class="btn-icon unified-bar-back" id="unified-bar-back" title="Back to inbox">${icon.arrowLeft('16px')}</button>
    <span class="unified-bar-folder-dot" style="background: ${color}"></span>
    <span class="unified-bar-folder-name">${escapeHtml(name)}</span>
    <span class="unified-bar-folder-count">${count}</span>`;
}

function renderBulkMode(count: number): string {
  return `
    <button class="btn-icon bulk-cancel-btn" id="bulk-cancel" title="Cancel selection">${icon.close('16px')}</button>
    <span class="bulk-count">${count} selected</span>
    <div class="unified-bar-actions">
      <button class="btn-icon bulk-action-btn" id="bulk-archive" title="Archive">${icon.archive('16px')}</button>
      <button class="btn-icon bulk-action-btn" id="bulk-trash" title="Trash">${icon.trash('16px')}</button>
      <button class="btn-icon bulk-action-btn" id="bulk-read" title="Mark Read">${icon.markRead('16px')}</button>
      <button class="btn-icon bulk-action-btn" id="bulk-unread" title="Mark Unread">${icon.email('16px')}</button>
      <button class="btn-icon bulk-action-btn" id="bulk-star" title="Star">${icon.star('16px')}</button>
    </div>`;
}

// ── Orchestrator ────────────────────────────────────────────────

export function renderUnifiedBar(state: UnifiedBarState): string {
  let inner: string;
  switch (state.mode) {
    case 'reader':
      inner = renderReaderMode(state.subject);
      break;
    case 'folder':
      inner = renderFolderMode(state.folderName, state.folderColor, state.folderCount);
      break;
    case 'bulk':
      inner = renderBulkMode(state.count);
      break;
    default:
      inner = renderInboxMode();
  }
  return `<div class="unified-bar" data-mode="${state.mode}">${inner}</div>`;
}

// ── Helpers ─────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
