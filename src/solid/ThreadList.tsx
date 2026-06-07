/**
 * ThreadList — Solid component replacing the imperative threadList.ts render.
 * Reactively renders sectioned thread list with category rows, sender/domain groups,
 * and individual thread rows — all driven by fine-grained reactive store signals.
 */
import { For, Show, createMemo } from 'solid-js';
import {
  appState, filteredThreads, selectThread, toggleBulkSelect,
  setCategoryFilter, setSenderFilter, setDomainFilter, isBulkMode,
} from './store';
import { groupBySection } from '../store';
import { icon } from '../icons';
import type { Thread } from '../store';
import { Newspaper, Megaphone } from 'lucide-static';

// ── Helpers ──────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
}

function senderInitial(thread: Thread): string {
  const name = thread.senderName || thread.senderEmail;
  return name.charAt(0).toUpperCase();
}

// ── Section Header ───────────────────────────────────────────

function SectionHeader(props: { label: string; threads: Thread[] }) {
  const unreadCount = createMemo(() => props.threads.filter(t => t.isUnread).length);

  return (
    <div class="section-header">
      {props.label}
      <Show when={unreadCount() > 0}>
        <span class="section-badge">{unreadCount()}</span>
      </Show>
    </div>
  );
}

// ── Category Row (Newsletters / Updates) ─────────────────────

function CategoryRow(props: { type: 'newsletters' | 'updates'; threads: Thread[] }) {
  const label = () => props.type === 'newsletters' ? 'Newsletters' : 'Updates';
  const hasUnread = createMemo(() => props.threads.some(t => t.isUnread));

  // Top 5 senders by count
  const senderBadges = createMemo(() => {
    const bySender: Record<string, { name: string; email: string; count: number }> = {};
    for (const t of props.threads) {
      const key = t.senderEmail;
      if (!bySender[key]) {
        const name = t.senderName || t.senderEmail.split('@')[1] || t.senderEmail;
        bySender[key] = { name, email: key, count: 0 };
      }
      bySender[key].count++;
    }
    return Object.entries(bySender)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([addr, info]) => ({ email: addr, name: info.name, count: info.count }));
  });

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.category-actions')) return;
    setCategoryFilter(props.type);
  };

  const categoryIcon = () => props.type === 'newsletters'
    ? `<div class="avatar category-avatar" style="background:#7c3aed">${icon.custom(Newspaper, '20px')}</div>`
    : `<div class="avatar category-avatar" style="background:#0891b2">${icon.custom(Megaphone, '20px')}</div>`;

  return (
    <div
      class={`thread-row category-row${hasUnread() ? ' unread' : ''}`}
      data-category={props.type}
      onClick={onClick}
    >
      <span class="unread-dot" />
      <div class="avatar-wrap" innerHTML={categoryIcon()} />
      <span class="thread-sender">{label()}</span>
      <div class="thread-mid">
        <div class="category-senders">
          <For each={senderBadges()}>
            {(badge) => {
              const domain = badge.email.split('@')[1] ?? '';
              const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : '';
              return (
                <span
                  class="sender-badge"
                  data-sender-email={badge.email}
                  onClick={(e) => { e.stopPropagation(); setCategoryFilter(props.type); }}
                >
                  <Show when={faviconUrl}>
                    <img class="sender-badge-avatar" src={faviconUrl} alt="" loading="lazy" />
                  </Show>
                  {escapeHtml(badge.name)} <span class="sender-count">#{badge.count}</span>
                </span>
              );
            }}
          </For>
        </div>
      </div>
      <div class="thread-actions category-actions">
        <button class="btn-action btn-archive-all" title="Archive all" innerHTML={icon.archive('16px')} />
        <button class="btn-action btn-trash-all" title="Delete all" innerHTML={icon.trash('16px')} />
        <button class="btn-action btn-read-all" title="Mark all read" innerHTML={icon.markRead('16px')} />
      </div>
    </div>
  );
}

// ── Sender Group Row ─────────────────────────────────────────

