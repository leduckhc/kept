import { type Thread, loadSnoozedThreads, loadStarredThreads, groupBySection, archiveThreads, unarchiveThreads, trashThreads, untrashThreads, loadThreads } from './gmail';
import { type ScheduledEmail, loadScheduled, cancelScheduled } from './scheduledSend';
import { state } from './state';
import { type ActionDeps, doMarkRead, doMarkUnread, doToggleStar, doArchive, doTrash, doBlock, doUnsnooze, accountFor } from './actions';
import { openSnoozePicker } from './snooze';
import { showContextMenu } from './contextMenu';
import { avatarHtml, stackedAvatarsHtml, ACCOUNT_BADGE_COLORS } from './avatar';
import { getActiveReminderThreadIds } from './followupReminders';
import { esc, formatDate } from './helpers';
import { isSearchActive, getSearchQuery, getFilteredThreads, highlightText, dismissSearchBar } from './search';
import { icon } from './icons';
import { showUndoToast } from './toasts';
import { Newspaper, Megaphone } from 'lucide-static';
import { renderNewSendersSection } from './newSenders';

const MAX_INITIAL_RENDER = 100;
const LAZY_CHUNK_SIZE = 50;

export function renderEmptyState(emptyIcon: string, title: string, subtitle: string): string {
  return `<div class="empty-state">
    <div class="empty-state-icon">${emptyIcon}</div>
    <div class="empty-state-title">${title}</div>
    <div class="empty-state-subtitle">${subtitle}</div>
  </div>`;
}

export interface ThreadListDeps {
  openThread: (t: Thread) => void;
  openInlineReply: (t: Thread, row: HTMLElement) => void;
  toggleBulkSelection: (id: string, shiftKey?: boolean) => void;
  removeBulkBar: () => void;
  updateBulkBar: () => void;
  getActionDeps: () => ActionDeps;
  renderInbox: () => void;
  renderScheduledView: () => void;
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
    ? `<span class="snooze-badge" title="Snoozed until ${formatDate(t.snoozedUntil)}">${icon.clock('14px')} ${formatDate(t.snoozedUntil)}</span>`
    : '';

  const hasReminder = getActiveReminderThreadIds().has(t.id);

  const starClass = t.isStarred ? 'btn-star starred' : 'btn-star';

  const actionsHtml = isSnoozed
    ? `<div class="thread-actions">
         <button class="btn-action btn-unsnooze" title="Wake up now">${icon.unsnooze('16px')}</button>
         <button class="btn-action btn-archive" title="Archive">${icon.archive('16px')}</button>
       </div>`
    : `<div class="thread-actions">
         <button class="btn-action btn-archive" title="Archive">${icon.archive('16px')}</button>
         <button class="btn-action btn-trash" title="Trash">${icon.trash('16px')}</button>
         <button class="btn-action btn-snooze" title="Snooze">${icon.snooze('16px')}</button>
         <button class="btn-action ${starClass}" title="${t.isStarred ? 'Unstar' : 'Star'}">${t.isStarred ? icon.star('16px') : icon.starOutline('16px')}</button>
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
      <span class="thread-sender">${searchQ ? highlightText(sender, searchQ) : esc(sender)}</span>
      <div class="thread-mid${attachment ? ' has-attachment' : ''}">
        <span class="thread-subject-line">${searchQ ? highlightText(t.subject, searchQ) : esc(t.subject)}${t.messageCount && t.messageCount > 1 ? `<span class="thread-count">${t.messageCount}</span>` : ''}</span>
        <span class="thread-preview-line">${clockIndicator || esc(t.snippet)}</span>
      </div>
      <span class="thread-date">${date}</span>
      ${actionsHtml}
    </div>`;
}

