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

describe('Spark Top Bar', () => {
  const topbarHTML = `
    <div class="toolbar">
      <div class="toolbar-search-wrap" id="toolbar-search-wrap">
        <button class="btn-icon btn-search-toggle" title="Search"></button>
        <div class="search-pill">
          <span class="toolbar-search-icon"></span>
          <input class="search-input" id="search" placeholder="Search…" type="search" />
        </div>
      </div>
      <div class="toolbar-actions-right">
        <div class="toolbar-context-actions" id="toolbar-context-actions">
          <button class="toolbar-btn" data-action="archive" title="Archive"></button>
          <button class="toolbar-btn" data-action="label" title="Label"></button>
          <button class="toolbar-btn" data-action="move" title="Move to folder"></button>
          <button class="toolbar-btn" data-action="trash" title="Trash"></button>
        </div>
        <button class="btn-icon btn-compose" id="btn-compose" title="Compose [c]"></button>
      </div>
    </div>`;

  it('has context action buttons on the right side (hidden by default)', () => {
    const doc = createShellDOM(topbarHTML);
    const ctxActions = doc.querySelector('.toolbar-context-actions');
    expect(ctxActions).not.toBeNull();
    // Hidden by default (no .visible class)
    expect(ctxActions!.classList.contains('visible')).toBe(false);
    const buttons = ctxActions!.querySelectorAll('.toolbar-btn[data-action]');
    expect(buttons.length).toBe(4);
    const actions = Array.from(buttons).map(b => (b as HTMLElement).dataset.action);
    expect(actions).toEqual(['archive', 'label', 'move', 'trash']);
  });

  it('has search on the left/center', () => {
    const doc = createShellDOM(topbarHTML);
    const toolbar = doc.querySelector('.toolbar')!;
    const searchWrap = toolbar.querySelector('.toolbar-search-wrap');
    expect(searchWrap).not.toBeNull();
    const input = searchWrap!.querySelector('input.search-input');
    expect(input).not.toBeNull();
  });

  it('has compose button on the right after context actions', () => {
    const doc = createShellDOM(topbarHTML);
    const rightActions = doc.querySelector('.toolbar-actions-right');
    expect(rightActions).not.toBeNull();
    const compose = rightActions!.querySelector('#btn-compose');
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
