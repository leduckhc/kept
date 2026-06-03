// compose.ts — Unified Gmail-style floating compose panel
// Modes: new, reply, replyAll, forward. Supports multiple simultaneous panels.

import { loadSenderEmails, sendEmail, createDraft, updateDraft, deleteDraft } from './gmail';
import { scheduleEmail } from './scheduledSend';
import { state } from './state';
import { showToast, showUndoToast } from './toasts';
import { avatarColor } from './avatar';
import { esc } from './helpers';
import { icon } from './icons';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export interface ComposeOptions {
  mode: ComposeMode;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  quotedHtml?: string;
  quotedText?: string;
  threadId?: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; mimeType: string; data: Uint8Array }>;
  prefillTo?: string;
  prefillCc?: string;
  prefillBcc?: string;
  prefillSubject?: string;
  prefillBody?: string;
  draftId?: string; // existing Gmail draft ID (for updates)
}

// ── Multi-panel state ──
interface ComposeInstance {
  panel: HTMLElement;
  minimized: boolean;
  draftId: string | null;
  draftTimer: ReturnType<typeof setTimeout> | null;
}

const activePanels: ComposeInstance[] = [];
const MAX_PANELS = 3;

export function isComposeOpen(): boolean {
  return activePanels.length > 0;
}

export function closeCompose(panel?: HTMLElement) {
  if (panel) {
    const idx = activePanels.findIndex(p => p.panel === panel);
    if (idx >= 0) {
      const inst = activePanels[idx];
      if (inst.draftTimer) clearTimeout(inst.draftTimer);
      inst.panel.remove();
      activePanels.splice(idx, 1);
      repositionPanels();
    }
  } else {
    // Close all (legacy compat)
    for (const inst of activePanels) {
      if (inst.draftTimer) clearTimeout(inst.draftTimer);
      inst.panel.remove();
    }
    activePanels.length = 0;
  }
}

function repositionPanels() {
  // Stack panels from right, each offset 300px to the left
  activePanels.forEach((inst, i) => {
    if (!inst.panel.classList.contains('compose-panel-expanded')) {
      inst.panel.style.right = `${24 + i * 300}px`;
    }
  });
}