export function categoryRow(type: 'newsletters' | 'updates', threads: Thread[]): string {
  const label = type === 'newsletters' ? 'Newsletters' : 'Updates';
  const hasUnread = threads.some(t => t.isUnread);

  // Generic category icon
  const categoryIcon = type === 'newsletters'
    ? `<div class="avatar category-avatar" style="background:#7c3aed">${icon.custom(Newspaper, '20px')}</div>`
    : `<div class="avatar category-avatar" style="background:#0891b2">${icon.custom(Megaphone, '20px')}</div>`;

  // Group by sender for badges
  const bySender: Record<string, { name: string; email: string; count: number }> = {};
  for (const t of threads) {
    const key = t.senderEmail;
    if (!bySender[key]) {
      const name = t.senderName || t.senderEmail.split('@')[1] || t.senderEmail;
      bySender[key] = { name, email: t.senderEmail, count: 0 };
    }
    bySender[key].count++;
  }
  const sortedSenders = Object.entries(bySender).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

  const badges = sortedSenders.map(([email, info]) => {
    const domain = email.split('@')[1] ?? '';
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : '';
    const miniAvatar = faviconUrl
      ? `<img class="sender-badge-avatar" src="${faviconUrl}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : '';
    return `<span class="sender-badge" data-sender-email="${esc(email)}">${miniAvatar}${esc(info.name)} <span class="sender-count">#${info.count}</span></span>`;
  }).join('');

  return `<div class="thread-row category-row${hasUnread ? ' unread' : ''}" data-category="${type}">
    <div class="avatar-wrap">${categoryIcon}</div>
    <span class="thread-sender">${label}</span>
    <div class="thread-mid">
      <div class="category-senders">${badges}</div>
    </div>
    <div class="thread-actions category-actions">
      <button class="btn-action btn-archive-all" title="Archive all">${icon.archive('16px')}</button>
      <button class="btn-action btn-trash-all" title="Delete all">${icon.trash('16px')}</button>
      <button class="btn-action btn-read-all" title="Mark all read">${icon.markRead('16px')}</button>
    </div>
  </div>`;
}

export function senderGroupRow(senderEmail: string, senderName: string, threads: Thread[]): string {
  const latest = threads[0]; // threads should be sorted by receivedAt desc
  const hasUnread = threads.some(t => t.isUnread);
  const dot = `<span class="unread-dot${hasUnread ? ' filled' : ''}"></span>`;
  const date = formatDate(latest.receivedAt);
  const displayName = senderName || senderEmail;

  return `<div class="thread-row sender-group-row${hasUnread ? ' unread' : ''}" data-sender-email="${esc(senderEmail)}">
    ${dot}
    <div class="avatar-wrap">${stackedAvatarsHtml(threads, 3)}</div>
    <span class="thread-sender">${esc(displayName)} <span class="sender-group-count">#${threads.length}</span></span>
    <div class="thread-mid">
      <span class="thread-subject-line">${esc(latest.subject)}</span>
      <span class="thread-preview-line">${esc(latest.snippet)}</span>
    </div>
    <span class="thread-date">${date}</span>
    <div class="thread-actions">
      <button class="btn-action btn-archive" title="Archive all">${icon.archive('16px')}</button>
      <button class="btn-action btn-trash" title="Delete all">${icon.trash('16px')}</button>
    </div>
  </div>`;
}

export function domainGroupRow(domain: string, threads: Thread[]): string {
  const latest = threads[0];
  const hasUnread = threads.some(t => t.isUnread);
  const dot = `<span class="unread-dot${hasUnread ? ' filled' : ''}"></span>`;
  const date = formatDate(latest.receivedAt);
  // Show unique sender count for context
  const uniqueSenders = new Set(threads.map(t => t.senderName || t.senderEmail)).size;
  const countLabel = uniqueSenders > 1 ? `${threads.length} from ${uniqueSenders} senders` : `#${threads.length}`;

  return `<div class="thread-row domain-group-row${hasUnread ? ' unread' : ''}" data-domain="${esc(domain)}">
    ${dot}
    <div class="avatar-wrap">${stackedAvatarsHtml(threads, 3)}</div>
    <span class="thread-sender">${esc(domain)} <span class="sender-group-count">${countLabel}</span></span>
    <div class="thread-mid">
      <span class="thread-subject-line">${esc(latest.subject)}</span>
      <span class="thread-preview-line">${esc(latest.snippet)}</span>
    </div>
    <span class="thread-date">${date}</span>
    <div class="thread-actions">
      <button class="btn-action btn-archive" title="Archive all">${icon.archive('16px')}</button>
      <button class="btn-action btn-trash" title="Delete all">${icon.trash('16px')}</button>
    </div>
  </div>`;
}

function filterBackHeader(label: string): string {
  return `<div class="filter-back-header">
    <button class="btn-filter-back">${icon.arrowLeft('18px')}</button>
    <span class="filter-label">${esc(label)}</span>
  </div>`;
}

