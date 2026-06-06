// triageMode.ts — "Get Me to Zero" triage mode
// Presents unread/actionable inbox emails one-by-one with quick actions.
// Goal: reduce inbox to zero without context-switching between threads.

import { type Thread } from './store';
import { state } from './state';
import { type ActionDeps, doArchive, doMarkRead, doToggleStar, doSetAside } from './actions';
import { openSnoozePicker } from './snooze';
import { icon } from './icons';
import { avatarHtml } from './avatar';
import { esc, formatDate } from './helpers';

export interface TriageDeps {
  getActionDeps: () => ActionDeps;
  openThread: (t: Thread) => void;
  openInlineReply: (t: Thread, row: HTMLElement) => void;
}

interface TriageState {
  /** Queue of threads to triage (unread inbox threads, newest first). */
  queue: Thread[];
  /** Index of the currently displayed thread. */
  currentIndex: number;
  /** Number of threads processed (archived/snoozed/etc) this session. */
  processed: number;
  /** Total threads when triage started. */
  startCount: number;
  /** Whether triage is active. */
  active: boolean;
}

const triageState: TriageState = {
  queue: [],
  currentIndex: 0,
  processed: 0,
  startCount: 0,
  active: false,
};

/** Build the triage queue from current inbox threads. Unread first, then read — all actionable. */
export function buildTriageQueue(): Thread[] {
  const inbox = state.threads.filter(t =>
    t.label === 'INBOX' && !t.isArchived && !t.isMuted && !t.snoozedUntil
  );
  // Sort: unread first, then by date descending
  return inbox.sort((a, b) => {
    if (a.isUnread !== b.isUnread) return a.isUnread ? -1 : 1;
    return b.receivedAt - a.receivedAt;
  });
}

/** Start triage mode. Returns false if inbox is already at zero. */
export function startTriage(): boolean {
  const queue = buildTriageQueue();
  if (queue.length === 0) return false;
  triageState.queue = queue;
  triageState.currentIndex = 0;
  triageState.processed = 0;
  triageState.startCount = queue.length;
  triageState.active = true;
  return true;
}

export function isTriageActive(): boolean {
  return triageState.active;
}

export function exitTriage(): void {
  triageState.active = false;
  triageState.queue = [];
  triageState.currentIndex = 0;
}

export function getTriageState() {
  return { ...triageState };
}

/** Get the current thread in triage. */
export function currentTriageThread(): Thread | null {
  if (!triageState.active) return null;
  return triageState.queue[triageState.currentIndex] ?? null;
}

/** Advance to the next thread in triage. */
function advance(): Thread | null {
  triageState.processed++;
  // Remove current from queue
  triageState.queue.splice(triageState.currentIndex, 1);
  // If we've run out of threads, we're done
  if (triageState.queue.length === 0) {
    triageState.active = false;
    return null;
  }
  // Keep index in bounds (stay at same index since array shifted)
  if (triageState.currentIndex >= triageState.queue.length) {
    triageState.currentIndex = 0;
  }
  return triageState.queue[triageState.currentIndex] ?? null;
}

/** Skip this thread (keep in inbox, move to next). */
export function triageSkip(): Thread | null {
  if (!triageState.active) return null;
  // Move to next without removing
  if (triageState.queue.length <= 1) {
    triageState.active = false;
    return null;
  }
  triageState.currentIndex = (triageState.currentIndex + 1) % triageState.queue.length;
  return triageState.queue[triageState.currentIndex] ?? null;
}

/** Archive current thread and advance. */
export async function triageArchive(deps: TriageDeps): Promise<Thread | null> {
  const t = currentTriageThread();
  if (!t) return null;
  const container = document.getElementById('inbox');
  const fakeRow = container ?? document.createElement('div');
  await doArchive(t, fakeRow as HTMLElement, deps.getActionDeps());
  return advance();
}

/** Mark read and advance. */
export async function triageMarkRead(deps: ActionDeps): Promise<Thread | null> {
  const t = currentTriageThread();
  if (!t) return null;
  const fakeRow = document.createElement('div');
  await doMarkRead(t, fakeRow, deps);
  return advance();
}

/** Star and advance. */
export async function triageStar(_deps: TriageDeps): Promise<Thread | null> {
  const t = currentTriageThread();
  if (!t) return null;
  const fakeRow = document.createElement('div');
  await doToggleStar(t, fakeRow);
  return advance();
}

/** Set aside and advance. */
export async function triageSetAside(deps: TriageDeps): Promise<Thread | null> {
  const t = currentTriageThread();
  if (!t) return null;
  const fakeRow = document.createElement('div');
  await doSetAside(t, fakeRow, deps.getActionDeps());
  return advance();
}

