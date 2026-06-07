/**
 * ThreadReader — Full reader component showing selected thread's messages.
 * Message cards with HTML body (sanitized), reply/forward buttons, inline reply.
 */
import { Show, onMount, onCleanup } from 'solid-js';
import { selectedThread, selectThread, openCompose } from './store';
import { doArchive, doToggleStar, doMarkRead, doMute } from './actions';
import { icon } from '../icons';

export function ThreadReader() {
  const thread = selectedThread;

  const onClose = () => {
    selectThread(null);
  };

  // Mark as read when opened
  onMount(() => {
    const t = thread();
    if (t && t.isUnread) {
      doMarkRead(t);
    }
  });

  // Keyboard: Escape closes reader
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && thread()) {
      onClose();
    }
  };

  onMount(() => document.addEventListener('keydown', handleKeydown));
  onCleanup(() => document.removeEventListener('keydown', handleKeydown));

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

  const handleArchive = () => {
    const t = thread();
    if (t) {
      doArchive(t);
      selectThread(null);
    }
  };

  const handleStar = () => {
    const t = thread();
    if (t) doToggleStar(t);
  };

  const handleMute = () => {
    const t = thread();
    if (t) {
      doMute(t);
      selectThread(null);
    }
  };

  return (
    <Show when={thread()}>
      {(t) => (
        <div class="reader-pane" id="reader-pane">
          <div class="reader-toolbar">
            <button class="btn-icon" title="Archive" onClick={handleArchive} innerHTML={icon.archive('16px')} />
            <button class="btn-icon" title={t().isStarred ? 'Unstar' : 'Star'} onClick={handleStar} innerHTML={icon.star('16px')} />
            <button class="btn-icon" title="Mute" onClick={handleMute} innerHTML={icon.mute('16px')} />
          </div>
          <div class="reader-messages">
            <div class="message-card">
              <div class="message-header">
                <div class="message-avatar">
                  {(t().senderName || t().senderEmail).charAt(0).toUpperCase()}
                </div>
                <div class="message-meta">
                  <span class="message-sender">{t().senderName || t().senderEmail}</span>
                  <span class="message-date">
                    {new Date(t().receivedAt).toLocaleDateString([], {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
              <div class="message-subject">{t().subject}</div>
              <div class="message-body">
                <p>{t().snippet}</p>
              </div>
            </div>
          </div>
          <div class="reader-reply-area">
            <button class="btn-reply" onClick={handleReply}>
              <span innerHTML={icon.reply('16px')} /> Reply
            </button>
            <button class="btn-reply" onClick={handleForward}>
              <span innerHTML={icon.reply('16px')} /> Forward
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
