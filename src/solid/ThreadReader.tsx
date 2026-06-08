/**
 * ThreadReader — Full reader showing selected thread's messages.
 * Features:
 *  - Per-message actions (reply/reply all/forward) on hover
 *  - Inline reply compose embedded at thread bottom
 *  - Quote selection → reply with quoted text
 */
import { Show, For, createSignal, createEffect, onCleanup } from 'solid-js';
import { appState, setAppState, selectedThread, openCompose, closeCompose } from './store';
import { doMarkRead } from './actions';
import { fetchMessageBody, sendEmail } from '../gmail';
import { showToast } from '../toasts';
import { icon } from '../icons';

interface Message {
  from: string;
  to: string;
  cc: string;
  replyTo: string;
  body: string;
  htmlBody: string | null;
  sanitizedHtml: string | null;
  receivedAt: number;
  gmailMessageId: string;
}

const AVATAR_COLORS = [
  '#e74c3c', '#9b59b6', '#3498db', '#1abc9c', '#27ae60',
  '#f39c12', '#e67e22', '#8e44ad', '#2980b9', '#16a085',
];

function senderColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: from, email: from };
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Build recipients for Reply All — exclude self, dedupe */
function buildReplyAllRecipients(msg: Message, myEmail: string): { to: string; cc: string } {
  const sender = parseSender(msg.replyTo || msg.from);
  const toAddrs = (msg.to || '').split(',').map(s => s.trim()).filter(Boolean);
  const ccAddrs = (msg.cc || '').split(',').map(s => s.trim()).filter(Boolean);
  const allRecipients = [...toAddrs, ...ccAddrs]
    .filter(addr => {
      const parsed = parseSender(addr);
      return parsed.email.toLowerCase() !== myEmail.toLowerCase() &&
             parsed.email.toLowerCase() !== sender.email.toLowerCase();
    });
  return { to: sender.email, cc: allRecipients.join(', ') };
}

