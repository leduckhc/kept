/**
 * TriageView — Superhuman/Spark-inspired card-based triage.
 * Shows one email at a time, centered, with quick action buttons.
 * Progress bar shows how far through the unread queue you are.
 */
import { createSignal, createMemo, Show, onMount, onCleanup } from 'solid-js';
import { appState, selectThread } from './store';
import { doArchive, doToggleStar, doMarkRead } from './actions';
import { icon } from '../icons';
import { avatarColor } from '../avatar';
import type { Thread } from '../store';

function senderInitial(thread: Thread): string {
  const name = thread.senderName || thread.senderEmail;
  return name.charAt(0).toUpperCase();
}

export function TriageView() {
  const [triageIndex, setTriageIndex] = createSignal(0);
  const [processed, setProcessed] = createSignal(0);

  // All triage-eligible threads (unread, not archived, not muted, not trash)
  const triageQueue = createMemo(() =>
    appState.threads.filter(t => t.isUnread && !t.isArchived && !t.isMuted && t.label !== 'TRASH')
      .sort((a, b) => b.receivedAt - a.receivedAt)
  );

  const totalCount = createMemo(() => triageQueue().length + processed());
  const current = createMemo(() => triageQueue()[triageIndex()]);
  const progressPct = createMemo(() => {
    const total = totalCount();
    return total === 0 ? 100 : Math.round((processed() / total) * 100);
  });

  function advance() {
    setProcessed(p => p + 1);
    // Stay at same index (next thread slides in since previous was removed from queue)
    if (triageIndex() >= triageQueue().length) {
      setTriageIndex(0);
    }
  }

  function handleArchive() {
    const t = current();
    if (!t) return;
    doArchive(t);
    advance();
  }

  function handleStar() {
    const t = current();
    if (!t) return;
    doToggleStar(t);
    // Don't advance — starring doesn't dismiss
  }

  function handleSkip() {
    const t = current();
    if (!t) return;
    doMarkRead(t);
    advance();
  }

  function handleOpen() {
    const t = current();
    if (!t) return;
    selectThread(t.id);
  }

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // Keyboard shortcuts for triage mode
  onMount(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const el = document.activeElement;
      if (el && ((el as HTMLElement).tagName === 'INPUT' || (el as HTMLElement).tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) {
        return;
      }
      if (!current()) return;

      if (e.key === 'e' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleArchive();
      } else if (e.key === 's' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleStar();
      } else if (e.key === 'k' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleSkip();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleOpen();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    onCleanup(() => document.removeEventListener('keydown', handleKeydown));
  });

  return (
    <div class="triage-container">
      <Show when={current()} fallback={
        <div class="triage-container triage-done">
          <div class="triage-celebration">
            <div class="triage-celebration-icon">🎉</div>
            <h2>All triaged!</h2>
            <p>You've reviewed all {processed()} messages.</p>
          </div>
        </div>
      }>
        {/* Progress bar */}
        <div class="triage-progress">
          <div class="triage-progress-bar" style={{ width: `${progressPct()}%` }} />
        </div>

        {/* Stats */}
        <div class="triage-stats">
          <span class="triage-stat">{processed()} done</span>
          <span class="triage-stat">{triageQueue().length} remaining</span>
        </div>

        {/* Card */}
        <div class="triage-card" onClick={handleOpen}>
          <div class="triage-card-header">
            <div class="triage-avatar">
              <div class="avatar" style={{ background: avatarColor(current()!.senderEmail) }}>
                {senderInitial(current()!)}
              </div>
            </div>
            <div class="triage-sender-info">
              <div class="triage-sender">{current()!.senderName || current()!.senderEmail}</div>
              <div class="triage-date">{formatDate(current()!.receivedAt)}</div>
            </div>
            <Show when={current()!.messageCount && current()!.messageCount! > 1}>
              <div class="triage-unread-badge">{current()!.messageCount}</div>
            </Show>
          </div>
          <div class="triage-subject">{current()!.subject || '(no subject)'}</div>
          <div class="triage-snippet">{current()!.snippet}</div>
          <Show when={current()!.hasAttachment}>
            <div class="triage-attachment">
              <span innerHTML={icon.attach('12px')} />
              Attachment
            </div>
          </Show>
        </div>

        {/* Action buttons */}
        <div class="triage-actions">
          <button class="triage-btn triage-btn-archive" onClick={handleArchive} title="Archive (e)">
            <span innerHTML={icon.archive('18px')} />
            Archive
          </button>
          <button class="triage-btn triage-btn-star" onClick={handleStar} title="Star (s)">
            <span innerHTML={current()!.isStarred ? icon.starFilled('18px') : icon.star('18px')} />
            {current()!.isStarred ? 'Unstar' : 'Star'}
          </button>
          <button class="triage-btn triage-btn-skip" onClick={handleSkip} title="Mark read & skip (k)">
            <span innerHTML={icon.check('18px')} />
            Skip
          </button>
          <button class="triage-btn triage-btn-open" onClick={handleOpen} title="Open (Enter)">
            <span innerHTML={icon.email('18px')} />
            Open
          </button>
        </div>

        {/* Keyboard hints */}
        <div class="triage-hint">
          <kbd>e</kbd> archive &nbsp; <kbd>s</kbd> star &nbsp; <kbd>k</kbd> skip &nbsp; <kbd>Enter</kbd> open
        </div>
      </Show>
    </div>
  );
}
