import { type Thread, loadSnoozedThreads, loadStarredThreads, groupBySection } from './gmail';
import { type ScheduledEmail, loadScheduled, cancelScheduled } from './scheduledSend';
import { type InboxTab, state } from './state';
import { type ActionDeps, doMarkRead, doMarkUnread, doToggleStar, doArchive, doTrash, doBlock, doUnsnooze } from './actions';
import { openSnoozePicker } from './snooze';
import { showContextMenu } from './contextMenu';
import { avatarHtml, ACCOUNT_BADGE_COLORS } from './avatar';
import { getActiveReminderThreadIds } from './followupReminders';
import { esc, formatDate } from './helpers';
import { isSearchActive, getSearchQuery, getFilteredThreads, highlightText, dismissSearchBar } from './search';

export interface ThreadListDeps {
  openThread: (t: Thread) => void;
  openInlineReply: (t: Thread, row: HTMLElement) => void;
  toggleBulkSelection: (id: string) => void;
  removeBulkBar: () => void;
  updateBulkBar: () => void;
  getActionDeps: () => ActionDeps;
  renderInbox: () => void;
  renderScheduledView: () => void;
  isKnownSender: (email: string) => boolean;
  applyFocusFilter: (list: Thread[]) => { visible: Thread[]; hiddenCount: number };
}

export function threadRow(t: Thread, isSnoozed: boolean): string {
  const date = formatDate(t.receivedAt);
  const sender = t.senderName || t.senderEmail;
  const attachment = t.hasAttachment ? `<span class="attachment-icon" title="Has attachment">📎</span>` : '';
  const dot = `<span class="unread-dot${t.isUnread ? ' filled' : ''}"></span>`;
  const searchQ = isSearchActive() ? getSearchQuery() : '';

  const acctIdx = state.unifiedMode ? state.accounts.findIndex(a => a.id === t.accountId) : -1;
  const acctBadge = acctIdx >= 0
    ? `<span class="account-badge" style="background:${ACCOUNT_BADGE_COLORS[acctIdx % ACCOUNT_BADGE_COLORS.length]}" title="${esc(state.accounts[acctIdx]?.email ?? '')}">${(state.accounts[acctIdx]?.email[0] ?? '?').toUpperCase()}</span>`
    : '';

  const clockIndicator = t.snoozedUntil
    ? `<span class="snooze-badge" title="Snoozed until ${formatDate(t.snoozedUntil)}">🕐 ${formatDate(t.snoozedUntil)}</span>`
    : '';

  const hasReminder = getActiveReminderThreadIds().has(t.id);

  const starClass = t.isStarred ? 'btn-star starred' : 'btn-star';

  const actionsHtml = isSnoozed
    ? `<div class="thread-actions">
         <button class="btn-action btn-unsnooze" title="Wake up now">↑</button>
         <button class="btn-action btn-archive" title="Archive">⬇</button>
       </div>`
    : `<div class="thread-actions">
         <button class="btn-action btn-archive" title="Archive">📥</button>
         <button class="btn-action btn-trash" title="Trash">🗑</button>
         <button class="btn-action btn-snooze" title="Snooze">⏰</button>
         <button class="btn-action ${starClass}" title="${t.isStarred ? 'Unstar' : 'Star'}">${t.isStarred ? '★' : '☆'}</button>
       </div>`;

  const bulkCheckbox = state.bulkMode
    ? `<input type="checkbox" class="bulk-checkbox" ${state.selectedIds.has(t.id) ? 'checked' : ''} aria-label="Select thread" />`
    : '';

  return `
    <div class="thread-row${t.isUnread ? ' unread' : ''}${isSnoozed ? ' snoozed-row' : ''}${t.isStarred ? ' is-starred' : ''}${hasReminder ? ' awaiting-reply' : ''}${state.bulkMode && state.selectedIds.has(t.id) ? ' bulk-selected' : ''}${state.bulkMode ? ' bulk-mode' : ''}" data-id="${t.id}">
      ${bulkCheckbox}
      ${dot}
      <div class="avatar-wrap">
        ${avatarHtml(t)}
        ${acctBadge}
      </div>
      <div class="thread-mid${attachment ? ' has-attachment' : ''}">
        <div class="thread-top">
          <span class="thread-sender">${searchQ ? highlightText(sender, searchQ) : esc(sender)}</span>
          <span class="thread-date">${date}</span>
        </div>
        <div class="thread-subject-line">${searchQ ? highlightText(t.subject, searchQ) : esc(t.subject)}${t.messageCount && t.messageCount > 1 ? `<span class="thread-count">${t.messageCount}</span>` : ''}</div>
        <div class="thread-preview-line">${clockIndicator || esc(t.snippet)}</div>
      </div>
      ${actionsHtml}
    </div>`;
}

