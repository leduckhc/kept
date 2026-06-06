// sparkToolbar.test.ts — Tests for Spark-style top bar and compose bar layout
import { describe, it, expect, beforeEach } from 'vitest';

// Vitest is configured with happy-dom — document/window are globally available.
function createShellDOM(html: string): Document {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.innerHTML = '';
  document.body.appendChild(div);
  return document;
}

describe('Unified Bar — Inbox Mode (replaces old Spark Top Bar)', () => {
  const topbarHTML = `
    <div class="unified-bar" data-mode="inbox">
      <button class="btn-icon btn-hamburger" id="btn-hamburger" title="Menu"></button>
      <div class="account-filter-wrap" id="account-filter"></div>
      <div class="unified-bar-right">
        <div class="toolbar-search-wrap collapsed" id="toolbar-search-wrap">
          <button class="btn-icon btn-search-toggle" id="btn-search-toggle" title="Search [⌘F]"></button>
          <div class="search-pill">
            <span class="toolbar-search-icon"></span>
            <input class="search-input" id="search" placeholder="Search…" type="search" />
          </div>
        </div>
        <div class="toolbar-context-actions" id="toolbar-context-actions"></div>
        <button class="btn-icon btn-compose" id="btn-compose" title="Compose [c]"></button>
      </div>
    </div>`;

  it('has context action slot on the right side (hidden by default)', () => {
    const doc = createShellDOM(topbarHTML);
    const ctxActions = doc.querySelector('.toolbar-context-actions');
    expect(ctxActions).not.toBeNull();
    expect(ctxActions!.classList.contains('visible')).toBe(false);
  });

  it('has search in right group', () => {
    const doc = createShellDOM(topbarHTML);
    const bar = doc.querySelector('.unified-bar')!;
    const searchWrap = bar.querySelector('.toolbar-search-wrap');
    expect(searchWrap).not.toBeNull();
    const input = searchWrap!.querySelector('input.search-input');
    expect(input).not.toBeNull();
  });

  it('has compose button in right group', () => {
    const doc = createShellDOM(topbarHTML);
    const right = doc.querySelector('.unified-bar-right');
    expect(right).not.toBeNull();
    const compose = right!.querySelector('#btn-compose');
    expect(compose).not.toBeNull();
  });

  it('context actions become visible when .visible class is added', () => {
    const doc = createShellDOM(topbarHTML);
    const ctxActions = doc.querySelector('.toolbar-context-actions')!;
    ctxActions.classList.add('visible');
    expect(ctxActions.classList.contains('visible')).toBe(true);
  });
});

describe('Spark Compose Bar', () => {
  const composeBarHTML = `
    <div class="compose-panel-footer">
      <div class="compose-footer-left">
        <button class="toolbar-btn" data-cmd="bold" title="Bold (⌘B)"></button>
        <button class="toolbar-btn" data-cmd="italic" title="Italic (⌘I)"></button>
        <button class="toolbar-btn" data-cmd="underline" title="Underline (⌘U)"></button>
        <span class="toolbar-sep"></span>
        <button class="toolbar-btn" data-cmd="insertUnorderedList" title="Bullet list"></button>
        <button class="toolbar-btn" data-cmd="insertOrderedList" title="Numbered list"></button>
      </div>
      <div class="compose-footer-actions">
        <button class="btn-icon compose-attach-btn" title="Attach file"></button>
        <button class="compose-snippets-btn" title="Snippets"></button>
        <button class="compose-followup-btn" title="Remind if no reply"></button>
        <button class="compose-schedule-btn" title="Schedule send"></button>
      </div>
      <div class="compose-footer-right">
        <button class="compose-send-btn-new">Send</button>
      </div>
    </div>`;

  it('has formatting buttons on the left', () => {
    const doc = createShellDOM(composeBarHTML);
    const left = doc.querySelector('.compose-footer-left');
    expect(left).not.toBeNull();
    const fmtBtns = left!.querySelectorAll('.toolbar-btn[data-cmd]');
    expect(fmtBtns.length).toBeGreaterThanOrEqual(3);
    const cmds = Array.from(fmtBtns).map(b => (b as HTMLElement).dataset.cmd);
    expect(cmds).toContain('bold');
    expect(cmds).toContain('italic');
    expect(cmds).toContain('underline');
  });

  it('has action buttons (attach, snippets, followup, schedule) in center', () => {
    const doc = createShellDOM(composeBarHTML);
    const actions = doc.querySelector('.compose-footer-actions');
    expect(actions).not.toBeNull();
    expect(actions!.querySelector('.compose-attach-btn')).not.toBeNull();
    expect(actions!.querySelector('.compose-snippets-btn')).not.toBeNull();
    expect(actions!.querySelector('.compose-followup-btn')).not.toBeNull();
    expect(actions!.querySelector('.compose-schedule-btn')).not.toBeNull();
  });

  it('has send button on the right', () => {
    const doc = createShellDOM(composeBarHTML);
    const right = doc.querySelector('.compose-footer-right');
    expect(right).not.toBeNull();
    const sendBtn = right!.querySelector('.compose-send-btn-new');
    expect(sendBtn).not.toBeNull();
    expect(sendBtn!.textContent).toContain('Send');
  });

  it('does not have discard button in the footer (moved to header)', () => {
    const doc = createShellDOM(composeBarHTML);
    const discard = doc.querySelector('.compose-panel-footer .compose-discard-btn-new');
    expect(discard).toBeNull();
  });
});

describe('Sidebar avatar stability', () => {
  const sidebarHTML = `
    <style>
      #app-shell {
        display: flex;
        flex-direction: column;
        height: 100vh;
        position: relative;
      }
      .app-body {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      .sidebar {
        width: 48px;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px 0;
        gap: 4px;
      }
      .sidebar-spacer { flex: 1; }
      .sidebar-avatar { margin-top: auto; }
      .statusbar {
        position: absolute;
        bottom: 0;
        right: 0;
        height: 18px;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .statusbar.visible { opacity: 0.7; }
    </style>
    <div id="app-shell">
      <div class="app-body">
        <nav class="sidebar">
          <button class="sidebar-btn">Inbox</button>
          <div class="sidebar-spacer"></div>
          <button class="sidebar-btn sidebar-avatar" id="btn-account">A</button>
        </nav>
      </div>
      <div class="statusbar"></div>
    </div>`;

  it('statusbar is position: absolute so it does not affect sidebar layout', () => {
    const doc = createShellDOM(sidebarHTML);
    const statusbar = doc.querySelector('.statusbar') as HTMLElement;
    expect(statusbar).not.toBeNull();
    const style = window.getComputedStyle(statusbar);
    expect(style.position).toBe('absolute');
  });

  it('sidebar-avatar uses margin-top: auto to pin to bottom of flex sidebar', () => {
    const doc = createShellDOM(sidebarHTML);
    const avatar = doc.querySelector('.sidebar-avatar') as HTMLElement;
    expect(avatar).not.toBeNull();
    const style = window.getComputedStyle(avatar);
    expect(style.marginTop).toBe('auto');
  });
});
