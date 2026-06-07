/**
 * ThreadReader — Solid component showing the selected thread's messages.
 * Reactively shows/hides based on selectedThread().
 */
import { Show, onMount, onCleanup } from 'solid-js';
import { selectedThread, selectThread } from './store';
import { icon } from '../icons';

export function ThreadReader() {
  const thread = selectedThread;

  const onClose = () => {
    selectThread(null);
    document.getElementById('app-shell')?.classList.remove('reader-open');
  };

  // Keyboard: Escape closes reader
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && thread()) {
      onClose();
    }
  };

  onMount(() => document.addEventListener('keydown', handleKeydown));
  onCleanup(() => document.removeEventListener('keydown', handleKeydown));

  return (
    <Show when={thread()}>
      {(t) => (
        <div class="reader-pane" id="reader-pane">
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
              <div class="message-body">
                <p>{t().snippet}</p>
              </div>
            </div>
          </div>
          <div class="reader-reply-area">
            <button class="btn-reply">
              <span innerHTML={icon.reply('16px')} /> Reply
            </button>
            <button class="btn-reply">
              <span innerHTML={icon.reply('16px')} /> Forward
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
