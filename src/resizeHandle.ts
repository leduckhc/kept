// resizeHandle.ts — Draggable pane resizer between thread list and reader pane
// Persists width to localStorage so it survives navigation and restarts.

const STORAGE_KEY = 'kept.threadListWidth';
const MIN_WIDTH = 220;
const MAX_WIDTH = 600;

export function initResizeHandle(): void {
  const inbox = document.querySelector<HTMLElement>('.inbox');
  if (!inbox) return;

  // Restore saved width
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const w = parseInt(saved, 10);
    if (w >= MIN_WIDTH && w <= MAX_WIDTH) {
      inbox.style.width = `${w}px`;
    }
  }

  // Create handle element
  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  handle.setAttribute('aria-label', 'Resize thread list');
  // Insert handle after .inbox (between inbox and reader-pane)
  inbox.parentElement!.insertBefore(handle, inbox.nextSibling);

  let startX = 0;
  let startWidth = 0;
  let dragging = false;

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = inbox!.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.classList.add('active');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + dx));
    inbox!.style.width = `${newWidth}px`;
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.classList.remove('active');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    // Persist
    const currentWidth = inbox!.getBoundingClientRect().width;
    localStorage.setItem(STORAGE_KEY, String(Math.round(currentWidth)));
  }

  handle.addEventListener('mousedown', onMouseDown);
}