/** Snooze and advance — caller must handle the snooze picker. */
export function triageAfterSnooze(): Thread | null {
  return advance();
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/** Render the triage card for the current thread. */
export function renderTriageCard(t: Thread): string {
  const date = formatDate(t.receivedAt);
  const sender = t.senderName || t.senderEmail;
  const subject = t.subject || '(no subject)';
  const snippet = t.snippet || '';

  const progress = triageState.startCount > 0
    ? Math.round((triageState.processed / triageState.startCount) * 100)
    : 0;
  const remaining = triageState.queue.length;

  return `
    <div class="triage-container">
      <div class="triage-progress">
        <div class="triage-progress-bar" style="width: ${progress}%"></div>
      </div>
      <div class="triage-stats">
        <span class="triage-stat">${icon.zap('14px')} ${triageState.processed} done</span>
        <span class="triage-stat">${remaining} remaining</span>
      </div>

      <div class="triage-card" data-id="${t.id}">
        <div class="triage-card-header">
          <div class="triage-avatar">${avatarHtml(t)}</div>
          <div class="triage-sender-info">
            <div class="triage-sender">${esc(sender)}</div>
            <div class="triage-date">${date}</div>
          </div>
          ${t.isUnread ? '<span class="triage-unread-badge">Unread</span>' : ''}
        </div>
        <div class="triage-subject">${esc(subject)}</div>
        <div class="triage-snippet">${esc(snippet)}</div>
        ${t.hasAttachment ? `<div class="triage-attachment">${icon.attach('14px')} Attachment</div>` : ''}
      </div>

      <div class="triage-actions">
        <button class="triage-btn triage-btn-archive" title="Archive (e)" data-action="archive">
          ${icon.archive('20px')}
          <span>Archive</span>
        </button>
        <button class="triage-btn triage-btn-snooze" title="Snooze (h)" data-action="snooze">
          ${icon.snooze('20px')}
          <span>Snooze</span>
        </button>
        <button class="triage-btn triage-btn-aside" title="Set aside (b)" data-action="aside">
          ${icon.bookmark('20px')}
          <span>Set aside</span>
        </button>
        <button class="triage-btn triage-btn-star" title="Star (s)" data-action="star">
          ${icon.star('20px')}
          <span>Star</span>
        </button>
        <button class="triage-btn triage-btn-open" title="Open (Enter)" data-action="open">
          ${icon.emailOpen('20px')}
          <span>Read</span>
        </button>
        <button class="triage-btn triage-btn-skip" title="Skip (→)" data-action="skip">
          ${icon.chevronRight('20px')}
          <span>Skip</span>
        </button>
      </div>

      <div class="triage-hint">
        <kbd>e</kbd> archive · <kbd>h</kbd> snooze · <kbd>b</kbd> set aside · <kbd>s</kbd> star · <kbd>Enter</kbd> read · <kbd>→</kbd> skip · <kbd>Esc</kbd> exit
      </div>
    </div>
  `;
}

/** Render the "inbox zero" celebration screen. */
export function renderTriageComplete(): string {
  return `
    <div class="triage-container triage-done">
      <div class="triage-progress">
        <div class="triage-progress-bar" style="width: 100%"></div>
      </div>
      <div class="triage-celebration">
        <div class="triage-celebration-icon">🎉</div>
        <h2>Inbox Zero!</h2>
        <p>You processed <strong>${triageState.processed}</strong> email${triageState.processed === 1 ? '' : 's'} this session.</p>
        <button class="triage-btn-done" data-action="exit">Back to Inbox</button>
      </div>
    </div>
  `;
}

/** Render the empty-start screen when inbox is already at zero. */
export function renderTriageEmpty(): string {
  return `
    <div class="triage-container triage-done">
      <div class="triage-celebration">
        <div class="triage-celebration-icon">✨</div>
        <h2>Already at zero</h2>
        <p>Nothing to triage — your inbox is clean.</p>
        <button class="triage-btn-done" data-action="exit">Back to Inbox</button>
      </div>
    </div>
  `;
}

/** Full render for the triage view. Wire this to the inbox container. */
export function renderTriageView(deps: TriageDeps): void {
  const container = document.getElementById('inbox');
  if (!container) return;

  const t = currentTriageThread();
  if (!t) {
    container.innerHTML = triageState.processed > 0 ? renderTriageComplete() : renderTriageEmpty();
    wireTriageActions(container, deps);
    return;
  }

  container.innerHTML = renderTriageCard(t);
  wireTriageActions(container, deps);
}

/** Attach click handlers to triage action buttons. */
function wireTriageActions(container: HTMLElement, deps: TriageDeps): void {
  container.querySelectorAll<HTMLButtonElement>('.triage-btn, .triage-btn-done').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      if (!action) return;

      switch (action) {
        case 'archive':
          await triageArchive(deps);
          renderTriageView(deps);
          break;
        case 'snooze': {
          const t = currentTriageThread();
          if (t) {
            const card = container.querySelector<HTMLElement>('.triage-card') ?? btn;
            openSnoozePicker(t, card);
          }
          break;
        }
        case 'aside':
          await triageSetAside(deps);
          renderTriageView(deps);
          break;
        case 'star':
          await triageStar(deps);
          renderTriageView(deps);
          break;
        case 'open': {
          const t = currentTriageThread();
          if (t) deps.openThread(t);
          break;
        }
        case 'skip':
          triageSkip();
          renderTriageView(deps);
          break;
        case 'exit':
          exitTriage();
          deps.getActionDeps().renderInbox();
          break;
      }
    });
  });

  // Also allow clicking the card to open
  container.querySelector<HTMLElement>('.triage-card')?.addEventListener('click', () => {
    const t = currentTriageThread();
    if (t) deps.openThread(t);
  });
}

/** Handle triage keyboard shortcuts. Returns true if handled. */
export function handleTriageKey(e: KeyboardEvent, deps: TriageDeps): boolean {
  if (!triageState.active) return false;

  switch (e.key) {
    case 'e':
      triageArchive(deps).then(() => renderTriageView(deps));
      return true;
    case 'h':
      {
        const t = currentTriageThread();
        if (t) {
          const card = document.querySelector<HTMLElement>('.triage-card');
          openSnoozePicker(t, card ?? document.body);
        }
      }
      return true;
    case 'b':
      triageSetAside(deps).then(() => renderTriageView(deps));
      return true;
    case 's':
      triageStar(deps).then(() => renderTriageView(deps));
      return true;
    case 'Enter':
      {
        const t = currentTriageThread();
        if (t) deps.openThread(t);
      }
      return true;
    case 'ArrowRight':
      triageSkip();
      renderTriageView(deps);
      return true;
    case 'Escape':
      exitTriage();
      deps.getActionDeps().renderInbox();
      return true;
    default:
      return false;
  }
}