export function wireInboxTabs(container: HTMLElement, renderInbox: () => void) {
  container.querySelectorAll('.inbox-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeInboxTab = (btn as HTMLElement).dataset.tab as InboxTab;
      localStorage.setItem('kept_inbox_tab', state.activeInboxTab);
      renderInbox();
    });
  });
}

export function renderInbox(deps: ThreadListDeps) {
  const container = document.getElementById('inbox');
  if (!container) return;

  // Preserve search bar across re-renders
  const existingBar = document.getElementById('search-bar');
  const searchBarHtml = existingBar ? existingBar.outerHTML : null;
  const searchValue = existingBar
    ? (existingBar.querySelector<HTMLInputElement>('#search-bar-input')?.value ?? '')
    : '';

  if (state.threads.length === 0 && state.syncing) {
    container.innerHTML = `<p class="sync-loading">Syncing inbox…</p>`;
    if (searchBarHtml) prependSearchBar(container, searchBarHtml, searchValue, deps);
    return;
  }

  const { visible: focusedThreads, hiddenCount } = deps.applyFocusFilter(state.threads);

  let tabFiltered = focusedThreads;
  if (state.activeInboxTab === 'important') {
    tabFiltered = focusedThreads.filter(t => deps.isKnownSender(t.senderEmail));
  } else if (state.activeInboxTab === 'other') {
    tabFiltered = focusedThreads.filter(t => !deps.isKnownSender(t.senderEmail));
  }

  // Apply inline search filter on top of other filters
  const searchFiltered = isSearchActive() ? getFilteredThreads(tabFiltered) : tabFiltered;

  const importantCount = focusedThreads.filter(t => deps.isKnownSender(t.senderEmail) && t.isUnread).length;
  const otherCount = focusedThreads.filter(t => !deps.isKnownSender(t.senderEmail) && t.isUnread).length;

  const tabBar = isSearchActive() ? '' : `<div class="inbox-tabs">
    <button class="inbox-tab${state.activeInboxTab === 'all' ? ' active' : ''}" data-tab="all">All</button>
    <button class="inbox-tab${state.activeInboxTab === 'important' ? ' active' : ''}" data-tab="important">Important${importantCount ? ` <span class="tab-badge">${importantCount}</span>` : ''}</button>
    <button class="inbox-tab${state.activeInboxTab === 'other' ? ' active' : ''}" data-tab="other">Other${otherCount ? ` <span class="tab-badge">${otherCount}</span>` : ''}</button>
  </div>`;

  if (searchFiltered.length === 0) {
    const emptyText = isSearchActive() && getSearchQuery().trim()
      ? 'No results'
      : state.searchQuery ? 'No results'
      : state.focusMode ? 'No messages from known senders'
      : state.activeInboxTab === 'important' ? 'No important emails'
      : state.activeInboxTab === 'other' ? 'No other emails'
      : 'All caught up';
    container.innerHTML = tabBar + `
      <div class="empty-state">
        <div class="icon" style="color:var(--text-muted)">✉</div>
        <div class="empty-text">${emptyText}</div>
        ${state.focusMode && hiddenCount > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${hiddenCount} thread${hiddenCount !== 1 ? 's' : ''} hidden by Focus</div>` : ''}
      </div>`;
    if (!isSearchActive()) wireInboxTabs(container, deps.renderInbox);
    if (searchBarHtml) prependSearchBar(container, searchBarHtml, searchValue, deps);
    return;
  }

  const focusBanner = state.focusMode && hiddenCount > 0 && !isSearchActive()
    ? `<div class="focus-banner">Focus mode — ${hiddenCount} thread${hiddenCount !== 1 ? 's' : ''} hidden</div>`
    : '';

  let html: string;
  if (isSearchActive() && getSearchQuery().trim()) {
    // Flat list — no sections while searching
    html = tabBar + focusBanner + searchFiltered.map(t => threadRow(t, false)).join('');
  } else {
    const sections = groupBySection(searchFiltered);
    html = tabBar + focusBanner + sections.map(s => {
      const unread = s.threads.filter(t => t.isUnread).length;
      const badge = unread > 0 ? ` <span class="section-badge">${unread}</span>` : '';
      return `
      <div class="section-header">${s.label}${badge}</div>
      ${s.threads.map(t => threadRow(t, false)).join('')}
    `;
    }).join('');
  }

  container.innerHTML = html;
  if (!isSearchActive()) wireInboxTabs(container, deps.renderInbox);
  wireThreadRows(container, searchFiltered, false, deps);
  if (state.bulkMode) deps.updateBulkBar();
  if (state.selectedThreadId) {
    const row = container.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
    if (row) row.classList.add('is-selected');
    else state.selectedThreadId = null;
  }

  if (searchBarHtml) prependSearchBar(container, searchBarHtml, searchValue, deps);
}

function prependSearchBar(container: HTMLElement, barHtml: string, value: string, _deps: ThreadListDeps) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = barHtml;
  const bar = tempDiv.firstElementChild as HTMLElement;
  if (!bar) return;

  const input = bar.querySelector<HTMLInputElement>('#search-bar-input');
  if (input) input.value = value;

  container.prepend(bar);

  // Update count label
  const countEl = bar.querySelector<HTMLElement>('#search-count');
  if (countEl && value.trim()) {
    const results = getFilteredThreads(state.threads);
    countEl.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
  }

  // Re-wire close button
  bar.querySelector('#search-close')?.addEventListener('click', () => {
    dismissSearchBar();
  });
}

export async function renderSnoozedView(deps: ThreadListDeps) {
  const container = document.getElementById('inbox');
  if (!container || !state.account) return;

  const snoozed = await loadSnoozedThreads(state.account.id);

  if (snoozed.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--lavender-accent)">🕐</div>
        <div class="empty-text">No snoozed threads</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Snoozed mail will appear here</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header">Snoozed <span class="section-badge">${snoozed.length}</span></div>
    ${snoozed.map(t => threadRow(t, true)).join('')}
  `;

  wireThreadRows(container, snoozed, true, deps);
}

