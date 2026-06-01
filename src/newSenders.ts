// newSenders.ts — "New Senders" triage cards at top of inbox
import { type Thread } from './gmail';
import { state } from './state';
import { type ActionDeps, doBlock } from './actions';
import { icon } from './icons';
import { esc } from './helpers';

/** Noise prefixes — senders matching these are not shown as "new" */
export const NOISE_PREFIXES = [
  'noreply@', 'no-reply@', 'newsletter@', 'marketing@', 'donotreply@',
  'notifications@', 'updates@', 'news@', 'info@', 'hello@', 'support@', 'mailer@',
];

/** How many days back a sender counts as "new" */
const NEW_SENDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Determine if an email is from a new (unknown, non-noise, recent) sender */
export function isNewSender(email: string): boolean {
  const lower = email.toLowerCase();
  if (state.knownSenders.has(lower)) return false;
  if (NOISE_PREFIXES.some(p => lower.startsWith(p))) return false;
  // Must have a thread received within the last 7 days
  const cutoff = Date.now() - NEW_SENDER_WINDOW_MS;
  const hasRecent = state.threads.some(t => t.senderEmail.toLowerCase() === lower && t.receivedAt >= cutoff);
  return hasRecent;
}

interface NewSenderInfo {
  email: string;
  name: string;
  subject: string;
  thread: Thread;
  count: number;
}

/** Get deduplicated list of new senders from current threads */
export function getNewSenders(): NewSenderInfo[] {
  const seen = new Set<string>();
  const result: NewSenderInfo[] = [];
  for (const t of state.threads) {
    const lower = t.senderEmail.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (isNewSender(t.senderEmail)) {
      const count = state.threads.filter(th => th.senderEmail.toLowerCase() === lower).length;
      result.push({
        email: t.senderEmail,
        name: t.senderName || t.senderEmail.split('@')[0],
        subject: t.subject,
        thread: t,
        count,
      });
    }
  }
  return result;
}

