import { type Thread, fetchMessageBody, sendEmail, markRead, archiveThread, blockSender } from './gmail';
import { getAccountById } from './auth';
import { state, setAccount } from './state';
import { sanitizeEmailHtml } from './sanitize';
import { showToast, showUndoToast } from './toasts';
import { esc, formatDate } from './helpers';

export async function openThread(
  t: Thread,
  renderInbox: () => void,
  openSnippetPicker: (ta: HTMLTextAreaElement | null) => void,
  showFollowupPrompt: (opts: { threadId: string; subject: string; sentTo: string }) => void,
) {
  if (!state.account) return;
  if (t.isUnread) {
    t.isUnread = false;
    document.querySelector<HTMLElement>(`.thread-row[data-id="${t.id}"]`)?.classList.remove('unread');
    markRead(state.account, t).catch(() => {
      t.isUnread = true;
      document.querySelector<HTMLElement>(`.thread-row[data-id="${t.id}"]`)?.classList.add('unread');
    });
  }

  const draftKey = 'draft-' + t.gmailThreadId;
  const savedDraft = localStorage.getItem(draftKey);

  const shell = document.getElementById('app-shell')!;
  shell.classList.add('reader-open');

  const reader = document.createElement('div');
  reader.className = 'reader-fullpage';
  reader.innerHTML = `
    <div class="reader-header">
      <button class="btn-icon reader-back" id="reader-back" title="Back to inbox">←</button>
      <div class="reader-subject">${esc(t.subject)}</div>
      <div class="reader-actions-header">
        <button class="btn-icon" id="btn-archive-reader" title="Archive">🗑</button>
      </div>
    </div>
    <div class="reader-body"><div class="spinner"></div></div>
    <div class="reader-footer">
      <div class="reply-chips" id="reply-chips">
        <button class="reply-chip" data-reply="Thanks!">Thanks!</button>
        <button class="reply-chip" data-reply="Got it">Got it</button>
        <button class="reply-chip" data-reply="Sounds good">Sounds good</button>
        <button class="reply-chip" data-reply="On it">On it</button>
      </div>
      <button class="btn-primary" id="btn-reply"${savedDraft ? ' style="display:none"' : ''}>Reply</button>
      <button class="btn-secondary danger" id="btn-block-reader">Block sender</button>
      <div class="compose-area" id="compose" style="display:${savedDraft ? 'flex' : 'none'}; flex:1; flex-direction:column; gap:8px;">
        <textarea class="compose-textarea" id="compose-body" placeholder="Write your reply…">${savedDraft ? esc(savedDraft) : ''}</textarea>
        <div style="display:flex; gap:8px;">
          <button class="btn-primary" id="btn-send">Send</button>
          <button class="btn-secondary" id="btn-cancel-compose">Cancel</button>
        </div>
      </div>
    </div>`;
  shell.appendChild(reader);

  function closeReader() {
    reader.remove();
    shell.classList.remove('reader-open');
  }

  document.getElementById('reader-back')!.addEventListener('click', closeReader);

  function handleEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') { closeReader(); document.removeEventListener('keydown', handleEsc); }
  }
  document.addEventListener('keydown', handleEsc);

  let lastMessageId: string | null = null;

  try {
    console.log('[threadReader] Loading thread:', t.gmailThreadId, 'account:', state.account.id);
    const result = await fetchMessageBody(state.account, t.gmailThreadId);
    console.log('[threadReader] Got messages:', (result as any)?.messages?.length ?? 'unknown');
    const bodies = (result as any).bodies ?? (result as any).messages ?? result;
    lastMessageId = (result as any).lastMessageId ?? null;
    const bodyEl = reader.querySelector('.reader-body')!;
    bodyEl.innerHTML = '';
    const msgs = bodies as any[];
    const isThread = msgs.length > 1;

    msgs.forEach((m: any, idx: number) => {
      const isLast = idx === msgs.length - 1;
      const msgContainer = document.createElement('div');
      msgContainer.className = 'thread-message' + (!isLast && isThread ? ' thread-message-collapsed' : '');

      const senderName = m.from.replace(/<.*>/, '').trim() || m.from;

      if (isThread && !isLast) {
        const headerBar = document.createElement('div');
        headerBar.className = 'thread-message-header';
        const preview = (m.body || '').slice(0, 80).replace(/\n/g, ' ');
        headerBar.innerHTML = `
          <span class="thread-msg-sender">${esc(senderName)}</span>
          <span class="thread-msg-preview">${esc(preview)}</span>
          <span class="thread-msg-date">${formatDate(m.receivedAt)}</span>
          <span class="thread-msg-chevron">›</span>`;
        headerBar.addEventListener('click', () => {
          msgContainer.classList.toggle('thread-message-collapsed');
        });
        msgContainer.appendChild(headerBar);
      }

      const contentWrap = document.createElement('div');
      contentWrap.className = 'thread-message-content';

      const metaDiv = document.createElement('div');
      metaDiv.className = 'thread-msg-meta';
      metaDiv.textContent = `${m.from} · ${formatDate(m.receivedAt)}`;
      contentWrap.appendChild(metaDiv);

      const rawHtml: string | null = (m as any).htmlBody ?? null;
      const sanitized = rawHtml ? sanitizeEmailHtml(rawHtml) : '';

      if (sanitized) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-popups-to-escape-sandbox');
        iframe.style.cssText = 'width:100%; border:none; overflow:hidden; min-height:60px;';
        iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#222;margin:0;padding:0;line-height:1.5;word-break:break-word;}
          a{color:#5B4EDB;}
          img[data-original-src]{background:#f0f0f0;min-height:20px;border-radius:4px;}
          blockquote{border-left:3px solid #ddd;margin:8px 0;padding-left:12px;color:#666;}
          table{border-collapse:collapse;max-width:100%;}
          td,th{padding:4px 8px;border:1px solid #eee;}
          pre{background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto;}
          img{max-width:100%;height:auto;}
        </style></head><body>${sanitized}</body></html>`;

        const resizeIframe = () => {
          const h = iframe.contentDocument?.body?.scrollHeight;
          if (h) iframe.style.height = h + 4 + 'px';
        };

        const loadImgBtn = document.createElement('button');
        loadImgBtn.className = 'btn-load-images';
        loadImgBtn.textContent = '🖼 Load images';
        loadImgBtn.style.cssText = 'display:none; margin-top:6px; font-size:12px;';
        loadImgBtn.addEventListener('click', () => {
          const imgs = iframe.contentDocument?.querySelectorAll<HTMLImageElement>('img[data-original-src]');
          imgs?.forEach(img => {
            const orig = img.getAttribute('data-original-src')!;
            img.setAttribute('src', orig);
            img.removeAttribute('data-original-src');
          });
          loadImgBtn.remove();
          resizeIframe();
        });
        iframe.addEventListener('load', () => {
          resizeIframe();
          const blocked = iframe.contentDocument?.querySelectorAll('img[data-original-src]');
          if (blocked && blocked.length > 0) loadImgBtn.style.display = 'inline-block';
        });

        contentWrap.appendChild(iframe);
        contentWrap.appendChild(loadImgBtn);
      } else {
        const bodyDiv = document.createElement('div');
        bodyDiv.style.cssText = 'white-space:pre-wrap; font-size:14px;';
        bodyDiv.textContent = m.body.slice(0, 20000);
        contentWrap.appendChild(bodyDiv);

        if (m.body.length > 20000) {
          const showMore = document.createElement('button');
          showMore.className = 'btn-show-more';
          showMore.textContent = 'Show full email';
          showMore.addEventListener('click', () => {
            bodyDiv.textContent = m.body;
            showMore.remove();
          });
          contentWrap.appendChild(showMore);
        }
      }

      msgContainer.appendChild(contentWrap);
      bodyEl.appendChild(msgContainer);
    });

    bodyEl.scrollTop = bodyEl.scrollHeight;
  } catch (err) {
    console.error('[threadReader] Failed to load messages:', err);
    reader.querySelector('.reader-body')!.innerHTML = `<p style="color:var(--text-muted)">Could not load messages. ${esc(String(err))}</p>`;
  }

  const textarea = reader.querySelector<HTMLTextAreaElement>('#compose-body')!;
  textarea.addEventListener('input', () => {
    localStorage.setItem(draftKey, textarea.value);
  });
  textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === '/' && textarea.value === '') {
      e.preventDefault();
      openSnippetPicker(textarea);
    }
  });

  reader.querySelectorAll<HTMLButtonElement>('.reply-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const body = chip.dataset.reply!;
      let cancelled = false;
      let sendTimer: ReturnType<typeof setTimeout> | null = null;

      const chips = reader.querySelector<HTMLElement>('#reply-chips')!;
      chips.style.pointerEvents = 'none';
      chips.style.opacity = '0.4';

      sendTimer = setTimeout(async () => {
        if (cancelled) return;
        try {
          await sendEmail(state.account!, {
            to: t.senderEmail,
            subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
            body,
            threadId: t.gmailThreadId,
            inReplyTo: lastMessageId ?? undefined,
          });
          closeReader();
        } catch (e) {
          chips.style.pointerEvents = '';
          chips.style.opacity = '';
          showToast(`Send failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }, 3000);

      showUndoToast(`Sending "${body}"…`, () => {
        cancelled = true;
        if (sendTimer !== null) { clearTimeout(sendTimer); sendTimer = null; }
        chips.style.pointerEvents = '';
        chips.style.opacity = '';
      });
    });
  });

  document.getElementById('btn-reply')!.addEventListener('click', () => {
    const compose = document.getElementById('compose')!;
    compose.style.display = 'flex';
    document.getElementById('btn-reply')!.style.display = 'none';
    textarea.focus();
  });
  document.getElementById('btn-cancel-compose')!.addEventListener('click', () => {
    localStorage.removeItem(draftKey);
    textarea.value = '';
    document.getElementById('compose')!.style.display = 'none';
    document.getElementById('btn-reply')!.style.display = '';
  });
  document.getElementById('btn-send')!.addEventListener('click', async () => {
    const body = textarea.value.trim();
    if (!body || !state.account) return;
    const btn = document.getElementById('btn-send') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await sendEmail(state.account, {
        to: t.senderEmail,
        subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
        body,
        threadId: t.gmailThreadId,
        inReplyTo: lastMessageId ?? undefined,
      });
      localStorage.removeItem(draftKey);
      closeReader();
      showFollowupPrompt({ threadId: t.id, subject: t.subject, sentTo: t.senderEmail });
    } catch (e) {
      const errDiv = document.getElementById('reply-send-error') ?? (() => {
        const d = document.createElement('div');
        d.id = 'reply-send-error';
        d.style.cssText = 'font-size:12px;color:var(--danger,#dc2626);padding:4px 0;';
        btn.parentElement!.insertBefore(d, btn);
        return d;
      })();
      errDiv.textContent = `Send failed: ${e instanceof Error ? e.message : String(e)}`;
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  });

  document.getElementById('btn-archive-reader')!.addEventListener('click', async () => {
    if (!state.account) return;
    await archiveThread(state.account, t);
    const fresh = state.account ? await getAccountById(state.account.id) : null;
    if (fresh) setAccount(fresh);
    state.threads = state.threads.filter(x => x.id !== t.id);
    renderInbox();
    closeReader();
  });
  document.getElementById('btn-block-reader')!.addEventListener('click', async () => {
    if (!state.account) return;
    if (!confirm(`Block all email from ${t.senderEmail}?`)) return;
    await blockSender(state.account, t);
    const fresh = state.account ? await getAccountById(state.account.id) : null;
    if (fresh) setAccount(fresh);
    state.threads = state.threads.filter(x => x.senderEmail !== t.senderEmail);
    renderInbox();
    closeReader();
  });
}
