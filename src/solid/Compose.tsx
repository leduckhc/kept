/**
 * Compose.tsx — Compose overlay/panel for new message, reply, forward.
 * Shows/hides based on store state.
 * Uses compose-panel CSS structure from styles.css.
 */
import { Show, createSignal } from 'solid-js';
import { appState, setAppState, closeCompose } from './store';
import { sendEmail } from '../gmail';
import { showToast } from '../toasts';
import { icon } from '../icons';

export function Compose() {
  const [sending, setSending] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);

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
      <div
        class={`compose-panel${expanded() ? ' compose-panel-expanded' : ''}`}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div class="compose-panel-header">
          <span class="compose-panel-title">{modeLabel()}</span>
          <div class="compose-panel-actions">
            <button
              class="btn-icon"
              title={expanded() ? 'Collapse' : 'Expand'}
              onClick={() => setExpanded(!expanded())}
              innerHTML={icon.expand('14px')}
            />
            <button
              class="btn-icon"
              title="Close"
              onClick={closeCompose}
              innerHTML={icon.close('14px')}
            />
          </div>
        </div>

        {/* Body: fields + editor */}
        <div class="compose-panel-body">
          <div class="compose-field">
            <label class="compose-label">To</label>
            <input
              class="compose-input"
              type="email"
              value={appState.composeTo}
              onInput={(e) => setAppState('composeTo', e.currentTarget.value)}
              placeholder="recipient@example.com"
            />
          </div>
          <Show when={appState.composeMode === 'new' || appState.composeMode === 'forward'}>
            <div class="compose-field">
              <label class="compose-label">Cc</label>
              <input
                class="compose-input"
                type="email"
                value={appState.composeCc}
                onInput={(e) => setAppState('composeCc', e.currentTarget.value)}
                placeholder="cc@example.com"
              />
            </div>
          </Show>
          <div class="compose-field">
            <label class="compose-label">Subject</label>
            <input
              class="compose-input"
              type="text"
              value={appState.composeSubject}
              onInput={(e) => setAppState('composeSubject', e.currentTarget.value)}
              placeholder="Subject"
            />
          </div>
          <div class="compose-editor-wrap">
            <div
              class="compose-editor-new"
              contentEditable
              data-placeholder="Write your message…"
              onInput={(e) => setAppState('composeBody', (e.currentTarget as HTMLElement).innerText)}
              ref={(el) => {
                // Set initial content if replying/forwarding
                if (appState.composeBody) {
                  el.innerText = appState.composeBody;
                }
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div class="compose-panel-footer">
          <div class="compose-footer-left">
            {/* Future: formatting toolbar buttons */}
          </div>
          <div class="compose-footer-right">
            <button
              class="compose-send-btn-new"
              onClick={handleSend}
              disabled={sending()}
            >
              <span innerHTML={icon.send('14px')} />
              {sending() ? 'Sending…' : 'Send'}
            </button>
          </div>
          <button
            class="compose-discard-btn-new"
            title="Discard"
            onClick={closeCompose}
            innerHTML={icon.trash('14px')}
          />
        </div>
      </div>
    </Show>
  );
}
