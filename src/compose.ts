// compose.ts — Unified Gmail-style floating compose panel
// Modes: new, reply, forward. Supports rich text, attachments, autocomplete.

import { loadSenderEmails, sendEmail } from './gmail';
import { state } from './state';
import { showToast } from './toasts';
import { avatarColor } from './avatar';
import { esc } from './helpers';
import { icon } from './icons';

export type ComposeMode = 'new' | 'reply' | 'forward';

export interface ComposeOptions {
  mode: ComposeMode;
  to?: string;
  subject?: string;
  quotedHtml?: string;
  quotedText?: string;
  threadId?: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: Uint8Array }>;
}

let activePanel: HTMLElement | null = null;
let minimized = false;

export function isComposeOpen(): boolean {
  return !!activePanel;
}

export function closeCompose() {
  if (activePanel) {
    activePanel.remove();
    activePanel = null;
    minimized = false;
  }
}

export async function openCompose(opts: ComposeOptions) {
  // Close existing panel if open
  if (activePanel) closeCompose();

  if (!state.account) return;

  let knownEmails: string[] = [];
  try {
    knownEmails = await loadSenderEmails(state.account.id);
  } catch { /* non-fatal */ }

  const pendingAttachments: Array<{ filename: string; mimeType: string; data: Uint8Array }> = [
    ...(opts.attachments ?? []),
  ];

  const modeTitle = opts.mode === 'reply' ? 'Reply' : opts.mode === 'forward' ? 'Forward' : 'New Message';

  const panel = document.createElement('div');
  panel.className = 'compose-panel';
  panel.id = 'compose-panel';
  panel.innerHTML = `
    <div class="compose-panel-header" id="compose-panel-header">
      <span class="compose-panel-title">${modeTitle}</span>
      <div class="compose-panel-actions">
        <button class="btn-icon compose-panel-minimize" id="compose-minimize" title="Minimize">—</button>
        <button class="btn-icon compose-panel-expand" id="compose-expand" title="Expand">${icon.expand('14px')}</button>
        <button class="btn-icon compose-panel-close" id="compose-close" title="Close">${icon.close('14px')}</button>
      </div>
    </div>
    <div class="compose-panel-body" id="compose-panel-body">
      <div class="compose-field">
        <label class="compose-label">To</label>
        <input class="compose-input" id="compose-to" type="text"
          value="${esc(opts.to ?? '')}"
          placeholder="name@example.com"
          autocomplete="off" aria-autocomplete="list" />
        <ul class="compose-ac" id="compose-ac" style="display:none"></ul>
      </div>
      <div class="compose-field">
        <label class="compose-label">Subject</label>
        <input class="compose-input" id="compose-subject" type="text"
          value="${esc(opts.subject ?? '')}"
          placeholder="Subject" />
      </div>
      <div class="compose-editor-wrap">
        <div class="compose-toolbar-new">
          <button class="toolbar-btn" data-cmd="bold" title="Bold (⌘B)">${icon.bold('14px')}</button>
          <button class="toolbar-btn" data-cmd="italic" title="Italic (⌘I)">${icon.italic('14px')}</button>
          <button class="toolbar-btn" data-cmd="underline" title="Underline (⌘U)">${icon.underline('14px')}</button>
          <span class="toolbar-sep"></span>
          <button class="toolbar-btn" data-cmd="insertUnorderedList" title="Bullet list">•</button>
          <button class="toolbar-btn" data-cmd="insertOrderedList" title="Numbered list">1.</button>
          <span class="toolbar-sep"></span>
          <button class="toolbar-btn" id="compose-attach-btn" title="Attach file">${icon.attach('14px')}</button>
          <input type="file" id="compose-file-input" multiple style="display:none" />
        </div>
        <div class="compose-editor-new" id="compose-editor" contenteditable="true" data-placeholder="Write your message…"></div>
      </div>
      <div class="compose-attachments-new" id="compose-attachments"></div>
    </div>
    <div class="compose-panel-footer">
      <button class="compose-send-btn-new" id="compose-send-btn">${icon.send('14px')} Send</button>
      <button class="compose-discard-btn-new" id="compose-discard-btn">Discard</button>
    </div>`;

  document.body.appendChild(panel);
  activePanel = panel;

  const toEl = panel.querySelector<HTMLInputElement>('#compose-to')!;
  const subjectEl = panel.querySelector<HTMLInputElement>('#compose-subject')!;
  const editorEl = panel.querySelector<HTMLElement>('#compose-editor')!;
  const sendBtn = panel.querySelector<HTMLButtonElement>('#compose-send-btn')!;
  const attachmentsEl = panel.querySelector<HTMLElement>('#compose-attachments')!;
  const acList = panel.querySelector<HTMLUListElement>('#compose-ac')!;
  const fileInput = panel.querySelector<HTMLInputElement>('#compose-file-input')!;
  const bodyWrap = panel.querySelector<HTMLElement>('#compose-panel-body')!;

  // ── Quoted content for reply/forward ──
  if (opts.quotedHtml) {
    editorEl.innerHTML = `<br><br><div class="compose-quote">${opts.quotedHtml}</div>`;
  } else if (opts.quotedText) {
    editorEl.innerHTML = `<br><br><div class="compose-quote" style="border-left:2px solid var(--border);padding-left:8px;color:var(--text-muted);white-space:pre-wrap">${esc(opts.quotedText)}</div>`;
  }

  // Auto-append signature
  const sig = state.account?.signature;
  if (sig && !opts.quotedHtml && !opts.quotedText) {
    // Replace literal \n sequences with real newlines (DB may store escaped form)
    const sigText = sig.replace(/\\n/g, '\n');
    editorEl.innerHTML = `<br><div class="compose-signature" style="color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;margin-top:8px;font-size:13px;white-space:pre-wrap">-- \n${esc(sigText)}</div>`;
  }

  // ── Autocomplete ──
  let acIndex = -1;

  function closeAc() {
    acList.style.display = 'none';
    acList.innerHTML = '';
    acIndex = -1;
  }

  function selectAcItem(email: string) {
    const parts = toEl.value.split(',');
    parts[parts.length - 1] = email;
    toEl.value = parts.join(', ') + ', ';
    closeAc();
    toEl.focus();
  }

  toEl.addEventListener('input', () => {
    const parts = toEl.value.split(',');
    const query = parts[parts.length - 1].trim().toLowerCase();
    if (!query) { closeAc(); return; }
    const matches = knownEmails.filter(e => e.toLowerCase().includes(query)).slice(0, 6);
    if (!matches.length) { closeAc(); return; }
    acList.innerHTML = matches.map((email, i) => {
      const bg = avatarColor(email);
      return `<li class="compose-ac-item" data-email="${esc(email)}" data-idx="${i}">
        <span class="compose-ac-avatar" style="background:${bg}">${email[0].toUpperCase()}</span>
        <span class="compose-ac-email">${esc(email)}</span>
      </li>`;
    }).join('');
    acList.style.display = 'block';
    acIndex = -1;
  });

  acList.addEventListener('mousedown', e => {
    const li = (e.target as Element).closest<HTMLElement>('.compose-ac-item');
    if (li) { e.preventDefault(); selectAcItem(li.dataset.email!); }
  });

  toEl.addEventListener('keydown', (e: KeyboardEvent) => {
    const items = acList.querySelectorAll<HTMLElement>('.compose-ac-item');
    if (acList.style.display !== 'none' && items.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = Math.min(acIndex + 1, items.length - 1); items.forEach((el, i) => el.classList.toggle('compose-ac-item--active', i === acIndex)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = Math.max(acIndex - 1, 0); items.forEach((el, i) => el.classList.toggle('compose-ac-item--active', i === acIndex)); return; }
      if (e.key === 'Enter' && acIndex >= 0) { e.preventDefault(); selectAcItem(items[acIndex].dataset.email!); return; }
      if (e.key === 'Escape') { e.stopPropagation(); closeAc(); return; }
    }
  });
  toEl.addEventListener('blur', () => setTimeout(closeAc, 150));

  // ── Rich text toolbar ──
  panel.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = (btn as HTMLElement).dataset.cmd!;
      if (cmd === 'createLink') {
        const url = prompt('URL:');
        if (url) document.execCommand(cmd, false, url);
      } else {
        document.execCommand(cmd, false);
      }
      editorEl.focus();
    });
  });

  // ── Attachments ──
  function getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('zip')) return '📦';
    return '📎';
  }

  function renderAttachments() {
    if (!pendingAttachments.length) { attachmentsEl.innerHTML = ''; return; }
    attachmentsEl.innerHTML = pendingAttachments.map((a, i) => `
      <div class="compose-att-chip">
        <span>${getFileIcon(a.mimeType)}</span>
        <span class="compose-att-name">${esc(a.filename)}</span>
        <button class="compose-att-remove" data-idx="${i}">✕</button>
      </div>`).join('');
    attachmentsEl.querySelectorAll('.compose-att-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingAttachments.splice(parseInt((btn as HTMLElement).dataset.idx!), 1);
        renderAttachments();
      });
    });
  }

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      pendingAttachments.push({ filename: file.name, mimeType: file.type || 'application/octet-stream', data: new Uint8Array(buf) });
    }
    renderAttachments();
  }

  panel.querySelector('#compose-attach-btn')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files?.length) addFiles(fileInput.files); fileInput.value = ''; });

  // Drag & drop
  editorEl.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); editorEl.classList.add('drag-over'); });
  editorEl.addEventListener('dragleave', () => editorEl.classList.remove('drag-over'));
  editorEl.addEventListener('drop', (e: DragEvent) => { e.preventDefault(); editorEl.classList.remove('drag-over'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

  // Render pre-loaded attachments (forward mode)
  if (pendingAttachments.length) renderAttachments();

  // ── Minimize / Expand / Close ──
  panel.querySelector('#compose-minimize')!.addEventListener('click', () => {
    minimized = !minimized;
    bodyWrap.style.display = minimized ? 'none' : '';
    panel.querySelector<HTMLElement>('.compose-panel-footer')!.style.display = minimized ? 'none' : '';
    panel.classList.toggle('compose-panel-minimized', minimized);
  });

  panel.querySelector('#compose-panel-header')!.addEventListener('dblclick', () => {
    minimized = !minimized;
    bodyWrap.style.display = minimized ? 'none' : '';
    panel.querySelector<HTMLElement>('.compose-panel-footer')!.style.display = minimized ? 'none' : '';
    panel.classList.toggle('compose-panel-minimized', minimized);
  });

  panel.querySelector('#compose-expand')!.addEventListener('click', () => {
    // Un-minimize first if minimized
    if (minimized) {
      minimized = false;
      bodyWrap.style.display = '';
      panel.querySelector<HTMLElement>('.compose-panel-footer')!.style.display = '';
      panel.classList.remove('compose-panel-minimized');
    }
    panel.classList.toggle('compose-panel-expanded');
  });

  panel.querySelector('#compose-close')!.addEventListener('click', () => {
    const hasContent = editorEl.innerText.trim().length > 0 || pendingAttachments.length > 0;
    if (hasContent) {
      if (!confirm('Discard this draft?')) return;
    }
    closeCompose();
  });

  panel.querySelector('#compose-discard-btn')!.addEventListener('click', () => {
    const hasContent = editorEl.innerText.trim().length > 0 || pendingAttachments.length > 0;
    if (hasContent) {
      if (!confirm('Discard this draft?')) return;
    }
    closeCompose();
  });

  // ── Send ──
  sendBtn.addEventListener('click', async () => {
    const to = toEl.value.trim();
    const subject = subjectEl.value.trim();
    const body = editorEl.innerText.trim();
    if (!to || (!body && !pendingAttachments.length) || !state.account) {
      showToast('Please fill in recipient and message');
      return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="compose-spinner"></span> Sending…';

    try {
      await sendEmail(state.account, {
        to,
        subject: subject || '(no subject)',
        body: body || '(attached)',
        threadId: opts.threadId,
        inReplyTo: opts.inReplyTo,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      });
      sendBtn.innerHTML = '✓ Sent';
      sendBtn.classList.add('send-success');
      showToast('Message sent');
      setTimeout(() => closeCompose(), 1000);
    } catch (err) {
      sendBtn.innerHTML = `${icon.send('14px')} Send`;
      sendBtn.disabled = false;
      showToast(`Failed: ${err instanceof Error ? err.message : String(err)}`, 4000);
    }
  });

  // ── Keyboard ──
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (acList.style.display !== 'none') { closeAc(); return; }
      const hasContent = editorEl.innerText.trim().length > 0 || pendingAttachments.length > 0;
      if (!hasContent) closeCompose();
    }
    // Cmd/Ctrl+Enter to send
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendBtn.click();
    }
  }
  panel.addEventListener('keydown', onKeyDown);

  // Focus first empty field
  if (!opts.to) toEl.focus();
  else if (!opts.subject) subjectEl.focus();
  else editorEl.focus();
}