/** Attempt in-place DOM patching for minor changes. Returns true if patched, false to fall back to full rebuild. */
function patchThreadList(container: HTMLElement, newThreads: Thread[]): boolean {
  const existingRows = new Map<string, HTMLElement>();
  container.querySelectorAll<HTMLElement>('.thread-row[data-id]').forEach(el => {
    existingRows.set(el.getAttribute('data-id')!, el);
  });

  if (existingRows.size === 0) return false;

  const newIds = new Set(newThreads.map(t => t.id));
  const addedCount = newThreads.filter(t => !existingRows.has(t.id)).length;
  const removedCount = [...existingRows.keys()].filter(id => !newIds.has(id)).length;

  // If more than 50% rows changed, full rebuild is cheaper
  if (addedCount + removedCount > Math.max(newThreads.length * 0.5, 10)) {
    return false;
  }

  // Remove stale rows
  for (const [id, row] of existingRows) {
    if (!newIds.has(id)) {
      row.remove();
    }
  }

  // Update existing rows' state
  for (const t of newThreads) {
    const existing = existingRows.get(t.id);
    if (existing) {
      const wasUnread = existing.classList.contains('unread');
      const wasStarred = existing.classList.contains('is-starred');
      if (wasUnread !== t.isUnread) existing.classList.toggle('unread', t.isUnread);
      if (wasStarred !== t.isStarred) existing.classList.toggle('is-starred', t.isStarred);
      existing.classList.toggle('is-selected', t.id === state.selectedThreadId);
      // Update snippet if changed
      const snippetEl = existing.querySelector('.thread-preview-line');
      if (snippetEl && !t.snoozedUntil) {
        const newSnippet = esc(t.snippet);
        if (snippetEl.textContent !== t.snippet) {
          snippetEl.innerHTML = newSnippet;
        }
      }
    }
  }

  return true;
}

