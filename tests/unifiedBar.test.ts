// unifiedBar.test.ts — TDD RED: Unified context bar replaces toolbar + reader-header + folder-header
import { describe, it, expect, beforeEach } from 'vitest';

// The module under test — will not exist yet (RED phase)
import {
  renderUnifiedBar,
  type UnifiedBarMode,
  type UnifiedBarState,
} from '../src/unifiedBar';

function createDOM(html: string): HTMLElement {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

describe('UnifiedBar', () => {
  describe('Inbox mode (default)', () => {
    let container: HTMLElement;

    beforeEach(() => {
      const state: UnifiedBarState = { mode: 'inbox' };
      container = createDOM('');
      container.innerHTML = renderUnifiedBar(state);
    });

    it('renders a single .unified-bar element', () => {
      expect(container.querySelector('.unified-bar')).not.toBeNull();
    });

    it('has data-mode="inbox"', () => {
      const bar = container.querySelector('.unified-bar') as HTMLElement;
      expect(bar.dataset.mode).toBe('inbox');
    });

    it('shows hamburger button', () => {
      expect(container.querySelector('.btn-hamburger')).not.toBeNull();
    });

    it('shows search toggle', () => {
      expect(container.querySelector('.btn-search-toggle')).not.toBeNull();
    });

    it('shows compose button', () => {
      expect(container.querySelector('.btn-compose')).not.toBeNull();
    });

    it('shows account filter area', () => {
      expect(container.querySelector('.account-filter-wrap')).not.toBeNull();
    });

    it('does NOT show back button', () => {
      expect(container.querySelector('.unified-bar-back')).toBeNull();
    });

    it('does NOT show reader actions', () => {
      expect(container.querySelector('.reader-actions-header')).toBeNull();
    });
  });

  describe('Reader mode (thread open)', () => {
    let container: HTMLElement;

    beforeEach(() => {
      const state: UnifiedBarState = {
        mode: 'reader',
        subject: 'Re: Q3 Budget Review',
      };
      container = createDOM('');
      container.innerHTML = renderUnifiedBar(state);
    });

    it('has data-mode="reader"', () => {
      const bar = container.querySelector('.unified-bar') as HTMLElement;
      expect(bar.dataset.mode).toBe('reader');
    });

    it('shows back button', () => {
      expect(container.querySelector('.unified-bar-back')).not.toBeNull();
    });

    it('shows subject text (inline for desktop)', () => {
      const subject = container.querySelector('.unified-bar-subject-inline');
      expect(subject).not.toBeNull();
      expect(subject!.textContent).toContain('Re: Q3 Budget Review');
    });

    it('shows subject text (phone row)', () => {
      const subject = container.querySelector('.unified-bar-subject-phone');
      expect(subject).not.toBeNull();
      expect(subject!.textContent).toContain('Re: Q3 Budget Review');
    });

    it('shows primary action buttons (archive, pin, prioritize)', () => {
      const actions = container.querySelector('.unified-bar-actions');
      expect(actions).not.toBeNull();
      expect(actions!.querySelector('[data-action="archive"]')).not.toBeNull();
      expect(actions!.querySelector('[data-action="pin"]')).not.toBeNull();
      expect(actions!.querySelector('[data-action="prioritize"]')).not.toBeNull();
    });

    it('shows overflow menu with secondary actions', () => {
      const overflow = container.querySelector('.unified-bar-overflow-menu');
      expect(overflow).not.toBeNull();
      expect(overflow!.querySelector('[data-action="mark-unread"]')).not.toBeNull();
      expect(overflow!.querySelector('[data-action="spam"]')).not.toBeNull();
      expect(overflow!.querySelector('[data-action="move"]')).not.toBeNull();
      expect(overflow!.querySelector('[data-action="followup"]')).not.toBeNull();
    });

    it('does NOT show search toggle', () => {
      expect(container.querySelector('.btn-search-toggle')).toBeNull();
    });

    it('does NOT show compose button', () => {
      expect(container.querySelector('.btn-compose')).toBeNull();
    });

    it('does NOT show hamburger', () => {
      expect(container.querySelector('.btn-hamburger')).toBeNull();
    });
  });

  describe('Folder mode (smart folder active)', () => {
    let container: HTMLElement;

    beforeEach(() => {
      const state: UnifiedBarState = {
        mode: 'folder',
        folderName: 'Newsletters',
        folderColor: '#e74c3c',
        folderCount: 12,
      };
      container = createDOM('');
      container.innerHTML = renderUnifiedBar(state);
    });

    it('has data-mode="folder"', () => {
      const bar = container.querySelector('.unified-bar') as HTMLElement;
      expect(bar.dataset.mode).toBe('folder');
    });

    it('shows back button', () => {
      expect(container.querySelector('.unified-bar-back')).not.toBeNull();
    });

    it('shows folder name', () => {
      const name = container.querySelector('.unified-bar-folder-name');
      expect(name).not.toBeNull();
      expect(name!.textContent).toContain('Newsletters');
    });

    it('shows folder color dot', () => {
      const dot = container.querySelector('.unified-bar-folder-dot') as HTMLElement;
      expect(dot).not.toBeNull();
      expect(dot.style.background).toContain('#e74c3c');
    });

    it('shows thread count', () => {
      const count = container.querySelector('.unified-bar-folder-count');
      expect(count).not.toBeNull();
      expect(count!.textContent).toContain('12');
    });

    it('does NOT show search toggle', () => {
      expect(container.querySelector('.btn-search-toggle')).toBeNull();
    });

    it('does NOT show compose button', () => {
      expect(container.querySelector('.btn-compose')).toBeNull();
    });
  });

  describe('Mode transitions', () => {
    it('switches from inbox to reader', () => {
      const container = createDOM('');
      container.innerHTML = renderUnifiedBar({ mode: 'inbox' });
      expect((container.querySelector('.unified-bar') as HTMLElement).dataset.mode).toBe('inbox');

      container.innerHTML = renderUnifiedBar({ mode: 'reader', subject: 'Test' });
      expect((container.querySelector('.unified-bar') as HTMLElement).dataset.mode).toBe('reader');
      expect(container.querySelector('.unified-bar-back')).not.toBeNull();
    });

    it('switches from reader back to inbox', () => {
      const container = createDOM('');
      container.innerHTML = renderUnifiedBar({ mode: 'reader', subject: 'Test' });
      container.innerHTML = renderUnifiedBar({ mode: 'inbox' });
      expect((container.querySelector('.unified-bar') as HTMLElement).dataset.mode).toBe('inbox');
      expect(container.querySelector('.btn-search-toggle')).not.toBeNull();
    });

    it('switches from inbox to folder', () => {
      const container = createDOM('');
      container.innerHTML = renderUnifiedBar({ mode: 'inbox' });
      container.innerHTML = renderUnifiedBar({ mode: 'folder', folderName: 'Work', folderColor: '#333', folderCount: 5 });
      expect((container.querySelector('.unified-bar') as HTMLElement).dataset.mode).toBe('folder');
      expect(container.querySelector('.unified-bar-folder-name')!.textContent).toContain('Work');
    });
  });
});
