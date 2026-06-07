/**
 * ThreadReader — Full reader component showing selected thread's messages.
 * Fetches message bodies via fetchMessageBody, renders sanitized HTML.
 * Uses thread-message / reader-* CSS structure from styles.css.
 */
import { Show, For, createSignal, createEffect } from 'solid-js';
import { appState, selectedThread, openCompose } from './store';
import { doMarkRead } from './actions';
import { fetchMessageBody } from '../gmail';
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

export function ThreadReader() {
  const thread = selectedThread;
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set<string>());

  // Fetch messages when thread changes
  createEffect(() => {
    const t = thread();
    if (!t || !appState.account) {
      setMessages([]);
      return;
    }
    const threadId = t.id; // capture for staleness check
    setLoading(true);
    fetchMessageBody(appState.account, t.gmailThreadId)
      .then((result) => {
        // Discard if thread changed while fetching
        if (thread()?.id !== threadId) return;
        setMessages(result.messages);
        // Collapse all but last message in multi-message threads
        if (result.messages.length > 1) {
          const ids = new Set<string>(result.messages.slice(0, -1).map(m => m.gmailMessageId));
          setCollapsed(ids);
        } else {
          setCollapsed(new Set<string>());
        }
      })
      .catch((err) => {
        // Discard if thread changed while fetching
        if (thread()?.id !== threadId) return;
        // Expected for archived/trashed threads (Gmail 404) — show snippet fallback
        if (String(err).includes('404')) {
          console.debug('Thread not available on Gmail, showing local data:', t.id);
        } else {
          console.error('Failed to fetch messages:', err);
        }
        // Fallback: show snippet as plain text
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

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReply = () => {
    const t = thread();
    if (!t) return;
    openCompose('reply', { to: t.senderEmail, subject: `Re: ${t.subject}`, threadId: t.id });
  };

  const handleForward = () => {
    const t = thread();
    if (!t) return;
    openCompose('forward', { subject: `Fwd: ${t.subject}`, threadId: t.id });
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
                  <div class={`thread-message${isCollapsed() ? ' thread-message-collapsed' : ''}`}>
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
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Reply footer */}
          <div class="reader-footer">
            <div class="reader-footer-actions">
              <button class="btn-primary" onClick={handleReply}>
                <span innerHTML={icon.reply('14px')} /> Reply
              </button>
              <button class="btn-primary" onClick={handleForward}>
                <span innerHTML={icon.reply('14px')} /> Forward
              </button>
            </div>
          </div>
        </div>
    </Show>
  );
}