/** Generate a consistent color from a string */
function avatarColor(str: string): string {
  const colors = ['#7c6fa8', '#5b8dd9', '#7cb9a8', '#d97c5b', '#c47cad', '#5bad7c', '#d9a05b', '#5b7cd9'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function renderCard(sender: NewSenderInfo): string {
  const initial = (sender.name[0] || '?').toUpperCase();
  const color = avatarColor(sender.email);
  const countExtra = sender.count > 1 ? ` <span class="new-sender-count">+${sender.count - 1}</span>` : '';
  return `
    <div class="new-sender-card" data-email="${esc(sender.email)}">
      <div class="new-sender-top">
        <div class="new-sender-avatar" style="background:${color}">${initial}</div>
        <div class="new-sender-info">
          <div class="new-sender-name" title="${esc(sender.name)}">${esc(sender.name)}</div>
          <div class="new-sender-email" title="${esc(sender.email)}">${esc(sender.email)}</div>
          <div class="new-sender-subject" title="${esc(sender.subject)}">${icon.email('12px')} ${esc(sender.subject)}${countExtra}</div>
        </div>
      </div>
      <div class="new-sender-actions">
        <button class="new-sender-accept" title="Accept sender">${icon.thumbUp('14px')} Accept</button>
        <button class="new-sender-block" title="Block sender">${icon.thumbDown('14px')} Block</button>
      </div>
    </div>`;
}

/** Render the new senders section into the given container (prepends). Returns the element or null. */
export function renderNewSendersSection(container: HTMLElement, actionDeps: ActionDeps, openThread?: (t: Thread) => void): void {
  // Remove existing section
  container.querySelector('.new-senders-section')?.remove();
  document.querySelector('.new-senders-fullscreen')?.remove();

  const senders = getNewSenders();
  if (senders.length === 0) return;

  const section = document.createElement('div');
  section.className = 'new-senders-section';
  section.innerHTML = `
    <div class="new-senders-header">
      <span class="new-senders-label">New senders (${senders.length})</span>
      <button class="new-senders-expand" title="View all">${icon.chevronRight('16px')}</button>
    </div>
    <div class="new-senders-row">
      ${senders.map(s => renderCard(s)).join('')}
    </div>
  `;

  container.prepend(section);
  wireCards(section, senders, actionDeps, container, openThread);

  // Wire edge fade shadows based on scroll position
  const row = section.querySelector<HTMLElement>('.new-senders-row')!;
  const updateFades = () => {
    section.classList.toggle('fade-left', row.scrollLeft > 10);
    section.classList.toggle('fade-right', row.scrollLeft < row.scrollWidth - row.clientWidth - 10);
  };
  row.addEventListener('scroll', updateFades, { passive: true });
  // Initial check (deferred so layout is computed)
  requestAnimationFrame(updateFades);

  // Wire expand button
  section.querySelector('.new-senders-expand')!.addEventListener('click', () => {
    openFullscreen(senders, actionDeps, container, openThread);
  });
}

function wireCards(root: HTMLElement, senders: NewSenderInfo[], actionDeps: ActionDeps, inboxContainer: HTMLElement, openThread?: (t: Thread) => void) {
  root.querySelectorAll<HTMLElement>('.new-sender-card').forEach(card => {
    const email = card.dataset.email!;
    const sender = senders.find(s => s.email === email);
    if (!sender) return;

    // Click card to open the thread
    card.addEventListener('click', () => {
      if (openThread) openThread(sender.thread);
    });
    card.style.cursor = 'pointer';

    card.querySelector('.new-sender-accept')!.addEventListener('click', (e) => {
      e.stopPropagation();
      state.knownSenders.add(email.toLowerCase());
      // Persist to localStorage
      const key = 'kept-accepted-senders';
      const stored: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      if (!stored.includes(email.toLowerCase())) {
        stored.push(email.toLowerCase());
        localStorage.setItem(key, JSON.stringify(stored));
      }
      card.remove();
      updateCount(inboxContainer);
    });

    card.querySelector('.new-sender-block')!.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Create a dummy row element for doBlock
      const dummyRow = document.createElement('div');
      const blocked = await doBlock(sender.thread, dummyRow, actionDeps);
      if (blocked) {
        card.remove();
        updateCount(inboxContainer);
      }
    });
  });
}

function updateCount(inboxContainer: HTMLElement) {
  const section = inboxContainer.querySelector('.new-senders-section');
  if (!section) return;
  const remaining = section.querySelectorAll('.new-sender-card').length;
  if (remaining === 0) {
    section.remove();
    document.querySelector('.new-senders-fullscreen')?.remove();
    return;
  }
  const label = section.querySelector('.new-senders-label');
  if (label) label.textContent = `New senders (${remaining})`;
}

function openFullscreen(senders: NewSenderInfo[], actionDeps: ActionDeps, inboxContainer: HTMLElement, openThread?: (t: Thread) => void) {
  document.querySelector('.new-senders-fullscreen')?.remove();

  // Filter to only senders still showing (not yet accepted/blocked)
  const currentSenders = senders.filter(s => isNewSender(s.email));

  const overlay = document.createElement('div');
  overlay.className = 'new-senders-fullscreen';
  overlay.innerHTML = `
    <div class="new-senders-fullscreen-header">
      <button class="new-senders-back">← Back</button>
      <span class="new-senders-fullscreen-title">New senders (${currentSenders.length})</span>
    </div>
    <div class="new-senders-grid">
      ${currentSenders.map(s => renderCard(s)).join('')}
    </div>
  `;

  document.body.appendChild(overlay);

  const dismissOverlay = () => {
    overlay.remove();
    document.removeEventListener('keydown', onEscape);
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismissOverlay();
    }
  };

  document.addEventListener('keydown', onEscape);

  overlay.querySelector('.new-senders-back')!.addEventListener('click', () => {
    dismissOverlay();
  });

  // Wrap openThread to dismiss overlay before opening email
  const wrappedOpenThread = openThread ? (t: Thread) => {
    dismissOverlay();
    openThread(t);
  } : undefined;

  wireCards(overlay, currentSenders, actionDeps, inboxContainer, wrappedOpenThread);
}