export async function renderStarredView(deps: ThreadListDeps) {
  const container = document.getElementById('inbox');
  if (!container || !state.account) return;

  const starred = await loadStarredThreads(state.account.id);

  if (starred.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--lavender-accent)">★</div>
        <div class="empty-text">No starred threads</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Star a thread with s or ☆ to save it here</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header">Starred <span class="section-badge">${starred.length}</span></div>
    ${starred.map(t => threadRow(t, false)).join('')}
  `;

  wireThreadRows(container, starred, false, deps);
}

export async function renderScheduledView() {
  const container = document.getElementById('inbox');
  if (!container) return;

  const scheduled: ScheduledEmail[] = loadScheduled();

  if (scheduled.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="color:var(--lavender-accent)">⏰</div>
        <div class="empty-text">No scheduled sends</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Emails you schedule will appear here</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-header">Scheduled <span class="section-badge">${scheduled.length}</span></div>
    ${scheduled.map(e => `
      <div class="thread-row" data-sched-id="${esc(e.id)}">
        <div class="thread-mid">
          <div class="thread-top">
            <span class="thread-sender">${esc(e.to)}</span>
            <span class="thread-date">${formatDate(e.scheduledAt)}</span>
          </div>
          <div class="thread-subject-line">${esc(e.subject)}</div>
          <div class="thread-preview-line">⏰ Sends ${formatDate(e.scheduledAt)}</div>
        </div>
        <div class="thread-actions">
          <button class="btn-action danger btn-cancel-sched" title="Cancel scheduled send">✕</button>
        </div>
      </div>`).join('')}
  `;

  container.querySelectorAll<HTMLButtonElement>('.btn-cancel-sched').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const row = btn.closest<HTMLElement>('.thread-row')!;
      const id = row.dataset.schedId!;
      cancelScheduled(id);
      renderScheduledView();
    });
  });
}