function SenderGroupRow(props: { email: string; threads: Thread[] }) {
  const latest = () => props.threads[0];
  const hasUnread = createMemo(() => props.threads.some(t => t.isUnread));
  const displayName = () => latest().senderName || props.email;

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.thread-actions')) return;
    setSenderFilter(props.email);
  };

  return (
    <div
      class={`thread-row sender-group-row${hasUnread() ? ' unread' : ''}`}
      data-sender-email={props.email}
      onClick={onClick}
    >
      <span class={`unread-dot${hasUnread() ? ' filled' : ''}`} />
      <div class="avatar-wrap">
        <div class="avatar stacked">{senderInitial(latest())}</div>
        <Show when={props.threads.length > 1}>
          <div class="avatar stacked-behind" />
        </Show>
      </div>
      <span class="thread-sender">
        {escapeHtml(displayName())} <span class="sender-group-count">#{props.threads.length}</span>
      </span>
      <div class="thread-mid">
        <span class="thread-subject-line">{escapeHtml(latest().subject)}</span>
        <span class="thread-preview-line">{escapeHtml(latest().snippet)}</span>
      </div>
      <span class="thread-date">{formatDate(latest().receivedAt)}</span>
      <div class="thread-actions">
        <button class="btn-action btn-archive" title="Archive all" innerHTML={icon.archive('16px')} />
        <button class="btn-action btn-trash" title="Delete all" innerHTML={icon.trash('16px')} />
      </div>
    </div>
  );
}

// ── Domain Group Row ─────────────────────────────────────────

function DomainGroupRow(props: { domain: string; threads: Thread[] }) {
  const latest = () => props.threads[0];
  const hasUnread = createMemo(() => props.threads.some(t => t.isUnread));
  const uniqueSenders = createMemo(() => new Set(props.threads.map(t => t.senderName || t.senderEmail)).size);
  const countLabel = createMemo(() =>
    uniqueSenders() > 1
      ? `${props.threads.length} from ${uniqueSenders()} senders`
      : `#${props.threads.length}`
  );

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.thread-actions')) return;
    setDomainFilter(props.domain);
  };

  return (
    <div
      class={`thread-row domain-group-row${hasUnread() ? ' unread' : ''}`}
      data-domain={props.domain}
      onClick={onClick}
    >
      <span class={`unread-dot${hasUnread() ? ' filled' : ''}`} />
      <div class="avatar-wrap">
        <div class="avatar stacked">{props.domain.charAt(0).toUpperCase()}</div>
        <Show when={props.threads.length > 1}>
          <div class="avatar stacked-behind" />
        </Show>
      </div>
      <span class="thread-sender">
        {escapeHtml(props.domain)} <span class="sender-group-count">{countLabel()}</span>
      </span>
      <div class="thread-mid">
        <span class="thread-subject-line">{escapeHtml(latest().subject)}</span>
        <span class="thread-preview-line">{escapeHtml(latest().snippet)}</span>
      </div>
      <span class="thread-date">{formatDate(latest().receivedAt)}</span>
      <div class="thread-actions">
        <button class="btn-action btn-archive" title="Archive all" innerHTML={icon.archive('16px')} />
        <button class="btn-action btn-trash" title="Delete all" innerHTML={icon.trash('16px')} />
      </div>
    </div>
  );
}

// ── Thread Row ───────────────────────────────────────────────

function ThreadRow(props: { thread: Thread }) {
  const t = () => props.thread;

  const isSelected = createMemo(() => appState.selectedIds.includes(t().id));
  const isCurrent = createMemo(() => appState.selectedThreadId === t().id);

  const classes = createMemo(() => {
    const parts = ['thread-row'];
    if (t().isUnread) parts.push('unread');
    if (t().isStarred) parts.push('is-starred');
    if (t().snoozedUntil) parts.push('snoozed-row');
    if (isSelected()) parts.push('bulk-selected');
    if (isBulkMode()) parts.push('bulk-mode');
    if (isCurrent()) parts.push('is-selected');
    return parts.join(' ');
  });

  const onRowClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.avatar-wrap') || target.closest('.thread-actions')) return;
    selectThread(t().id);
  };

  const onAvatarClick = (e: MouseEvent) => {
    e.stopPropagation();
    toggleBulkSelect(t().id);
  };

  return (
    <div class={classes()} data-id={t().id} onClick={onRowClick}>
      <Show when={t().isUnread}>
        <span class="unread-dot filled" />
      </Show>
      <Show when={!t().isUnread}>
        <span class="unread-dot" />
      </Show>
      <div class="avatar-wrap" onClick={onAvatarClick}>
        <div class="avatar">{senderInitial(t())}</div>
      </div>
      <span class="thread-sender">{escapeHtml(t().senderName || t().senderEmail)}</span>
      <div class={`thread-mid${t().hasAttachment ? ' has-attachment' : ''}`}>
        <span class="thread-subject-line">
          {escapeHtml(t().subject)}
          <Show when={t().messageCount && t().messageCount! > 1}>
            <span class="thread-count">{t().messageCount}</span>
          </Show>
        </span>
        <span class="thread-preview-line">{escapeHtml(t().snippet)}</span>
      </div>
      <span class="thread-date">{formatDate(t().receivedAt)}</span>
      <div class="thread-actions">
        <button class="btn-action btn-archive" title="Archive" innerHTML={icon.archive('16px')} />
        <button class="btn-action btn-trash" title="Trash" innerHTML={icon.trash('16px')} />
      </div>
    </div>
  );
}

