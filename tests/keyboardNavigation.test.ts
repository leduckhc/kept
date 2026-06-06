/**
 * Regression tests for: "keyboard navigation (j/k/ArrowDown/ArrowUp) fails after unified bar changes"
 *
 * Bug: After unified bar was introduced, keyboard-driven thread selection
 * (moveSelection) stopped working because focus was captured by search input
 * in the unified bar inbox mode.
 *
 * Tests verify that moveSelection + selectThread work correctly with the
 * unified bar DOM present and that focus state doesn't interfere.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { moveSelection, selectThread, getVisibleThreadIds, isInputFocused } from '../src/keyboard';
import { renderUnifiedBar } from '../src/unifiedBar';
import { state } from '../src/state';

function setupShellWithThreads(count: number) {
  const rows = Array.from({ length: count }, (_, i) => `
    <div class="thread-row" data-id="th_${i + 1}">
      <div class="thread-subject-line">Subject ${i + 1}</div>
    </div>
  `).join('');

  document.body.innerHTML = `
    <div id="app-shell">
      <div class="main-area">
        <div class="unified-bar-slot" id="unified-bar-slot">
          ${renderUnifiedBar({ mode: 'inbox' })}
        </div>
        <div class="app-body">
          <div class="inbox" id="inbox">
            ${rows}
          </div>
          <div class="reader-pane" id="reader-pane"></div>
        </div>
      </div>
    </div>
  `;
}

function setupShellWithCategories() {
  document.body.innerHTML = `
    <div id="app-shell">
      <div class="main-area">
        <div class="unified-bar-slot" id="unified-bar-slot">
          ${renderUnifiedBar({ mode: 'inbox' })}
        </div>
        <div class="app-body">
          <div class="inbox" id="inbox">
            <div class="thread-row category-row" data-category="updates">
              <span>Updates (5)</span>
            </div>
            <div class="thread-row" data-id="th_1">
              <div class="thread-subject-line">Email 1</div>
            </div>
            <div class="thread-row" data-id="th_2">
              <div class="thread-subject-line">Email 2</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function resetState() {
  state.selectedThreadId = null;
  state.categoryFilter = null;
  state.senderFilter = null;
  state.domainFilter = null;
  state.bulkMode = false;
  state.selectedIds = new Set();
}

describe('Keyboard navigation with unified bar (regression)', () => {
  beforeEach(() => {
    resetState();
  });

  describe('moveSelection basics', () => {
    it('selects first thread when nothing is selected and moving down', () => {
      setupShellWithThreads(5);
      moveSelection(1);
      expect(state.selectedThreadId).toBe('th_1');
      expect(document.querySelector('.thread-row[data-id="th_1"]')?.classList.contains('is-selected')).toBe(true);
    });

    it('moves selection forward with direction=1', () => {
      setupShellWithThreads(5);
      state.selectedThreadId = 'th_1';
      moveSelection(1);
      expect(state.selectedThreadId).toBe('th_2');
    });

    it('moves selection backward with direction=-1', () => {
      setupShellWithThreads(5);
      state.selectedThreadId = 'th_3';
      moveSelection(-1);
      expect(state.selectedThreadId).toBe('th_2');
    });

    it('does not move past last thread', () => {
      setupShellWithThreads(3);
      state.selectedThreadId = 'th_3';
      moveSelection(1);
      expect(state.selectedThreadId).toBe('th_3');
    });

    it('does not move before first thread', () => {
      setupShellWithThreads(3);
      state.selectedThreadId = 'th_1';
      moveSelection(-1);
      expect(state.selectedThreadId).toBe('th_1');
    });

    it('does nothing when no thread rows exist', () => {
      document.body.innerHTML = `<div id="app-shell"><div class="inbox" id="inbox"></div></div>`;
      moveSelection(1);
      expect(state.selectedThreadId).toBeNull();
    });
  });

  describe('selectThread visual state', () => {
    it('adds is-selected class to the target row', () => {
      setupShellWithThreads(3);
      selectThread('th_2');
      const row = document.querySelector('.thread-row[data-id="th_2"]');
      expect(row?.classList.contains('is-selected')).toBe(true);
    });

    it('removes is-selected from previously selected row', () => {
      setupShellWithThreads(3);
      selectThread('th_1');
      selectThread('th_2');
      const row1 = document.querySelector('.thread-row[data-id="th_1"]');
      const row2 = document.querySelector('.thread-row[data-id="th_2"]');
      expect(row1?.classList.contains('is-selected')).toBe(false);
      expect(row2?.classList.contains('is-selected')).toBe(true);
    });

    it('activates keyboard-nav mode on inbox', () => {
      setupShellWithThreads(3);
      selectThread('th_1');
      const inbox = document.getElementById('inbox');
      expect(inbox?.classList.contains('keyboard-nav')).toBe(true);
    });
  });

  describe('navigation with category rows', () => {
    it('includes category rows in visible thread IDs', () => {
      setupShellWithCategories();
      const ids = getVisibleThreadIds();
      expect(ids).toContain('category:updates');
      expect(ids).toContain('th_1');
      expect(ids).toContain('th_2');
    });

    it('can select category row via moveSelection', () => {
      setupShellWithCategories();
      moveSelection(1); // first item is the category row
      expect(state.selectedThreadId).toBe('category:updates');
    });

    it('navigates through mixed category + thread rows', () => {
      setupShellWithCategories();
      moveSelection(1); // category:updates
      moveSelection(1); // th_1
      moveSelection(1); // th_2
      expect(state.selectedThreadId).toBe('th_2');
    });
  });

  describe('unified bar does not steal focus', () => {
    it('search input is NOT focused by default after rendering', () => {
      setupShellWithThreads(3);
      // The search input inside unified bar should not auto-focus
      const searchInput = document.querySelector<HTMLInputElement>('.unified-bar input[type="search"], .unified-bar .search-input');
      if (searchInput) {
        expect(document.activeElement).not.toBe(searchInput);
      }
      expect(isInputFocused()).toBe(false);
    });

    it('moveSelection works even after unified bar re-render', () => {
      setupShellWithThreads(5);
      // Simulate updateUnifiedBar re-rendering the slot
      const slot = document.getElementById('unified-bar-slot')!;
      slot.innerHTML = renderUnifiedBar({ mode: 'inbox' });

      // Keyboard nav should still work
      moveSelection(1);
      expect(state.selectedThreadId).toBe('th_1');
      moveSelection(1);
      expect(state.selectedThreadId).toBe('th_2');
    });

    it('moveSelection works after switching from folder mode back to inbox', () => {
      setupShellWithThreads(5);
      const slot = document.getElementById('unified-bar-slot')!;

      // Simulate: was in folder mode
      slot.innerHTML = renderUnifiedBar({ mode: 'folder', folderName: 'Updates', folderColor: '#888', folderCount: 5 });

      // Then switched back to inbox
      slot.innerHTML = renderUnifiedBar({ mode: 'inbox' });

      moveSelection(1);
      expect(state.selectedThreadId).toBe('th_1');
    });
  });
});
