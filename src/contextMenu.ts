import { type Thread, unmuteThread, addGroupedSender, removeGroupedSender, addGroupedDomain, removeGroupedDomain } from './gmail';
import { setStatus } from './helpers';
import { doMarkRead, doMarkUnread, doToggleStar, doArchive, doBlock, doUnsnooze, doMute, type ActionDeps } from './actions';
import { openSnoozePicker } from './snooze';
import { icon } from './icons';
import { state } from './state';

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
    items.push({ label: `${icon.snooze('16px')}  Snooze…`, action: () => { menu.remove(); openSnoozePicker(t, row); }, cls: 'ctx-menu-item--snooze' });
  } else {
    items.push({ label: `${icon.unsnooze('16px')}  Wake up now`, action: () => { menu.remove(); doUnsnooze(t, row, deps); }, cls: 'ctx-menu-item--snooze' });
  }
  items.push({ label: `${t.isStarred ? icon.star('16px') + '  Unstar' : icon.starOutline('16px') + '  Star'}`, action: () => { menu.remove(); doToggleStar(t, row); } });
  items.push({ label: `${icon.emailOpen('16px')}  Mark as unread`, action: () => { menu.remove(); doMarkUnread(t, row); } });
  items.push('divider');
  items.push({ label: `${icon.archive('16px')}  Archive`, action: () => { menu.remove(); doArchive(t, row, deps); } });
  items.push({ label: `${icon.check('16px')}  Mark read`, action: () => { menu.remove(); doMarkRead(t, row, deps); } });
  items.push({ label: t.isMuted ? `${icon.bell('16px')}  Unmute thread` : `${icon.mute('16px')}  Mute thread`, action: () => {
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
  const isGrouped = state.groupedSenders.includes(t.senderEmail);
  items.push({ label: `${icon.tag('16px')}  ${isGrouped ? 'Ungroup' : 'Group'} emails from ${t.senderName || t.senderEmail}`, action: () => {
    menu.remove();
    const accountId = state.account?.id;
    if (!accountId) return;
    if (isGrouped) {
      state.groupedSenders = state.groupedSenders.filter(e => e !== t.senderEmail);
      deps.renderInbox();
      removeGroupedSender(accountId, t.senderEmail).catch(() => setStatus('Ungroup failed'));
    } else {
      state.groupedSenders = [...state.groupedSenders, t.senderEmail];
      deps.renderInbox();
      addGroupedSender(accountId, t.senderEmail).catch(() => setStatus('Group failed'));
    }
  }});
  const senderDomain = t.senderEmail.split('@')[1] ?? '';
  if (senderDomain) {
    const isDomainGrouped = state.groupedDomains.includes(senderDomain);
    items.push({ label: `${icon.globe('16px')}  ${isDomainGrouped ? 'Ungroup' : 'Group'} emails from ${senderDomain}`, action: () => {
      menu.remove();
      const accountId = state.account?.id;
      if (!accountId) return;
      if (isDomainGrouped) {
        state.groupedDomains = state.groupedDomains.filter(d => d !== senderDomain);
        deps.renderInbox();
        removeGroupedDomain(accountId, senderDomain).catch(() => setStatus('Ungroup domain failed'));
      } else {
        state.groupedDomains = [...state.groupedDomains, senderDomain];
        deps.renderInbox();
        addGroupedDomain(accountId, senderDomain).catch(() => setStatus('Group domain failed'));
      }
    }});
  }
  items.push({ label: `${icon.shieldBan('16px')}  Block sender`, action: () => { menu.remove(); doBlock(t, row, deps); }, cls: 'ctx-menu-item--danger' });

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
