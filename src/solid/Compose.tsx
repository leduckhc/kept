/**
 * Compose.tsx — Compose overlay/panel for new message, reply, forward.
 * Shows/hides based on store state.
 */
import { Show, createSignal } from 'solid-js';
import { appState, setAppState, closeCompose } from './store';
import { sendEmail } from '../gmail';
import { showToast } from '../toasts';
import { icon } from '../icons';

export function Compose() {
  const [sending, setSending] = createSignal(false);

  const modeLabel = () => {
    switch (appState.composeMode) {
      case 'reply': return 'Reply';
      case 'replyAll': return 'Reply All';
      case 'forward': return 'Forward';
      default: return 'New Message';
    }
  };

  const handleSend = async () => {
    if (!appState.account) return;
    if (!appState.composeTo.trim()) {
      showToast('Please enter a recipient');
      return;
    }
    setSending(true);
    try {
      await sendEmail(appState.account, {
        to: appState.composeTo,
        cc: appState.composeCc || undefined,
        bcc: appState.composeBcc || undefined,
        subject: appState.composeSubject,
        body: appState.composeBody,
        threadId: appState.composeReplyThreadId || undefined,
      });
      showToast('Message sent', 3000);
      closeCompose();
    } catch (e) {
      console.error('Send failed:', e);
      showToast('Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCompose();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <Show when={appState.composeOpen}>
      <div class="compose-panel" onKeyDown={handleKeyDown}>
        <div class="compose-header">
          <span class="compose-title">{modeLabel()}</span>
          <button class="btn-icon compose-close" onClick={closeCompose} innerHTML={icon.close('16px')} />
        </div>
        <div class="compose-fields">
          <div class="compose-field">
            <label>To</label>
            <input
              type="email"
              value={appState.composeTo}
              onInput={(e) => setAppState('composeTo', e.currentTarget.value)}
              placeholder="recipient@example.com"
            />
          </div>
          <Show when={appState.composeMode === 'new' || appState.composeMode === 'forward'}>
            <div class="compose-field">
              <label>Cc</label>
              <input
                type="email"
                value={appState.composeCc}
                onInput={(e) => setAppState('composeCc', e.currentTarget.value)}
                placeholder="cc@example.com"
              />
            </div>
          </Show>
          <div class="compose-field">
            <label>Subject</label>
            <input
              type="text"
              value={appState.composeSubject}
              onInput={(e) => setAppState('composeSubject', e.currentTarget.value)}
              placeholder="Subject"
            />
          </div>
        </div>
        <div class="compose-body-area">
          <textarea
            class="compose-textarea"
            value={appState.composeBody}
            onInput={(e) => setAppState('composeBody', e.currentTarget.value)}
            placeholder="Write your message…"
            rows={12}
          />
        </div>
        <div class="compose-footer">
          <button
            class="btn-send"
            onClick={handleSend}
            disabled={sending()}
          >
            <span innerHTML={icon.send('14px')} />
            {sending() ? 'Sending…' : 'Send'}
          </button>
          <button class="btn-discard" onClick={closeCompose}>
            Discard
          </button>
        </div>
      </div>
    </Show>
  );
}
