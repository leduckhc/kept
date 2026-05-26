import { brandTokens, renderPipMark } from '/packages/ui/src/index.js';
import { getInboxSections, sampleInboxThreads, sampleNewSenders } from '/packages/mail-core/src/index.js';
import { disabledProvider } from '/packages/ai-core/src/index.js';

const inboxNow = new Date('2026-05-26T12:00:00Z');
const sections = getInboxSections(sampleInboxThreads, { now: inboxNow });
const inboxCount = sampleInboxThreads.length;
const unreadCount = sampleInboxThreads.filter((thread) => thread.isUnread).length;

const root = document.querySelector('#root');
document.documentElement.style.setProperty('--accent', brandTokens.color.accent);
document.documentElement.style.setProperty('--paper', brandTokens.color.paper);
document.documentElement.style.setProperty('--ink', brandTokens.color.ink);
root.replaceChildren(renderInboxShell());

window.addEventListener('keydown', (event) => {
  const wantsCommandSearch = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
  if (!wantsCommandSearch) return;
  event.preventDefault();
  document.querySelector('#inbox-search')?.focus();
});

function renderInboxShell() {
  const shell = el('main', { className: 'shell', ariaLabel: 'Kept inbox' });
  const surface = el('section', { className: 'inbox-surface' });
  surface.append(renderTopBar(), renderNewSenders(), renderInboxSections());
  shell.append(surface);
  return shell;
}

function renderTopBar() {
  const topbar = el('header', { className: 'topbar' });

  const brand = el('div', { className: 'brand' });
  const pipWrap = el('span', { className: 'pip-wrap', ariaHidden: 'true' });
  pipWrap.innerHTML = renderPipMark();
  brand.append(pipWrap, el('span', { className: 'brand-copy', text: 'Pip / Kept' }));

  const title = el('div', { className: 'inbox-title' });
  title.append(
    el('h1', { text: 'Inbox' }),
    el('span', { className: 'inbox-count', text: `${inboxCount} messages · ${unreadCount} unread` }),
  );

  const search = el('label', { className: 'search-box', ariaLabel: 'Ask or search mail' });
  search.append(
    el('span', { className: 'search-icon', text: '⌕', ariaHidden: 'true' }),
    el('input', {
      id: 'inbox-search',
      type: 'search',
      placeholder: 'Ask or search mail',
      ariaLabel: 'Ask or search mail',
    }),
    el('kbd', { text: '⌘K' }),
  );

  const status = el('div', { className: 'status-pill', ariaLabel: 'Local-first and bring your own AI status' });
  status.append(
    el('span', { className: 'status-dot', ariaHidden: 'true' }),
    el('span', { text: `Local-first · BYO AI ${disabledProvider.status}` }),
  );

  topbar.append(brand, title, search, status);
  return topbar;
}

function renderNewSenders() {
  const section = el('section', { className: 'new-senders', ariaLabel: 'New senders' });
  section.append(renderSectionHeader('New senders', `${sampleNewSenders.length} to review`));

  const railWrap = el('div', { className: 'carousel-wrap' });
  railWrap.append(el('button', { className: 'carousel-control', type: 'button', text: '‹', ariaLabel: 'Previous new senders' }));

  const rail = el('div', { className: 'sender-rail', role: 'list' });
  sampleNewSenders.forEach((sender) => rail.append(renderSenderCard(sender)));
  railWrap.append(rail, el('button', { className: 'carousel-control', type: 'button', text: '›', ariaLabel: 'Next new senders' }));

  section.append(railWrap);
  return section;
}

function renderSenderCard(sender) {
  const card = el('article', { className: 'sender-card', role: 'listitem' });
  card.append(
    renderAvatar(sender),
    el('strong', { text: sender.sender }),
    el('span', { className: 'sender-email', text: sender.senderEmail }),
    el('p', { text: sender.subject }),
  );

  const actions = el('div', { className: 'sender-actions' });
  actions.append(
    el('button', { type: 'button', className: 'accept', text: 'Accept', ariaLabel: `Accept ${sender.sender}` }),
    el('button', { type: 'button', className: 'block', text: 'Block', ariaLabel: `Block ${sender.sender}` }),
  );
  card.append(actions);
  return card;
}

function renderInboxSections() {
  const list = el('section', { className: 'inbox-list', ariaLabel: 'Messages grouped by date' });
  sections.forEach((section) => list.append(renderThreadSection(section)));
  return list;
}

function renderThreadSection(section) {
  const group = el('section', { className: 'thread-section', ariaLabel: section.title });
  group.append(renderSectionHeader(section.title, `${section.threads.length} messages`));

  const rows = el('div', { className: 'rows', role: 'list' });
  if (section.threads.length === 0) {
    rows.append(el('p', { className: 'empty-row', text: `No ${section.title.toLowerCase()} mail right now.` }));
  } else {
    section.threads.forEach((thread) => rows.append(renderThreadRow(thread, section.id)));
  }
  group.append(rows);
  return group;
}

function renderThreadRow(thread, sectionId) {
  const row = el('article', {
    className: `thread-row${thread.isUnread ? ' unread' : ''}${sectionId === 'priority' ? ' priority' : ''}`,
    role: 'listitem',
    tabIndex: 0,
    ariaLabel: `${thread.sender}, ${thread.subject}, ${formatTime(thread.receivedAt)}`,
  });

  row.append(
    el('span', { className: 'unread-dot', ariaHidden: 'true' }),
    renderAvatar(thread),
    el('strong', { className: 'sender-name', text: thread.sender }),
    el('span', { className: 'subject', text: thread.subject }),
    el('span', { className: 'snippet', text: thread.snippet }),
    el('time', { className: 'time', text: formatTime(thread.receivedAt), dateTime: thread.receivedAt }),
  );

  const actions = el('div', { className: 'row-actions', ariaLabel: `Actions for ${thread.subject}` });
  actions.append(el('button', { type: 'button', text: '⋯', ariaLabel: `More actions for ${thread.subject}` }));
  row.append(actions);
  return row;
}

function renderSectionHeader(title, meta) {
  const header = el('div', { className: 'section-header' });
  header.append(el('h2', { text: title }), el('span', { text: meta }));
  return header;
}

function renderAvatar(thread) {
  const avatar = el('span', { className: 'avatar', text: thread.avatarInitials || thread.sender.slice(0, 2).toUpperCase() });
  avatar.style.background = thread.avatarColor || '#d9ebe3';
  return avatar;
}

function formatTime(value) {
  const received = new Date(value);
  const sameDay = received.toISOString().slice(0, 10) === inboxNow.toISOString().slice(0, 10);
  if (sameDay) {
    return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(received);
  }
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(received);
}

function el(tagName, options = {}) {
  const node = document.createElement(tagName);
  Object.entries(options).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key === 'ariaLabel') node.setAttribute('aria-label', value);
    else if (key === 'ariaHidden') node.setAttribute('aria-hidden', String(value));
    else if (key === 'dateTime') node.setAttribute('datetime', value);
    else node[key] = value;
  });
  return node;
}