export function renderInbox(deps: ThreadListDeps) {
  const container = document.getElementById('inbox');
  if (!container) return;

  // Filtered view mode (category, sender, or domain filter)
  if (state.categoryFilter || state.senderFilter || state.domainFilter) {
    const filterLabel = state.categoryFilter
      ? (state.categoryFilter === 'newsletters' ? 'Newsletters' : 'Updates')
      : state.domainFilter
        ? state.domainFilter
        : state.senderFilter!;
    const filtered = state.threads.filter(t => {
      if (state.categoryFilter) return t.category === state.categoryFilter;
      if (state.senderFilter) return t.senderEmail === state.senderFilter;
      if (state.domainFilter) return t.senderEmail.endsWith('@' + state.domainFilter);
      return true;
    });
    container.innerHTML = filterBackHeader(filterLabel) + filtered.map(t => threadRow(t, false)).join('');
    container.querySelector('.btn-filter-back')?.addEventListener('click', () => {
      state.categoryFilter = null;
      state.senderFilter = null;
      state.domainFilter = null;
      deps.renderInbox();
    });
    wireThreadRows(container, filtered, false, deps);
    return;
  }

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

  // Apply inline search filter
  const searchFiltered = isSearchActive() ? getFilteredThreads(focusedThreads) : focusedThreads;

  if (searchFiltered.length === 0) {
    let emptyTitle: string;
    let emptySubtitle: string;
    let emptyIcon: string;
    if (isSearchActive() && getSearchQuery().trim()) {
      emptyIcon = '🔍'; emptyTitle = 'No results'; emptySubtitle = 'Try a different search term.';
    } else if (state.searchQuery) {
      emptyIcon = '🔍'; emptyTitle = 'No results'; emptySubtitle = 'Try a different search term.';
    } else if (state.focusMode) {
      emptyIcon = '◎'; emptyTitle = 'No messages from known senders';
      emptySubtitle = hiddenCount > 0 ? `${hiddenCount} thread${hiddenCount !== 1 ? 's' : ''} hidden by Focus` : 'Focus mode is on.';
    } else {
      emptyIcon = '🎉'; emptyTitle = 'All caught up'; emptySubtitle = 'No new messages. Go enjoy your day.';
    }
    container.innerHTML = renderEmptyState(emptyIcon, emptyTitle, emptySubtitle);
    if (searchBarHtml) prependSearchBar(container, searchBarHtml, searchValue, deps);
    return;
  }

  const focusBanner = state.focusMode && hiddenCount > 0 && !isSearchActive()
    ? `<div class="focus-banner">Focus mode — ${hiddenCount} thread${hiddenCount !== 1 ? 's' : ''} hidden</div>`
    : '';

  let html: string;
  if (isSearchActive() && getSearchQuery().trim()) {
    // Flat list — no sections while searching
    html = focusBanner + searchFiltered.map(t => threadRow(t, false)).join('');
  } else {
    const sections = groupBySection(searchFiltered, state.groupedSenders, state.groupedDomains);

    // Try incremental DOM patching first (skip if searching or focus banner changed)
    const allThreads = sections.flatMap(s => s.threads);
    if (container.children.length > 0 && !focusBanner && patchThreadList(container, allThreads)) {
      // Patched in place — just update selection highlight
      container.querySelectorAll<HTMLElement>('.thread-row.is-selected').forEach(el => el.classList.remove('is-selected'));
      if (state.selectedThreadId) {
        const row = container.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
        if (row) row.classList.add('is-selected');
      }
      if (state.bulkMode) deps.updateBulkBar();
      if (searchBarHtml) prependSearchBar(container, searchBarHtml, searchValue, deps);
      renderNewSendersSection(container, deps.getActionDeps(), deps.openThread);
      return;
    }

    html = focusBanner + sections.map(s => {
      const unread = s.threads.filter(t => t.isUnread).length;
      const badge = unread > 0 ? ` <span class="section-badge">${unread}</span>` : '';

      // Category rows (only in Today section)
      let categoryHtml = '';
      if (s.categoryThreads) {
        if (s.categoryThreads.newsletters.length > 0) {
          categoryHtml += categoryRow('newsletters', s.categoryThreads.newsletters);
        }
        if (s.categoryThreads.updates.length > 0) {
          categoryHtml += categoryRow('updates', s.categoryThreads.updates);
        }
      }

      // Sender group rows
      let senderGroupHtml = '';
      if (s.senderGroups) {
        for (const [email, groupThreads] of Object.entries(s.senderGroups)) {
          if (groupThreads.length > 0) {
            const name = groupThreads[0].senderName || email;
            senderGroupHtml += senderGroupRow(email, name, groupThreads);
          }
        }
      }

      // Domain group rows
      let domainGroupHtml = '';
      if (s.domainGroups) {
        for (const [domain, groupThreads] of Object.entries(s.domainGroups)) {
          if (groupThreads.length > 0) {
            domainGroupHtml += domainGroupRow(domain, groupThreads);
          }
        }
      }

      return `
      <div class="section-header">${s.label}${badge}</div>
      ${categoryHtml}
      ${senderGroupHtml}
      ${domainGroupHtml}
      ${s.threads.map(t => threadRow(t, false)).join('')}
    `;
    }).join('');
  }

  // Capped initial render for large lists (Fix 3)
  const rowHtmls = html.split(/(?=<div class="thread-row)/);
  if (rowHtmls.length > MAX_INITIAL_RENDER) {
    container.innerHTML = rowHtmls.slice(0, MAX_INITIAL_RENDER).join('');
    let loaded = MAX_INITIAL_RENDER;
    const loadMore = () => {
      if (loaded >= rowHtmls.length) return;
      const chunk = rowHtmls.slice(loaded, loaded + LAZY_CHUNK_SIZE).join('');
      container.insertAdjacentHTML('beforeend', chunk);
      const newRows = container.querySelectorAll<HTMLElement>('.thread-row[data-id]:not([data-wired])');
      wireNewRows(newRows, searchFiltered, false, deps);
      loaded += LAZY_CHUNK_SIZE;
      if (loaded < rowHtmls.length) {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(loadMore);
        } else {
          setTimeout(loadMore, 16);
        }
      }
    };
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(loadMore);
    } else {
      setTimeout(loadMore, 16);
    }
  } else {
    container.innerHTML = html;
  }
  wireThreadRows(container, searchFiltered, false, deps);
  wireCategoryAndGroupRows(container, deps);
  if (state.bulkMode) deps.updateBulkBar();
  if (state.selectedThreadId) {
    const row = container.querySelector<HTMLElement>(`.thread-row[data-id="${state.selectedThreadId}"]`);
    if (row) row.classList.add('is-selected');
    else state.selectedThreadId = null;
  }

  if (searchBarHtml) prependSearchBar(container, searchBarHtml, searchValue, deps);

  // Render new senders section above thread list
  renderNewSendersSection(container, deps.getActionDeps(), deps.openThread);
}

