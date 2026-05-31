import { type Thread, fetchMessageBody, sendEmail, markRead, archiveThread, blockSender } from './gmail';
import { getAccountById } from './auth';
import { state, setAccount } from './state';
import { sanitizeEmailHtml } from './sanitize';
import { showToast, showUndoToast } from './toasts';
import { esc, formatDate } from './helpers';

function getAvatarColor(name: string): string {
  const colors = ["#5B4EDB","#E84D8A","#FEB300","#00C49A","#2F80ED","#F97316","#8B5CF6","#06B6D4"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export async function openThread(
  t: Thread,
  renderInbox: () => void,
  openSnippetPicker: (ta: HTMLElement | null) => void,
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
  const pane = document.getElementById('reader-pane');

  const reader = document.createElement('div');
  reader.className = 'reader-fullpage';
  reader.innerHTML = `
    <div class="reader-header">
      <button class="btn-icon reader-back" id="reader-back" title="Back to inbox [Escape]">←</button>
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
        <div class="compose-toolbar">
          <button class="toolbar-btn" data-cmd="bold" title="Bold (⌘B)"><b>B</b></button>
          <button class="toolbar-btn" data-cmd="italic" title="Italic (⌘I)"><i>I</i></button>
          <button class="toolbar-btn" data-cmd="underline" title="Underline (⌘U)"><u>U</u></button>
          <span class="toolbar-sep"></span>
          <button class="toolbar-btn" data-cmd="insertUnorderedList" title="Bullet list">•</button>
          <button class="toolbar-btn" data-cmd="insertOrderedList" title="Numbered list">1.</button>
          <span class="toolbar-sep"></span>
          <button class="toolbar-btn" data-cmd="createLink" title="Insert link">🔗</button>
          <button class="toolbar-btn" data-cmd="removeFormat" title="Clear formatting">⊘</button>
        </div>
        <div id="compose-body" class="compose-editor" contenteditable="true" data-placeholder="Reply…"></div>
        <div style="display:flex; gap:8px;">
          <button class="btn-primary" id="btn-send">Send</button>
          <button class="btn-secondary" id="btn-cancel-compose">Cancel</button>
        </div>
      </div>
    </div>`;

  if (pane) {
    pane.innerHTML = '';
    pane.appendChild(reader);
    shell.classList.add('reader-open');
  } else {
    // Fallback: mobile fullpage overlay
    shell.classList.add('reader-open');
    shell.appendChild(reader);
  }

  function closeReader() {
    if (pane) {
      pane.innerHTML = `
        <div class="reader-pane-empty">
          <div class="reader-pane-empty-icon">✉</div>
          <div class="reader-pane-empty-text">Select a conversation</div>
        </div>`;
      shell.classList.remove('reader-open');
    } else {
      reader.remove();
      shell.classList.remove('reader-open');
    }
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

    // Thread summary header
    if (msgs.length > 1) {
      const myEmail = state.account?.email ?? '';
      const lastMsg = msgs[msgs.length - 1];
      const lastFrom = lastMsg.from ?? '';
      const lastIsMe = lastFrom.includes(myEmail);
      const lastSenderName = lastFrom.replace(/<.*>/, '').trim() || lastFrom;

      const uniqueSenders: string[] = [];
      for (const m of msgs) {
        const name = (m.from ?? '').replace(/<.*>/, '').trim() || m.from;
        if (!uniqueSenders.includes(name)) uniqueSenders.push(name);
      }
      const shown = uniqueSenders.slice(0, 4);
      const overflow = uniqueSenders.length - shown.length;

      const avatarsHtml = shown.map(name => {
        const initial = name[0]?.toUpperCase() ?? '?';
        const color = getAvatarColor(name);
        return `<span class="thread-avatar" style="background:${color}" title="${esc(name)}">${esc(initial)}</span>`;
      }).join('') + (overflow > 0 ? `<span class="thread-avatar" style="background:#555">+${overflow}</span>` : '');

      const statusText = lastIsMe
        ? 'You replied'
        : `Awaiting reply from ${esc(lastSenderName)}`;

      const summaryEl = document.createElement('div');
      summaryEl.className = 'thread-summary';
      summaryEl.innerHTML = `<span class="thread-count-badge">${msgs.length} messages</span><div class="thread-participants">${avatarsHtml}</div><span class="thread-status">${statusText}</span>`;
      bodyEl.appendChild(summaryEl);
    }

    msgs.forEach((m: any, idx: number) => {
      const isLast = idx === msgs.length - 1;
      const msgContainer = document.createElement('div');
      msgContainer.className = 'thread-message' + (!isLast ? ' thread-message-collapsed' : '');

      const senderName = m.from.replace(/<.*>/, '').trim() || m.from;
      const senderInitial = senderName[0]?.toUpperCase() ?? '?';
      const avatarColor = getAvatarColor(senderName);
      const senderEmail = (m.from.match(/<(.+)>/) ?? [])[1] ?? '';
      const preview = (m.body || '').slice(0, 80).replace(/\n/g, ' ');

      const headerBar = document.createElement('div');
      headerBar.className = 'thread-message-header';
      headerBar.innerHTML = `
        <span class="msg-avatar" style="background:${avatarColor}">${esc(senderInitial)}</span>
        <span class="thread-msg-sender">${esc(senderName)}</span>${senderEmail ? `<span class="thread-msg-email">${esc(senderEmail)}</span>` : ''}
        ${isLast ? '' : `<span class="thread-msg-preview">${esc(preview)}</span>`}
        <span class="thread-msg-date">${formatDate(m.receivedAt)}</span>
        <span class="thread-msg-chevron">›</span>`;
      headerBar.addEventListener('click', () => {
        msgContainer.classList.toggle('thread-message-collapsed');
      });
      msgContainer.appendChild(headerBar);

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
        iframe.setAttribute('sandbox', 'allow-scripts allow-popups-to-escape-sandbox');
        iframe.style.cssText = 'width:100%; border:none; overflow:visible; flex:1; min-height:60vh;';
        const isDark = document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
        const bodyColor = isDark ? '#e8e8e8' : '#222';
        const bodyBg = isDark ? '#0a0a0a' : '#ffffff';
        const linkColor = isDark ? '#8b7cf7' : '#5B4EDB';
        const imgBg = isDark ? '#1a1a1a' : '#f0f0f0';
        const quoteBorder = isDark ? '#333' : '#ddd';
        const quoteColor = isDark ? '#999' : '#666';
        const tableBorder = isDark ? '#2a2a2a' : '#eee';
        const preBg = isDark ? '#141414' : '#f5f5f5';

        iframe.srcdoc = `<!DOCTYPE html><html style="height:100%"><head><meta charset="utf-8"><style>
          html,body{height:100%;min-height:100%;}
          body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:${bodyColor};background:${bodyBg};margin:0;padding:16px;line-height:1.5;word-break:break-word;}
          a{color:${linkColor};}
          img[data-original-src]{background:${imgBg};min-height:20px;border-radius:4px;}
          blockquote{border-left:3px solid ${quoteBorder};margin:8px 0;padding-left:12px;color:${quoteColor};}
          table{border-collapse:collapse;max-width:100%;}
          td,th{padding:4px 8px;border:1px solid ${tableBorder};}
          pre{background:${preBg};padding:8px;border-radius:4px;overflow-x:auto;}
          img{max-width:100%;height:auto;}
        </style></head><body>${sanitized}<script>
document.querySelectorAll("blockquote,.gmail_quote,.gmail_extra").forEach(function(el){
  el.style.display="none";
  var btn=document.createElement("button");
  btn.textContent="··· Show trimmed content";
  btn.style.cssText="background:none;border:none;color:#7c6ce0;cursor:pointer;font-size:12px;padding:4px 0;";
  btn.addEventListener("click",function(){el.style.display="block";btn.remove();});
  el.parentNode.insertBefore(btn,el);
});
<\/script></body></html>`;

        const resizeIframe = () => {
          const doc = iframe.contentDocument;
          if (!doc) return;
          // Use the max of scrollHeight and offsetHeight for full content height
          const body = doc.body;
          const html = doc.documentElement;
          const h = Math.max(
            body?.scrollHeight ?? 0,
            body?.offsetHeight ?? 0,
            html?.scrollHeight ?? 0,
            html?.offsetHeight ?? 0
          );
          if (h > 0) iframe.style.height = h + 'px';
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
          // Re-check height as content settles (images, fonts, lazy rendering)
          setTimeout(resizeIframe, 100);
          setTimeout(resizeIframe, 300);
          setTimeout(resizeIframe, 1000);
          setTimeout(resizeIframe, 3000);
          const blocked = iframe.contentDocument?.querySelectorAll('img[data-original-src]');
          if (blocked && blocked.length > 0) loadImgBtn.style.display = 'inline-block';
        });

        contentWrap.appendChild(iframe);
        contentWrap.appendChild(loadImgBtn);
      } else {
        const plainText: string = m.body ?? '';
        const lines = plainText.slice(0, 20000).split('\n');
        const quoteStart = lines.findIndex((line, i) =>
          line.startsWith('>') || (i > 0 && /^On .+ wrote:/.test(line))
        );

        const visibleText = quoteStart > 0 ? lines.slice(0, quoteStart).join('\n') : plainText.slice(0, 20000);
        const quotedText = quoteStart > 0 ? lines.slice(quoteStart).join('\n') : '';

        const bodyDiv = document.createElement('div');
        bodyDiv.style.cssText = 'white-space:pre-wrap; font-size:14px;';
        bodyDiv.textContent = visibleText;
        contentWrap.appendChild(bodyDiv);

        if (quotedText) {
          const quotedDiv = document.createElement('div');
          quotedDiv.className = 'quoted-hidden';
          quotedDiv.style.cssText = 'white-space:pre-wrap; font-size:13px; color:#888;';
          quotedDiv.textContent = quotedText;
          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'btn-show-trimmed';
          toggleBtn.textContent = '··· Show trimmed content';
          toggleBtn.addEventListener('click', () => {
            quotedDiv.classList.remove('quoted-hidden');
            toggleBtn.remove();
          });
          contentWrap.appendChild(toggleBtn);
          contentWrap.appendChild(quotedDiv);
        }

        if (plainText.length > 20000) {
          const showMore = document.createElement('button');
          showMore.className = 'btn-show-more';
          showMore.textContent = 'Show full email';
          showMore.addEventListener('click', () => {
            bodyDiv.textContent = plainText;
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

  const composeEditor = reader.querySelector<HTMLElement>('#compose-body')!;

  // Restore saved draft
  if (savedDraft) {
    composeEditor.innerText = savedDraft;
  } else {
    // Auto-append signature if account has one
    const sig = state.account?.signature;
    if (sig) {
      composeEditor.innerHTML = `<br><div class="signature-block" contenteditable="true" style="color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;margin-top:8px;font-size:13px;white-space:pre-wrap;">-- \n${sig.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
    }
  }

  composeEditor.addEventListener('input', () => {
    localStorage.setItem(draftKey, composeEditor.innerText);
  });
  composeEditor.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === '/' && composeEditor.innerText.trim() === '') {
      e.preventDefault();
      openSnippetPicker(composeEditor);
    }
  });

  reader.querySelectorAll<HTMLElement>('.toolbar-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd!;
      if (cmd === 'createLink') {
        const url = prompt('Enter URL:');
        if (url) document.execCommand('createLink', false, url);
      } else {
        document.execCommand(cmd, false);
      }
    });
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
    composeEditor.focus();
  });
  document.getElementById('btn-cancel-compose')!.addEventListener('click', () => {
    localStorage.removeItem(draftKey);
    composeEditor.innerHTML = '';
    document.getElementById('compose')!.style.display = 'none';
    document.getElementById('btn-reply')!.style.display = '';
  });
  document.getElementById('btn-send')!.addEventListener('click', async () => {
    const body = composeEditor.innerText.trim();
    if (!body || !state.account) return;
    const btn = document.getElementById('btn-send') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<span class="send-spinner"></span> Sending…';
    try {
      await sendEmail(state.account, {
        to: t.senderEmail,
        subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
        body,
        threadId: t.gmailThreadId,
        inReplyTo: lastMessageId ?? undefined,
      });
      btn.innerHTML = '✓ Sent';
      btn.classList.add('send-success');
      setTimeout(() => {
        localStorage.removeItem(draftKey);
        closeReader();
        showFollowupPrompt({ threadId: t.id, subject: t.subject, sentTo: t.senderEmail });
      }, 1000);
    } catch (e) {
      btn.innerHTML = 'Send';
      btn.disabled = false;
      btn.classList.add('send-error');
      setTimeout(() => btn.classList.remove('send-error'), 2000);
      showToast(`Failed to send: ${e instanceof Error ? e.message : String(e)}`, 4000);
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