export function wireThreadRows(container: HTMLElement, list: Thread[], isSnoozed: boolean, deps: ThreadListDeps) {
  container.querySelectorAll<HTMLElement>('.thread-row').forEach(row => {
    const id = row.dataset.id!;
    const t = list.find(x => x.id === id);
    if (!t) return;
    row.querySelector<HTMLElement>('.avatar-wrap')?.addEventListener('click', e => {
      e.stopPropagation();
      if (!state.bulkMode) state.bulkMode = true;
      deps.toggleBulkSelection(t.id);
      if (state.selectedIds.size === 0) {
        state.bulkMode = false;
        deps.removeBulkBar();
        deps.renderInbox();
      }
    });
    row.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.thread-actions')) return;
      if ((e.target as HTMLElement).closest('.avatar-wrap')) return;
      if (state.bulkMode) {
        deps.toggleBulkSelection(t.id);
        return;
      }
      deps.openThread(t);
    });
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, t, row, isSnoozed, deps.getActionDeps());
    });
    row.querySelector('.btn-read')?.addEventListener('click', e => { e.stopPropagation(); doMarkRead(t, row, deps.getActionDeps()); });
    row.querySelector('.btn-mark-unread')?.addEventListener('click', e => { e.stopPropagation(); doMarkUnread(t, row); });
    row.querySelector('.btn-star')?.addEventListener('click', e => { e.stopPropagation(); doToggleStar(t, row); });
    row.querySelector('.btn-archive')?.addEventListener('click', e => { e.stopPropagation(); doArchive(t, row, deps.getActionDeps()); });
    row.querySelector('.btn-trash')?.addEventListener('click', e => { e.stopPropagation(); doTrash(t, row, deps.getActionDeps()); });
    row.querySelector('.btn-block')?.addEventListener('click', e => { e.stopPropagation(); doBlock(t, row, deps.getActionDeps()); });
    row.querySelector('.btn-reply')?.addEventListener('click', e => { e.stopPropagation(); deps.openInlineReply(t, row); });
    if (isSnoozed) {
      row.querySelector('.btn-unsnooze')?.addEventListener('click', e => { e.stopPropagation(); doUnsnooze(t, row, deps.getActionDeps()); });
    } else {
      row.querySelector('.btn-snooze')?.addEventListener('click', e => { e.stopPropagation(); openSnoozePicker(t, row); });
    }

    const archiveBg = document.createElement('div');
    archiveBg.className = 'swipe-bg swipe-bg-archive';
    archiveBg.innerHTML = '<span class="swipe-bg-icon">📥</span>';
    const snoozeBg = document.createElement('div');
    snoozeBg.className = 'swipe-bg swipe-bg-snooze';
    snoozeBg.innerHTML = '<span class="swipe-bg-icon">🕐</span>';
    row.prepend(archiveBg, snoozeBg);

    let touchStartX = 0;
    let touchStartY = 0;
    let swipeActive = false;
    let rafId = 0;

    const THRESHOLD = 100;
    const ICON_SHOW = 60;

    row.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      swipeActive = false;
    }, { passive: true });

    row.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;

      if (!swipeActive && Math.abs(dy) > Math.abs(dx)) return;
      swipeActive = true;

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const absDx = Math.abs(dx);
        const isRight = dx > 0;

        row.style.transform = `translateX(${dx}px)`;
        row.classList.add('swiping');

        archiveBg.style.opacity = isRight ? String(Math.min(absDx / THRESHOLD, 1)) : '0';
        snoozeBg.style.opacity = !isRight ? String(Math.min(absDx / THRESHOLD, 1)) : '0';

        const archiveIcon = archiveBg.querySelector<HTMLElement>('.swipe-bg-icon')!;
        const snoozeIcon = snoozeBg.querySelector<HTMLElement>('.swipe-bg-icon')!;
        archiveIcon.classList.toggle('visible', isRight && absDx >= ICON_SHOW);
        snoozeIcon.classList.toggle('visible', !isRight && absDx >= ICON_SHOW);
      });
    }, { passive: true });

    row.addEventListener('touchend', e => {
      cancelAnimationFrame(rafId);
      if (!swipeActive) return;

      const dx = e.changedTouches[0].clientX - touchStartX;
      const absDx = Math.abs(dx);

      row.classList.remove('swiping');
      archiveBg.style.opacity = '0';
      snoozeBg.style.opacity = '0';
      archiveBg.querySelector<HTMLElement>('.swipe-bg-icon')!.classList.remove('visible');
      snoozeBg.querySelector<HTMLElement>('.swipe-bg-icon')!.classList.remove('visible');

      if (absDx >= THRESHOLD) {
        if (dx > 0) {
          row.style.transform = '';
          doArchive(t, row, deps.getActionDeps());
        } else {
          row.style.transform = '';
          openSnoozePicker(t, row);
        }
      } else {
        row.style.transition = 'transform 0.2s ease';
        row.style.transform = '';
        row.addEventListener('transitionend', () => { row.style.transition = ''; }, { once: true });
      }

      swipeActive = false;
    }, { passive: true });
  });
}
