/**
 * Compose.tsx — Compose overlay/panel for new message, reply, forward.
 * Shows/hides based on store state.
 * Uses compose-panel CSS structure from styles.css.
 */
import { Show, For, createSignal } from 'solid-js';
import { appState, setAppState, closeCompose } from './store';
import { sendEmail } from '../gmail';
import { showToast } from '../toasts';
import { icon } from '../icons';

interface PendingAttachment {
  file: File;
  filename: string;
  size: number;
  mimeType: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function Compose() {
  const [sending, setSending] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [attachments, setAttachments] = createSignal<PendingAttachment[]>([]);
  const [dragging, setDragging] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const addFiles = (files: FileList | File[]) => {
    const newAtts = [...files].map(f => ({
      file: f,
      filename: f.name,
      size: f.size,
      mimeType: f.type || 'application/octet-stream',
    }));
    setAttachments(prev => [...prev, ...newAtts]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

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
      // Convert pending files to Uint8Array for sendEmail
      const attData = await Promise.all(
        attachments().map(async (a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          data: new Uint8Array(await a.file.arrayBuffer()),
        }))
      );
      await sendEmail(appState.account, {
        to: appState.composeTo,
        cc: appState.composeCc || undefined,
        bcc: appState.composeBcc || undefined,
        subject: appState.composeSubject,
        body: appState.composeBody,
        threadId: appState.composeReplyThreadId || undefined,
        attachments: attData.length > 0 ? attData : undefined,
      });
      showToast('Message sent', 3000);
      setAttachments([]);
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
    <Show when={appState.composeOpen && !appState.composeInline}>
      <div
        class={`compose-panel${expanded() ? ' compose-panel-expanded' : ''}${dragging() ? ' compose-drag-over' : ''}`}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
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

        {/* Pending Attachments */}
        <Show when={attachments().length > 0}>
          <div class="compose-attachments">
            <For each={attachments()}>
              {(att, idx) => (
                <div class="compose-attachment-chip">
                  <span class="compose-attachment-name">{att.filename}</span>
                  <span class="compose-attachment-size">{formatSize(att.size)}</span>
                  <button class="compose-attachment-remove" onClick={() => removeAttachment(idx())}>×</button>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Hidden file input */}
        <input
          type="file"
          multiple
          style="display:none"
          ref={fileInput}
          onChange={(e) => { if (e.currentTarget.files) addFiles(e.currentTarget.files); e.currentTarget.value = ''; }}
        />

        {/* Footer */}
        <div class="compose-panel-footer">
          <div class="compose-footer-left">
            <button
              class="btn-icon"
              title="Attach file"
              onClick={() => fileInput?.click()}
              innerHTML={icon.attach('14px')}
            />
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