export function wireCategoryAndGroupRows(container: HTMLElement, deps: ThreadListDeps) {
  // Wire category rows
  container.querySelectorAll<HTMLElement>('.category-row').forEach(row => {
    const cat = row.dataset.category;
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.category-actions')) return;
      if ((e.target as HTMLElement).closest('.sender-badge')) return;
      state.categoryFilter = cat ?? null;
      deps.renderInbox();
    });
    // Sender badges inside category rows
    row.querySelectorAll<HTMLElement>('.sender-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const email = badge.dataset.senderEmail;
        if (email) {
          state.senderFilter = email;
          deps.renderInbox();
        }
      });
    });
    // Archive all threads in this category (batched)
    row.querySelector('.btn-archive-all')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const categoryThreads = state.threads.filter(t => t.category === cat);
      if (categoryThreads.length === 0) return;
      const acct = accountFor(categoryThreads[0]);
      if (!acct) return;
      // Optimistic UI + immediate undo toast
      state.threads = state.threads.filter(t => t.category !== cat);
      deps.renderInbox();
      showUndoToast(`Archived ${categoryThreads.length} ${cat}`, async () => {
        await unarchiveThreads(acct, categoryThreads).catch(() => {});
        state.threads = state.account ? await loadThreads(state.account.id) : [];
        deps.renderInbox();
      });
      // Fire API in background (non-blocking)
      archiveThreads(acct, categoryThreads).catch(err => console.error('Batch archive failed:', err));
    });
    // Delete all threads in this category (batched)
    row.querySelector('.btn-trash-all')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const categoryThreads = state.threads.filter(t => t.category === cat);
      if (categoryThreads.length === 0) return;
      const acct = accountFor(categoryThreads[0]);
      if (!acct) return;
      state.threads = state.threads.filter(t => t.category !== cat);
      deps.renderInbox();
      showUndoToast(`Deleted ${categoryThreads.length} ${cat}`, async () => {
        await untrashThreads(acct, categoryThreads).catch(() => {});
        state.threads = state.account ? await loadThreads(state.account.id) : [];
        deps.renderInbox();
      });
      trashThreads(acct, categoryThreads).catch(err => console.error('Batch trash failed:', err));
    });
  });

  // Wire sender group rows
  container.querySelectorAll<HTMLElement>('.sender-group-row').forEach(row => {
    const email = row.dataset.senderEmail;
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.thread-actions')) return;
      if (email) {
        state.senderFilter = email;
        deps.renderInbox();
      }
    });
    // Batch archive for sender group
    row.querySelector('.btn-archive')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!email) return;
      const senderThreads = state.threads.filter(t => t.senderEmail === email);
      if (senderThreads.length === 0) return;
      const acct = accountFor(senderThreads[0]);
      if (!acct) return;
      state.threads = state.threads.filter(t => t.senderEmail !== email);
      deps.renderInbox();
      showUndoToast(`Archived ${senderThreads.length} from ${senderThreads[0].senderName || email}`, async () => {
        await unarchiveThreads(acct, senderThreads).catch(() => {});
        state.threads = state.account ? await loadThreads(state.account.id) : [];
        deps.renderInbox();
      });
      archiveThreads(acct, senderThreads).catch(err => console.error('Batch archive failed:', err));
    });
    // Batch trash for sender group
    row.querySelector('.btn-trash')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!email) return;
      const senderThreads = state.threads.filter(t => t.senderEmail === email);
      if (senderThreads.length === 0) return;
      const acct = accountFor(senderThreads[0]);
      if (!acct) return;
      state.threads = state.threads.filter(t => t.senderEmail !== email);
      deps.renderInbox();
      showUndoToast(`Deleted ${senderThreads.length} from ${senderThreads[0].senderName || email}`, async () => {
        await untrashThreads(acct, senderThreads).catch(() => {});
        state.threads = state.account ? await loadThreads(state.account.id) : [];
        deps.renderInbox();
      });
      trashThreads(acct, senderThreads).catch(err => console.error('Batch trash failed:', err));
    });
  });

  // Wire domain group rows
  container.querySelectorAll<HTMLElement>('.domain-group-row').forEach(row => {
    const domain = row.dataset.domain;
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.thread-actions')) return;
      if (domain) {
        state.domainFilter = domain;
        deps.renderInbox();
      }
    });
    // Batch archive for domain group
    row.querySelector('.btn-archive')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!domain) return;
      const domainThreads = state.threads.filter(t => t.senderEmail.endsWith('@' + domain));
      if (domainThreads.length === 0) return;
      const acct = accountFor(domainThreads[0]);
      if (!acct) return;
      state.threads = state.threads.filter(t => !t.senderEmail.endsWith('@' + domain));
      deps.renderInbox();
      showUndoToast(`Archived ${domainThreads.length} from ${domain}`, async () => {
        await unarchiveThreads(acct, domainThreads).catch(() => {});
        state.threads = state.account ? await loadThreads(state.account.id) : [];
        deps.renderInbox();
      });
      archiveThreads(acct, domainThreads).catch(err => console.error('Batch archive failed:', err));
    });
    // Batch trash for domain group
    row.querySelector('.btn-trash')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!domain) return;
      const domainThreads = state.threads.filter(t => t.senderEmail.endsWith('@' + domain));
      if (domainThreads.length === 0) return;
      const acct = accountFor(domainThreads[0]);
      if (!acct) return;
      state.threads = state.threads.filter(t => !t.senderEmail.endsWith('@' + domain));
      deps.renderInbox();
      showUndoToast(`Deleted ${domainThreads.length} from ${domain}`, async () => {
        await untrashThreads(acct, domainThreads).catch(() => {});
        state.threads = state.account ? await loadThreads(state.account.id) : [];
        deps.renderInbox();
      });
      trashThreads(acct, domainThreads).catch(err => console.error('Batch trash failed:', err));
    });
  });
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
    container.innerHTML = renderEmptyState(icon.snooze(), 'No snoozed threads', 'Snooze an email to see it later.');
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
    container.innerHTML = renderEmptyState(icon.star(), 'No starred messages', 'Star a thread with s or the star button to save it here.');
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
    container.innerHTML = renderEmptyState(icon.calendar(), 'No scheduled sends', 'Emails you schedule will appear here.');
    return;
  }

  container.innerHTML = `
    <div class="section-header">Scheduled <span class="section-badge">${scheduled.length}</span></div>
    ${scheduled.map(e => `
      <div class="thread-row" data-sched-id="${esc(e.id)}">
        <div class="avatar-wrap"><div class="avatar" style="background:#888" data-initial="⏰"></div></div>
        <span class="thread-sender">${esc(e.to)}</span>
        <div class="thread-mid">
          <span class="thread-subject-line">${esc(e.subject)}</span>
          <span class="thread-preview-line">${icon.calendar('14px')} Sends ${formatDate(e.scheduledAt)}</span>
        </div>
        <span class="thread-date">${formatDate(e.scheduledAt)}</span>
        <div class="thread-actions">
          <button class="btn-action danger btn-cancel-sched" title="Cancel scheduled send">${icon.close('16px')}</button>
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
      deps.toggleBulkSelection(t.id, e.shiftKey);
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
        deps.toggleBulkSelection(t.id, e.shiftKey);
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
    archiveBg.innerHTML = `<span class="swipe-bg-icon">${icon.archive('28px')}</span>`;
    const snoozeBg = document.createElement('div');
    snoozeBg.className = 'swipe-bg swipe-bg-snooze';
    snoozeBg.innerHTML = `<span class="swipe-bg-icon">${icon.snooze('28px')}</span>`;
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

