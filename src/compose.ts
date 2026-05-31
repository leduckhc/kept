import { loadSenderEmails, sendEmail } from './gmail';
import { state } from './state';
import { showToast } from './toasts';
import { avatarColor } from './avatar';
import { esc } from './helpers';

export async function openComposeNew(
  prefillSubject = '',
  openSnippetPicker: (ta: HTMLTextAreaElement | null) => void = () => {},
  showFollowupPrompt: (opts: { threadId: string; subject: string; sentTo: string }) => void = () => {},
) {
  if (!state.account) return;
  if (document.getElementById('compose-new-panel')) return;

  let knownEmails: string[] = [];
  try {
    knownEmails = await loadSenderEmails(state.account.id);
  } catch { /* non-fatal */ }

  const overlay = document.createElement('div');
  overlay.className = 'reader-overlay compose-new-overlay';

  const panelId = 'compose-new-panel';
  const titleId = 'compose-new-title';
  overlay.innerHTML = `
    <div class="compose-new-panel" id="${panelId}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="compose-new-header">
        <span class="compose-new-title" id="${titleId}">New Message</span>
        <button class="btn-icon compose-new-close-btn" id="compose-new-close" aria-label="Close">✕</button>
      </div>
      <div class="compose-new-body-area">
        <div class="compose-field-group" style="position:relative">
          <label class="compose-field-label" for="compose-new-to">To</label>
          <input class="compose-field-input" id="compose-new-to" type="text"
            placeholder="name@example.com, another@example.com"
            autocomplete="off" aria-autocomplete="list" aria-controls="compose-ac-list" />
          <ul class="compose-ac-list" id="compose-ac-list" role="listbox" aria-label="Suggestions" style="display:none"></ul>
        </div>
        <div class="compose-field-group">
          <label class="compose-field-label" for="compose-new-subject">Subject</label>
          <input class="compose-field-input" id="compose-new-subject" type="text" placeholder="Subject" />
        </div>
        <div class="compose-field-group" style="flex:1;display:flex;flex-direction:column">
          <label class="compose-field-label" for="compose-new-body-ta">Body</label>
          <textarea class="compose-field-input compose-new-body-ta" id="compose-new-body-ta"
            placeholder="Write your message…" style="flex:1;min-height:120px;resize:vertical"></textarea>
        </div>
        <div id="compose-new-error" class="compose-new-error-banner" style="display:none"></div>
      </div>
      <div class="compose-new-footer">
        <button class="compose-send-btn" id="compose-new-send" disabled>Send</button>
        <button class="compose-discard-btn" id="compose-new-discard">Discard</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const panelEl = overlay.querySelector<HTMLElement>('#compose-new-panel')!;
  const toEl = overlay.querySelector<HTMLInputElement>('#compose-new-to')!;
  const subjectEl = overlay.querySelector<HTMLInputElement>('#compose-new-subject')!;
  const bodyEl = overlay.querySelector<HTMLTextAreaElement>('#compose-new-body-ta')!;
  const sendBtn = overlay.querySelector<HTMLButtonElement>('#compose-new-send')!;
  const errorEl = overlay.querySelector<HTMLElement>('#compose-new-error')!;
  const acList = overlay.querySelector<HTMLUListElement>('#compose-ac-list')!;

  function isValidEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  }

  function updateSendState() {
    const toList = toEl.value.split(',').map(s => s.trim()).filter(Boolean);
    const allValid = toList.length > 0 && toList.every(isValidEmail);
    const ok = allValid && bodyEl.value.trim().length > 0;
    sendBtn.disabled = !ok;
    (sendBtn as HTMLButtonElement).style.opacity = ok ? '1' : '0.35';
    (sendBtn as HTMLButtonElement).style.cursor = ok ? 'pointer' : 'default';
  }

  let acIndex = -1;

  function closeAc() {
    acList.style.display = 'none';
    acList.innerHTML = '';
    acIndex = -1;
  }

  function renderAc(items: string[]) {
    if (items.length === 0) { closeAc(); return; }
    acList.innerHTML = items.slice(0, 6).map((email, i) => {
      const initials = email[0].toUpperCase();
      const bg = avatarColor(email);
      return `<li class="compose-ac-item" role="option" data-email="${esc(email)}" data-idx="${i}">
        <span class="compose-ac-avatar" style="background:${bg}">${initials}</span>
        <span class="compose-ac-email">${esc(email)}</span>
      </li>`;
    }).join('');
    acList.style.display = 'block';
    acIndex = -1;
  }

  function selectAcItem(email: string) {
    const parts = toEl.value.split(',');
    parts[parts.length - 1] = email;
    toEl.value = parts.join(', ') + ', ';
    closeAc();
    updateSendState();
    toEl.focus();
  }

  toEl.addEventListener('input', () => {
    updateSendState();
    const parts = toEl.value.split(',');
    const query = parts[parts.length - 1].trim();
    if (query.length === 0) { closeAc(); return; }
    const q = query.toLowerCase();
    const matches = knownEmails.filter(e => e.toLowerCase().startsWith(q));
    renderAc(matches);
  });

  acList.addEventListener('mousedown', e => {
    const li = (e.target as Element).closest<HTMLElement>('.compose-ac-item');
    if (li) { e.preventDefault(); selectAcItem(li.dataset.email!); }
  });

  function onToKeyDown(e: KeyboardEvent) {
    const items = acList.querySelectorAll<HTMLElement>('.compose-ac-item');
    if (acList.style.display !== 'none' && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acIndex = Math.min(acIndex + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('compose-ac-item--active', i === acIndex));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = Math.max(acIndex - 1, 0);
        items.forEach((el, i) => el.classList.toggle('compose-ac-item--active', i === acIndex));
        return;
      }
      if (e.key === 'Enter' && acIndex >= 0) {
        e.preventDefault();
        selectAcItem(items[acIndex].dataset.email!);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeAc();
        return;
      }
    }
  }
  toEl.addEventListener('keydown', onToKeyDown);
  toEl.addEventListener('blur', () => setTimeout(closeAc, 150));

  if (prefillSubject) {
    subjectEl.value = prefillSubject;
  }

  bodyEl.addEventListener('input', updateSendState);
  bodyEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === '/' && bodyEl.value === '') {
      e.preventDefault();
      openSnippetPicker(bodyEl);
    }
  });
  updateSendState();
  toEl.focus();

  function closeSafe() {
    document.removeEventListener('keydown', onDocKeyDown);
    overlay.remove();
  }

  function showDiscardConfirm() {
    const confirmEl = document.createElement('div');
    confirmEl.className = 'compose-discard-confirm';
    confirmEl.innerHTML = `
      <div class="compose-discard-box">
        <p class="compose-discard-msg">Discard this draft?</p>
        <div class="compose-discard-actions">
          <button class="compose-discard-yes">Discard draft</button>
          <button class="compose-discard-no">Keep editing</button>
        </div>
      </div>`;
    panelEl.appendChild(confirmEl);
    confirmEl.querySelector('.compose-discard-yes')!.addEventListener('click', () => closeSafe());
    confirmEl.querySelector('.compose-discard-no')!.addEventListener('click', () => confirmEl.remove());
  }

  function discardWithPrompt() {
    if (bodyEl.value.trim().length > 0) {
      showDiscardConfirm();
    } else {
      closeSafe();
    }
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) e.stopPropagation(); });

  document.getElementById('compose-new-close')!.addEventListener('click', discardWithPrompt);
  document.getElementById('compose-new-discard')!.addEventListener('click', discardWithPrompt);

  function onDocKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (acList.style.display !== 'none') { closeAc(); return; }
      discardWithPrompt();
    }
  }
  document.addEventListener('keydown', onDocKeyDown);

  sendBtn.addEventListener('click', async () => {
    if (sendBtn.disabled) return;
    const toList = toEl.value.split(',').map(s => s.trim()).filter(Boolean);
    const subject = subjectEl.value.trim();
    const body = bodyEl.value.trim();
    if (!state.account) return;

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="compose-spinner"></span> Sending…';
    errorEl.style.display = 'none';
    toEl.disabled = true;
    subjectEl.disabled = true;
    bodyEl.disabled = true;

    try {
      await sendEmail(state.account, { to: toList.join(', '), subject: subject || '(no subject)', body });
      sendBtn.innerHTML = '✓ Sent';
      sendBtn.classList.add('send-success');
      setTimeout(() => {
        closeSafe();
        showToast('Message sent');
        showFollowupPrompt({ threadId: '', subject: subject || '(no subject)', sentTo: toList.join(', ') });
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errorEl.textContent = `Send failed: ${msg}`;
      errorEl.style.display = 'block';
      sendBtn.disabled = false;
      sendBtn.innerHTML = 'Send';
      sendBtn.classList.add('send-error');
      setTimeout(() => sendBtn.classList.remove('send-error'), 2000);
      toEl.disabled = false;
      subjectEl.disabled = false;
      bodyEl.disabled = false;
      updateSendState();
    }
  });
}