export function ThreadReader() {
  const thread = selectedThread;
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set<string>());
  const [quotePopup, setQuotePopup] = createSignal<{ x: number; y: number; text: string; msg: Message } | null>(null);

  // Fetch messages when thread changes
  createEffect(() => {
    const t = thread();
    if (!t || !appState.account) {
      setMessages([]);
      return;
    }
    const threadId = t.id;
    setLoading(true);
    fetchMessageBody(appState.account, t.gmailThreadId)
      .then((result) => {
        if (thread()?.id !== threadId) return;
        setMessages(result.messages);
        if (result.messages.length > 1) {
          const ids = new Set<string>(result.messages.slice(0, -1).map(m => m.gmailMessageId));
          setCollapsed(ids);
        } else {
          setCollapsed(new Set<string>());
        }
      })
      .catch((err) => {
        if (thread()?.id !== threadId) return;
        if (String(err).includes('404')) {
          console.debug('Thread not available on Gmail, showing local data:', t.id);
        } else {
          console.error('Failed to fetch messages:', err);
        }
        setMessages([{
          from: `${t.senderName} <${t.senderEmail}>`,
          to: '',
          cc: '',
          replyTo: '',
          body: t.snippet,
          htmlBody: null,
          sanitizedHtml: null,
          receivedAt: t.receivedAt,
          gmailMessageId: t.id,
        }]);
        setCollapsed(new Set<string>());
      })
      .finally(() => setLoading(false));
  });

  // Mark as read when opened
  createEffect(() => {
    const t = thread();
    if (t && t.isUnread) {
      doMarkRead(t);
    }
  });

  // Text selection listener for quote-reply
  const handleSelectionChange = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setQuotePopup(null);
      return;
    }
    // Find which message the selection is in
    const anchor = sel.anchorNode;
    if (!anchor) return;
    const msgEl = (anchor as Element).closest?.('.thread-message') ||
                  (anchor.parentElement?.closest('.thread-message'));
    if (!msgEl) return;
    const msgId = msgEl.getAttribute('data-msg-id');
    const msg = messages().find(m => m.gmailMessageId === msgId);
    if (!msg) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const readerPane = document.getElementById('reader-pane');
    const paneRect = readerPane?.getBoundingClientRect();
    if (!paneRect) return;

    setQuotePopup({
      x: rect.left - paneRect.left + rect.width / 2,
      y: rect.top - paneRect.top - 40,
      text: sel.toString().trim(),
      msg,
    });
  };

  createEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    onCleanup(() => document.removeEventListener('selectionchange', handleSelectionChange));
  });

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Per-message action handlers
  const handleMsgReply = (msg: Message) => {
    const t = thread();
    if (!t) return;
    const sender = parseSender(msg.replyTo || msg.from);
    // If we sent this message, reply to the recipient instead of ourselves
    const myEmail = appState.account?.email;
    const replyTo = (myEmail && sender.email.toLowerCase() === myEmail.toLowerCase() && msg.to)
      ? parseSender(msg.to).email
      : sender.email;
    openCompose('reply', {
      to: replyTo,
      subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
      threadId: t.id,
      messageId: msg.gmailMessageId,
      inline: true,
    });
  };

  const handleMsgReplyAll = (msg: Message) => {
    const t = thread();
    if (!t || !appState.account) return;
    const myEmail = appState.account.email;
    const { to, cc } = buildReplyAllRecipients(msg, myEmail);
    openCompose('replyAll', {
      to,
      cc,
      subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
      threadId: t.id,
      messageId: msg.gmailMessageId,
      inline: true,
    });
  };

  const handleMsgForward = (msg: Message) => {
    const t = thread();
    if (!t) return;
    const fwdBody = `\n\n---------- Forwarded message ----------\nFrom: ${msg.from}\nDate: ${formatDate(msg.receivedAt)}\nSubject: ${t.subject}\nTo: ${msg.to}\n\n${msg.body}`;
    openCompose('forward', {
      subject: t.subject.startsWith('Fwd:') ? t.subject : `Fwd: ${t.subject}`,
      threadId: t.id,
      messageId: msg.gmailMessageId,
      body: fwdBody,
    });
  };

  const handleQuoteReply = () => {
    const q = quotePopup();
    if (!q) return;
    const t = thread();
    if (!t) return;
    const sender = parseSender(q.msg.replyTo || q.msg.from);
    const quoted = q.text.split('\n').map(l => `> ${l}`).join('\n');
    openCompose('reply', {
      to: sender.email,
      subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
      threadId: t.id,
      messageId: q.msg.gmailMessageId,
      quotedText: `On ${formatDate(q.msg.receivedAt)}, ${parseSender(q.msg.from).name} wrote:\n${quoted}\n`,
      inline: true,
    });
    setQuotePopup(null);
    window.getSelection()?.removeAllRanges();
  };


  return (
    <Show when={thread()}>
        <div class="reader-pane" id="reader-pane">
          {/* Thread summary bar */}
          <Show when={messages().length > 1}>
            <div class="thread-summary">
              <span class="thread-count-badge">{messages().length} messages</span>
            </div>
          </Show>

          {/* Messages */}
          <div class="reader-body">
            <Show when={loading()}>
              <div style={{ padding: '24px', color: 'var(--text-muted)', 'font-size': '13px' }}>Loading…</div>
            </Show>
            <For each={messages()}>
              {(msg) => {
                const sender = parseSender(msg.from);
                const isCollapsed = () => collapsed().has(msg.gmailMessageId);
                return (
                  <div
                    class={`thread-message${isCollapsed() ? ' thread-message-collapsed' : ''}`}
                    data-msg-id={msg.gmailMessageId}
                  >
                    <div
                      class="thread-message-header"
                      onClick={() => toggleCollapse(msg.gmailMessageId)}
                    >
                      <div
                        class="msg-avatar"
                        style={{ background: senderColor(sender.name) }}
                      >
                        {sender.name.charAt(0).toUpperCase()}
                      </div>
                      <div class="thread-msg-header-main">
                        <div class="thread-msg-header-row">
                          <span class="thread-msg-sender">{sender.name}</span>
                          <span class="thread-msg-to-compact">
                            to {msg.to ? parseSender(msg.to).name : 'me'}
                          </span>
                        </div>
                        <span class="thread-msg-preview">
                          {msg.body.slice(0, 120)}
                        </span>
                        <div class="thread-msg-details">
                          <div class="thread-msg-detail-line">
                            <span class="thread-msg-detail-label">From:</span>
                            <span class="thread-msg-addr">{msg.from}</span>
                          </div>
                          <Show when={msg.to}>
                            <div class="thread-msg-detail-line">
                              <span class="thread-msg-detail-label">To:</span>
                              <span class="thread-msg-addr">{msg.to}</span>
                            </div>
                          </Show>
                          <Show when={msg.cc}>
                            <div class="thread-msg-detail-line">
                              <span class="thread-msg-detail-label">Cc:</span>
                              <span class="thread-msg-addr">{msg.cc}</span>
                            </div>
                          </Show>
                        </div>
                      </div>
                      <span class="thread-msg-date">{formatDate(msg.receivedAt)}</span>
                      <span class="thread-msg-chevron" innerHTML={icon.chevronRight('12px')} />
                    </div>
                    <div class="thread-message-content">
                      <Show
                        when={msg.sanitizedHtml || msg.htmlBody}
                        fallback={
                          <div class="email-body-rendered">
                            <pre style={{ 'white-space': 'pre-wrap', 'font-family': 'inherit', margin: '0' }}>
                              {msg.body}
                            </pre>
                          </div>
                        }
                      >
                        <div
                          class="email-body-rendered"
                          innerHTML={msg.sanitizedHtml || msg.htmlBody || ''}
                        />
                      </Show>
                      {/* Per-message actions */}
                      <div class="msg-actions">
                        <button class="msg-action-btn" onClick={() => handleMsgReply(msg)} title="Reply">
                          <span innerHTML={icon.reply('14px')} /> Reply
                        </button>
                        <button class="msg-action-btn" onClick={() => handleMsgReplyAll(msg)} title="Reply All">
                          <span innerHTML={icon.reply('14px')} /> Reply All
                        </button>
                        <button class="msg-action-btn" onClick={() => handleMsgForward(msg)} title="Forward">
                          <span innerHTML={icon.reply('14px')} /> Forward
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Quote selection popup */}
          <Show when={quotePopup()}>
            {(popup) => (
              <div
                class="quote-popup"
                style={{
                  position: 'absolute',
                  left: `${popup().x}px`,
                  top: `${popup().y}px`,
                  transform: 'translateX(-50%)',
                }}
              >
                <button class="quote-popup-btn" onClick={handleQuoteReply}>
                  Reply with quote
                </button>
              </div>
            )}
          </Show>

          {/* Footer removed — per-message actions (Variant C) replace it */}

          {/* Inline compose — card style (Variant C) */}
          <Show when={appState.composeInline && appState.composeOpen}>
            <div class="inline-compose">
              <div class="inline-compose-header">
                <span class="inline-compose-label">
                  {appState.composeMode === 'replyAll' ? 'Reply All' : appState.composeMode === 'forward' ? 'Forward' : 'Reply'}
                </span>
                <button class="inline-compose-close" onClick={closeCompose} title="Discard">✕</button>
              </div>
              <div class="inline-compose-recipients">
                <label>To:</label>
                <input
                  type="text"
                  value={appState.composeTo}
                  onInput={(e) => setAppState('composeTo', e.currentTarget.value)}
                  id="inline-compose-to"
                />
              </div>
              <Show when={appState.composeCc}>
                <div class="inline-compose-recipients">
                  <label>Cc:</label>
                  <input
                    type="text"
                    value={appState.composeCc}
                    onInput={(e) => setAppState('composeCc', e.currentTarget.value)}
                    id="inline-compose-cc"
                  />
                </div>
              </Show>
              <div class="inline-compose-recipients">
                <label>Re:</label>
                <input
                  type="text"
                  value={appState.composeSubject}
                  onInput={(e) => setAppState('composeSubject', e.currentTarget.value)}
                  id="inline-compose-subject"
                />
              </div>
              <textarea
                class="inline-compose-body"
                value={appState.composeBody}
                onInput={(e) => setAppState('composeBody', e.currentTarget.value)}
                id="inline-compose-body"
                rows={6}
                placeholder="Write your reply..."
              />
              <div class="inline-compose-footer">
                <button class="btn-primary inline-compose-send" onClick={async () => {
                  if (!appState.account || !appState.composeTo.trim()) return;
                  try {
                    await sendEmail(appState.account, {
                      to: appState.composeTo,
                      cc: appState.composeCc || undefined,
                      subject: appState.composeSubject,
                      body: appState.composeBody,
                      threadId: appState.composeReplyThreadId || undefined,
                    });
                    showToast('Message sent', 3000);
                    closeCompose();
                  } catch (e) {
                    console.error('Send failed:', e);
                    showToast('Send failed');
                  }
                }}>Send</button>
              </div>
            </div>
          </Show>
        </div>
    </Show>
  );
}
