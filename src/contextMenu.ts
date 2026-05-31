import { type Thread, unmuteThread } from './gmail';
import { setStatus } from './helpers';
import { doMarkRead, doMarkUnread, doToggleStar, doArchive, doBlock, doUnsnooze, doMute, type ActionDeps } from './actions';
import { openSnoozePicker } from './snooze';

export function showContextMenu(x: number, y: number, t: Thread, row: HTMLElement, isSnoozed: boolean, deps: ActionDeps) {
  document.getElementById('kept-ctx-menu')?.remove();

  const menu = document.createElement('div');
  menu.id = 'kept-ctx-menu';
  menu.className = 'ctx-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  type MenuItem = { label: string; action: () => void; cls?: string };
  const items: Array<MenuItem | 'divider'> = [];

  if (!isSnoozed) {
    items.push({ label: '🕐  Snooze…', action: () => { menu.remove(); openSnoozePicker(t, row); }, cls: 'ctx-menu-item--snooze' });
  } else {
    items.push({ label: '↑  Wake up now', action: () => { menu.remove(); doUnsnooze(t, row, deps); }, cls: 'ctx-menu-item--snooze' });
  }
  items.push({ label: `${t.isStarred ? '★  Unstar' : '☆  Star'}`, action: () => { menu.remove(); doToggleStar(t, row); } });
  items.push({ label: '✉  Mark as unread', action: () => { menu.remove(); doMarkUnread(t, row); } });
  items.push('divider');
  items.push({ label: '📂  Archive', action: () => { menu.remove(); doArchive(t, row, deps); } });
  items.push({ label: '✓  Mark read', action: () => { menu.remove(); doMarkRead(t, row, deps); } });
  items.push({ label: t.isMuted ? '🔔  Unmute thread' : '🔇  Mute thread', action: () => {
    menu.remove();
    if (t.isMuted) {
      unmuteThread(t).then(() => {
        t.isMuted = false;
        deps.renderInbox();
      }).catch(() => setStatus('Unmute failed'));
    } else {
      doMute(t, row, deps);
    }
  }});
  items.push('divider');
  items.push({ label: '🚫  Block sender', action: () => { menu.remove(); doBlock(t, row, deps); }, cls: 'ctx-menu-item--danger' });

  const actionItems = items.filter((x): x is MenuItem => x !== 'divider');
  menu.innerHTML = items.map((item) =>
    item === 'divider'
      ? `<hr class="ctx-menu-divider">`
      : `<button class="ctx-menu-item${item.cls ? ' ' + item.cls : ''}" data-action-idx="${actionItems.indexOf(item)}">${item.label}</button>`
  ).join('');

  menu.querySelectorAll<HTMLButtonElement>('.ctx-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = actionItems[parseInt(btn.dataset.actionIdx!)];
      if (item) item.action();
    });
  });

  document.body.appendChild(menu);

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;
  });

  function dismiss(e: MouseEvent | KeyboardEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    if (e instanceof MouseEvent && menu.contains(e.target as Node)) return;
    menu.remove();
    document.removeEventListener('click', dismiss as EventListener);
    document.removeEventListener('keydown', dismiss as EventListener);
  }
  setTimeout(() => {
    document.addEventListener('click', dismiss as EventListener);
    document.addEventListener('keydown', dismiss as EventListener);
  }, 0);
}