// ── Convenience wrappers ──

export async function openComposeNew(
  prefillSubject = '',
  _openSnippetPicker: (ta: HTMLTextAreaElement | null) => void = () => {},
  _showFollowupPrompt: (opts: { threadId: string; subject: string; sentTo: string }) => void = () => {},
) {
  await openCompose({ mode: 'new', subject: prefillSubject });
}

export async function openComposeReply(opts: {
  to: string;
  subject: string;
  threadId: string;
  inReplyTo?: string;
  quotedText?: string;
  quotedHtml?: string;
}) {
  await openCompose({
    mode: 'reply',
    to: opts.to,
    subject: opts.subject.startsWith('Re:') ? opts.subject : `Re: ${opts.subject}`,
    threadId: opts.threadId,
    inReplyTo: opts.inReplyTo,
    quotedText: opts.quotedText,
    quotedHtml: opts.quotedHtml,
  });
}

export async function openComposeForward(opts: {
  subject: string;
  quotedText?: string;
  quotedHtml?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: Uint8Array }>;
}) {
  await openCompose({
    mode: 'forward',
    subject: opts.subject.startsWith('Fwd:') ? opts.subject : `Fwd: ${opts.subject}`,
    quotedText: opts.quotedText,
    quotedHtml: opts.quotedHtml,
    attachments: opts.attachments,
  });
}