/** Wire event listeners on a NodeList of newly added rows (for lazy-loaded chunks). */
function wireNewRows(rows: NodeListOf<HTMLElement>, list: Thread[], isSnoozed: boolean, deps: ThreadListDeps) {
  rows.forEach(row => {
    const id = row.dataset.id!;
    if (row.hasAttribute('data-wired')) return;
    row.setAttribute('data-wired', '1');
    const t = list.find(x => x.id === id);
    if (!t) return;
    row.querySelector<HTMLElement>('.avatar-wrap')?.addEventListener('click', e => {
      e.stopPropagation();
      if (!state.bulkMode) state.bulkMode = true;
      deps.toggleBulkSelection(t.id, e.shiftKey);
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
        deps.toggleBulkSelection(t.id, e.shiftKey);
        return;
      }
      deps.openThread(t);
    });
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, t, row, isSnoozed, deps.getActionDeps());
    });
    row.querySelector('.btn-star')?.addEventListener('click', e => { e.stopPropagation(); doToggleStar(t, row); });
    row.querySelector('.btn-archive')?.addEventListener('click', e => { e.stopPropagation(); doArchive(t, row, deps.getActionDeps()); });
    row.querySelector('.btn-trash')?.addEventListener('click', e => { e.stopPropagation(); doTrash(t, row, deps.getActionDeps()); });
    if (isSnoozed) {
      row.querySelector('.btn-unsnooze')?.addEventListener('click', e => { e.stopPropagation(); doUnsnooze(t, row, deps.getActionDeps()); });
    } else {
      row.querySelector('.btn-snooze')?.addEventListener('click', e => { e.stopPropagation(); openSnoozePicker(t, row); });
    }
  });
}