// ── Section Component ────────────────────────────────────────

interface SectionData {
  label: string;
  threads: Thread[];
  categoryThreads?: { newsletters: Thread[]; updates: Thread[] };
  senderGroups?: Record<string, Thread[]>;
  domainGroups?: Record<string, Thread[]>;
}

function Section(props: { section: SectionData }) {
  const s = () => props.section;

  const senderGroupEntries = createMemo(() => {
    const groups = s().senderGroups;
    if (!groups) return [];
    return Object.entries(groups).filter(([, threads]) => threads.length > 0);
  });

  const domainGroupEntries = createMemo(() => {
    const groups = s().domainGroups;
    if (!groups) return [];
    return Object.entries(groups).filter(([, threads]) => threads.length > 0);
  });

  return (
    <>
      <SectionHeader label={s().label} threads={s().threads} />

      {/* Category rows (newsletters + updates) — typically in Today section */}
      <Show when={s().categoryThreads?.newsletters?.length}>
        <CategoryRow type="newsletters" threads={s().categoryThreads!.newsletters} />
      </Show>
      <Show when={s().categoryThreads?.updates?.length}>
        <CategoryRow type="updates" threads={s().categoryThreads!.updates} />
      </Show>

      {/* Sender groups */}
      <For each={senderGroupEntries()}>
        {([email, threads]) => <SenderGroupRow email={email} threads={threads} />}
      </For>

      {/* Domain groups */}
      <For each={domainGroupEntries()}>
        {([domain, threads]) => <DomainGroupRow domain={domain} threads={threads} />}
      </For>

      {/* Individual thread rows */}
      <For each={s().threads}>
        {(thread) => <ThreadRow thread={thread} />}
      </For>
    </>
  );
}

// ── Main ThreadList Component ────────────────────────────────

export function ThreadList() {
  const threads = filteredThreads;

  // When a filter is active, show flat list (no sections)
  const isFiltered = createMemo(() =>
    !!(appState.categoryFilter || appState.senderFilter || appState.domainFilter)
  );

  // When search is active, show flat list
  const isSearching = createMemo(() => appState.searchQuery.trim().length > 0);

  // Sectioned view for normal inbox
  const sections = createMemo(() => {
    if (isFiltered() || isSearching()) return [];
    return groupBySection(
      threads(),
      appState.groupedSenders,
      appState.groupedDomains,
      appState.vipSenders
    );
  });

  return (
    <div class="thread-list" id="thread-list">
      {/* Empty state */}
      <Show when={threads().length === 0 && !appState.syncing}>
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <div class="empty-state-title">All caught up</div>
          <div class="empty-state-subtitle">No new messages. Go enjoy your day.</div>
        </div>
      </Show>

      {/* Loading state */}
      <Show when={threads().length === 0 && appState.syncing}>
        <p class="sync-loading">Syncing inbox…</p>
      </Show>

      {/* Filtered/search flat view */}
      <Show when={(isFiltered() || isSearching()) && threads().length > 0}>
        <For each={threads()}>
          {(thread) => <ThreadRow thread={thread} />}
        </For>
      </Show>

      {/* Sectioned inbox view */}
      <Show when={!isFiltered() && !isSearching() && threads().length > 0}>
        <For each={sections()}>
          {(section) => <Section section={section} />}
        </For>
      </Show>
    </div>
  );
}