export async function openCompose(opts: ComposeOptions) {
  // Limit concurrent panels
  if (activePanels.length >= MAX_PANELS) {
    showToast('Close a compose window first (max 3)');
    return;
  }

  if (!state.account) return;

  let knownEmails: string[] = [];
  try {
    knownEmails = await loadSenderEmails(state.account.id);
  } catch { /* non-fatal */ }

  const pendingAttachments: Array<{ filename: string; mimeType: string; data: Uint8Array }> = [
    ...(opts.attachments ?? []),
  ];

  const modeTitle = opts.mode === 'reply' ? 'Reply'
    : opts.mode === 'replyAll' ? 'Reply All'
    : opts.mode === 'forward' ? 'Forward'
    : 'New Message';

  const showCcBcc = opts.mode === 'replyAll' || !!opts.cc || !!opts.bcc;

  const panel = document.createElement('div');
  panel.className = 'compose-panel';
  panel.innerHTML = `
    <div class="compose-panel-header">
      <span class="compose-panel-title">${modeTitle}</span>
      <div class="compose-panel-actions">
        <button class="btn-icon compose-panel-minimize" title="Minimize">—</button>
        <button class="btn-icon compose-panel-expand" title="Expand">${icon.expand('14px')}</button>
        <button class="btn-icon compose-panel-close" title="Close">${icon.close('14px')}</button>
      </div>
    </div>
    <div class="compose-panel-body">
      <div class="compose-field compose-to-row">
        <label class="compose-label">To</label>
        <input class="compose-input compose-to" type="text"
          value="${esc(opts.to ?? '')}"
          placeholder="name@example.com"
          autocomplete="off" aria-autocomplete="list" />
        <ul class="compose-ac" style="display:none"></ul>
        ${!showCcBcc ? '<button class="compose-cc-bcc-pill" type="button">Cc/Bcc</button>' : ''}
      </div>
      <div class="compose-field compose-cc-field" style="display:${showCcBcc ? '' : 'none'}">
        <label class="compose-label">Cc</label>
        <input class="compose-input compose-cc" type="text"
          value="${esc(opts.cc ?? '')}"
          placeholder="cc@example.com" />
      </div>
      <div class="compose-field compose-bcc-field" style="display:${showCcBcc ? '' : 'none'}">
        <label class="compose-label">Bcc</label>
        <input class="compose-input compose-bcc" type="text"
          value="${esc(opts.bcc ?? '')}"
          placeholder="bcc@example.com" />
      </div>
      <div class="compose-field">
        <label class="compose-label">Subject</label>
        <input class="compose-input compose-subject" type="text"
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
          <button class="toolbar-btn compose-attach-btn" title="Attach file">${icon.attach('14px')}</button>
          <input type="file" class="compose-file-input" multiple style="display:none" />
        </div>
        <div class="compose-editor-new" contenteditable="true" data-placeholder="Write your message…"></div>
      </div>
      <div class="compose-attachments-new"></div>
    </div>
    <div class="compose-panel-footer">
      <button class="compose-send-btn-new">${icon.send('14px')} Send</button>
      <button class="compose-schedule-btn" title="Schedule send">${icon.calendar('16px')}</button>
      <button class="compose-discard-btn-new" title="Discard">${icon.trash('16px')}</button>
    </div>`;

  document.body.appendChild(panel);

  const instance: ComposeInstance = {
    panel,
    minimized: false,
    draftId: opts.draftId ?? null,
    draftTimer: null,
  };
  activePanels.push(instance);
  repositionPanels();

  const toEl = panel.querySelector<HTMLInputElement>('.compose-to')!;
  const ccEl = panel.querySelector<HTMLInputElement>('.compose-cc');
  const bccEl = panel.querySelector<HTMLInputElement>('.compose-bcc');
  const subjectEl = panel.querySelector<HTMLInputElement>('.compose-subject')!;
  const editorEl = panel.querySelector<HTMLElement>('.compose-editor-new')!;
  const sendBtn = panel.querySelector<HTMLButtonElement>('.compose-send-btn-new')!;
  const attachmentsEl = panel.querySelector<HTMLElement>('.compose-attachments-new')!;
  const acList = panel.querySelector<HTMLUListElement>('.compose-ac')!;
  const fileInput = panel.querySelector<HTMLInputElement>('.compose-file-input')!;
  const bodyWrap = panel.querySelector<HTMLElement>('.compose-panel-body')!;

  // ── Cc/Bcc pill button ──
  const ccBccPill = panel.querySelector<HTMLButtonElement>('.compose-cc-bcc-pill');
  if (ccBccPill) {
    ccBccPill.addEventListener('click', () => {
      const ccField = panel.querySelector<HTMLElement>('.compose-cc-field');
      const bccField = panel.querySelector<HTMLElement>('.compose-bcc-field');
      if (ccField) { ccField.style.display = ''; ccField.classList.add('compose-cc-bcc-animated'); }
      if (bccField) { bccField.style.display = ''; bccField.classList.add('compose-cc-bcc-animated'); }
      ccBccPill.remove();
    });
  }

  // ── Quoted content for reply/forward ──
  if (opts.quotedHtml) {
    editorEl.innerHTML = `<br><br><div class="compose-quote">${opts.quotedHtml}</div>`;
  } else if (opts.quotedText) {
    editorEl.innerHTML = `<br><br><div class="compose-quote" style="border-left:2px solid var(--border);padding-left:8px;color:var(--text-muted);white-space:pre-wrap">${esc(opts.quotedText)}</div>`;
  }

  // Auto-append signature
  const sig = state.account?.signature;
  if (sig && !opts.quotedHtml && !opts.quotedText) {
    const sigText = sig.replace(/\\n/g, '\n');
    editorEl.innerHTML = `<br><div class="compose-signature" style="color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;margin-top:8px;font-size:13px;white-space:pre-wrap">-- \n${esc(sigText)}</div>`;
  }

  // ── Autocomplete ──
  let acIndex = -1;

  // ── Prefill from undo-send restore ──
  if (opts.prefillTo) toEl.value = opts.prefillTo;
  if (opts.prefillCc && ccEl) ccEl.value = opts.prefillCc;
  if (opts.prefillBcc && bccEl) bccEl.value = opts.prefillBcc;
  if (opts.prefillSubject) subjectEl.value = opts.prefillSubject;
  if (opts.prefillBody) editorEl.innerText = opts.prefillBody;

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
  toEl.addEventListener('blur', (e: FocusEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !related.closest('.compose-ac')) closeAc();
  });

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

  panel.querySelector('.compose-attach-btn')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files?.length) addFiles(fileInput.files); fileInput.value = ''; });

  // Drag & drop
  editorEl.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); editorEl.classList.add('drag-over'); });
  editorEl.addEventListener('dragleave', () => editorEl.classList.remove('drag-over'));
  editorEl.addEventListener('drop', (e: DragEvent) => { e.preventDefault(); editorEl.classList.remove('drag-over'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

  // Render pre-loaded attachments (forward mode)
  if (pendingAttachments.length) renderAttachments();

  // ── Draft auto-save (every 3s after content change) ──
  function scheduleDraftSave() {
    if (instance.draftTimer) clearTimeout(instance.draftTimer);
    instance.draftTimer = setTimeout(async () => {
      if (!state.account) return;
      const to = toEl.value.trim();
      const cc = ccEl?.value.trim() ?? '';
      const subject = subjectEl.value.trim();
      const body = editorEl.innerText.trim();
      // Only save if there's meaningful content
      if (!to && !subject && !body) return;
      try {
        if (instance.draftId) {
          await updateDraft(state.account, instance.draftId, { to, cc, subject, body, threadId: opts.threadId });
        } else {
          const id = await createDraft(state.account, { to, cc, subject, body, threadId: opts.threadId });
          instance.draftId = id;
        }
      } catch { /* non-fatal — draft save failure shouldn't block compose */ }
    }, 3000);
  }

  toEl.addEventListener('input', scheduleDraftSave);
  subjectEl.addEventListener('input', scheduleDraftSave);
  editorEl.addEventListener('input', scheduleDraftSave);
  if (ccEl) ccEl.addEventListener('input', scheduleDraftSave);

  // ── Minimize / Expand / Close ──
  panel.querySelector('.compose-panel-minimize')!.addEventListener('click', () => {
    instance.minimized = !instance.minimized;
    bodyWrap.style.display = instance.minimized ? 'none' : '';
    panel.querySelector<HTMLElement>('.compose-panel-footer')!.style.display = instance.minimized ? 'none' : '';
    panel.classList.toggle('compose-panel-minimized', instance.minimized);
  });

  panel.querySelector('.compose-panel-header')!.addEventListener('dblclick', () => {
    instance.minimized = !instance.minimized;
    bodyWrap.style.display = instance.minimized ? 'none' : '';
    panel.querySelector<HTMLElement>('.compose-panel-footer')!.style.display = instance.minimized ? 'none' : '';
    panel.classList.toggle('compose-panel-minimized', instance.minimized);
  });

  panel.querySelector('.compose-panel-expand')!.addEventListener('click', () => {
    if (instance.minimized) {
      instance.minimized = false;
      bodyWrap.style.display = '';
      panel.querySelector<HTMLElement>('.compose-panel-footer')!.style.display = '';
      panel.classList.remove('compose-panel-minimized');
    }
    panel.classList.toggle('compose-panel-expanded');
    repositionPanels();
  });

  async function discardAndClose() {
    // Delete draft from Gmail if one was saved
    if (instance.draftId && state.account) {
      try { await deleteDraft(state.account, instance.draftId); } catch { /* non-fatal */ }
    }
    closeCompose(panel);
  }

  panel.querySelector('.compose-panel-close')!.addEventListener('click', () => {
    const hasContent = editorEl.innerText.trim().length > 0 || pendingAttachments.length > 0;
    if (hasContent) {
      if (!confirm('Discard this draft?')) return;
    }
    discardAndClose();
  });

  panel.querySelector('.compose-discard-btn-new')!.addEventListener('click', () => {
    const hasContent = editorEl.innerText.trim().length > 0 || pendingAttachments.length > 0;
    if (hasContent) {
      if (!confirm('Discard this draft?')) return;
    }
    discardAndClose();
  });

  // ── Send ──
  sendBtn.addEventListener('click', async () => {
    const to = toEl.value.trim();
    const cc = ccEl?.value.trim() ?? '';
    const bcc = bccEl?.value.trim() ?? '';
    const subject = subjectEl.value.trim();
    const body = editorEl.innerText.trim();
    if (!to || (!body && !pendingAttachments.length) || !state.account) {
      showToast('Please fill in recipient and message');
      return;
    }

    const account = state.account;
    const draftId = instance.draftId;
    const payload = {
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: subject || '(no subject)',
      body: body || '(attached)',
      htmlBody: editorEl.innerHTML.trim() || undefined,
      threadId: opts.threadId,
      inReplyTo: opts.inReplyTo,
      attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
    };
    // Clear draft timer and close panel immediately
    if (instance.draftTimer) clearTimeout(instance.draftTimer);
    instance.draftId = null; // prevent discard from deleting draft we're about to send
    closeCompose(panel);

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        await sendEmail(account, payload);
        // Delete the draft after successful send
        if (draftId) {
          try { await deleteDraft(account, draftId); } catch { /* non-fatal */ }
        }
        showToast('Message sent');
      } catch (err) {
        showToast(`Send failed: ${err instanceof Error ? err.message : String(err)}`, 4000);
      }
    }, 5000);

    showUndoToast('Sending…', async () => {
      cancelled = true;
      clearTimeout(timer);
      // Re-open compose with the same content
      openCompose({
        ...opts,
        prefillTo: to,
        prefillCc: cc,
        prefillBcc: bcc,
        prefillSubject: subject,
        prefillBody: body,
        draftId: draftId ?? undefined,
      });
    });
  });

  // ── Keyboard ──
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (acList.style.display !== 'none') { closeAc(); return; }
      // Close schedule picker if open
      const picker = panel.querySelector('.schedule-send-popover');
      if (picker) { picker.remove(); return; }
      const hasContent = editorEl.innerText.trim().length > 0 || pendingAttachments.length > 0;
      if (!hasContent) closeCompose(panel);
    }
    // Cmd/Ctrl+Enter to send
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendBtn.click();
    }
  }
  panel.addEventListener('keydown', onKeyDown);

  // ── Schedule Send ──
  const scheduleBtn = panel.querySelector<HTMLButtonElement>('.compose-schedule-btn')!;
  scheduleBtn.addEventListener('click', () => {
    // Remove existing popover if open
    const existing = panel.querySelector('.schedule-send-popover');
    if (existing) { existing.remove(); return; }

    const popover = document.createElement('div');
    popover.className = 'schedule-send-popover';

    // Compute preset dates
    const now = new Date();
    const tomorrow9am = new Date(now);
    tomorrow9am.setDate(tomorrow9am.getDate() + 1);
    tomorrow9am.setHours(9, 0, 0, 0);

    const tomorrow2pm = new Date(now);
    tomorrow2pm.setDate(tomorrow2pm.getDate() + 1);
    tomorrow2pm.setHours(14, 0, 0, 0);

    const daysUntilMonday = ((8 - now.getDay()) % 7) || 7;
    const monday9am = new Date(now);
    monday9am.setDate(monday9am.getDate() + daysUntilMonday);
    monday9am.setHours(9, 0, 0, 0);

    popover.innerHTML = `
      <div class="schedule-send-title">Schedule Send</div>
      <button class="schedule-preset" data-time="${tomorrow9am.getTime()}">Tomorrow morning (9am)</button>
      <button class="schedule-preset" data-time="${tomorrow2pm.getTime()}">Tomorrow afternoon (2pm)</button>
      <button class="schedule-preset" data-time="${monday9am.getTime()}">Monday morning (9am)</button>
      <div class="schedule-custom">
        <input type="datetime-local" class="schedule-datetime-input" />
        <button class="schedule-custom-confirm">Schedule</button>
      </div>
    `;

    panel.querySelector('.compose-panel-footer')!.appendChild(popover);

    function doSchedule(scheduledAt: number) {
      const to = toEl.value.trim();
      const cc = ccEl?.value.trim() ?? '';
      const subject = subjectEl.value.trim();
      const body = editorEl.innerText.trim();
      if (!to || (!body && !pendingAttachments.length) || !state.account) {
        showToast('Please fill in recipient and message');
        return;
      }

      // Convert Uint8Array attachments to base64 for localStorage
      const attachments = pendingAttachments.length > 0
        ? pendingAttachments.map(a => ({
            filename: a.filename,
            mimeType: a.mimeType,
            data: btoa(String.fromCharCode(...a.data)),
          }))
        : undefined;

      scheduleEmail({
        accountId: state.account!.id,
        to,
        cc: cc || undefined,
        subject: subject || '(no subject)',
        body: body || '(attached)',
        scheduledAt,
        threadId: opts.threadId,
        inReplyTo: opts.inReplyTo,
        attachments,
      });

      popover.remove();
      closeCompose(panel);
      const d = new Date(scheduledAt);
      showToast(`Scheduled for ${d.toLocaleString()}`);
    }

    popover.querySelectorAll<HTMLButtonElement>('.schedule-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        doSchedule(parseInt(btn.dataset.time!));
      });
    });

    const customConfirm = popover.querySelector<HTMLButtonElement>('.schedule-custom-confirm')!;
    const customInput = popover.querySelector<HTMLInputElement>('.schedule-datetime-input')!;
    customConfirm.addEventListener('click', () => {
      if (!customInput.value) { showToast('Pick a date/time'); return; }
      doSchedule(new Date(customInput.value).getTime());
    });
  });

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

export async function openComposeReplyAll(opts: {
  to: string;
  cc: string;
  subject: string;
  threadId: string;
  inReplyTo?: string;
  quotedText?: string;
  quotedHtml?: string;
}) {
  await openCompose({
    mode: 'replyAll',
    to: opts.to,
    cc: opts.cc,
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
