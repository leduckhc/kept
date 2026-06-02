import { type Thread, fetchMessageBody, sendEmail, markRead, archiveThread, blockSender, loadAttachments, downloadAttachment, type AttachmentMeta } from './gmail';
import { getAccountById } from './auth';
import { state, setAccount } from './state';
import { sanitizeEmailHtml } from './sanitize';
import { getDb } from './db';
import { showToast, showUndoToast } from './toasts';
import { esc, formatDate } from './helpers';
import { openComposeReply, openComposeForward } from './compose';
import { icon } from './icons';

function getAvatarColor(name: string): string {
  const colors = ["#5B4EDB","#E84D8A","#FEB300","#00C49A","#2F80ED","#F97316","#8B5CF6","#06B6D4"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export async function openThread(
  t: Thread,
  renderInbox: () => void,
  _openSnippetPicker?: (ta: HTMLElement | null) => void,
  _showFollowupPrompt?: (opts: { threadId: string; subject: string; sentTo: string }) => void,
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
      <div class="reader-footer-actions">
        <button class="btn-primary" id="btn-reply">${icon.reply('14px')} Reply</button>
        <button class="btn-secondary" id="btn-forward">${icon.send('14px')} Forward</button>
      </div>
      <button class="btn-secondary danger" id="btn-block-reader">Block sender</button>
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
    lastMessageId = result.lastMessageId;
    const bodyEl = reader.querySelector('.reader-body')!;
    bodyEl.innerHTML = '';
    const msgs = result.messages;

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

    msgs.forEach((m, idx: number) => {
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

      const rawHtml: string | null = m.htmlBody ?? null;
      const cachedSanitized: string | null = m.sanitizedHtml ?? null;
      const sanitized = cachedSanitized || (rawHtml ? sanitizeEmailHtml(rawHtml) : '');

      // Cache sanitized HTML back to DB (fire and forget)
      if (sanitized && !cachedSanitized && m.gmailMessageId) {
        getDb().then(db => db.execute(
          'UPDATE messages SET sanitized_html = ? WHERE gmail_message_id = ?',
          [sanitized, m.gmailMessageId]
        )).catch(() => {});
      }

      if (sanitized) {
        // Direct sanitized HTML rendering (no iframe) — like Gmail, Outlook Web, Apple Mail
        const emailBodyDiv = document.createElement('div');
        emailBodyDiv.className = 'email-body-rendered';
        emailBodyDiv.innerHTML = sanitized;

        // Hide quoted/trimmed content (gmail_quote, blockquotes after main content)
        emailBodyDiv.querySelectorAll('blockquote, .gmail_quote, .gmail_extra').forEach(el => {
          (el as HTMLElement).classList.add('quoted-hidden');
          const btn = document.createElement('button');
          btn.className = 'btn-show-trimmed';
          btn.textContent = '··· Show trimmed content';
          btn.addEventListener('click', () => {
            (el as HTMLElement).classList.remove('quoted-hidden');
            btn.remove();
          });
          el.parentNode?.insertBefore(btn, el);
        });

        // Load images button
        const loadImgBtn = document.createElement('button');
        loadImgBtn.className = 'btn-load-images';
        loadImgBtn.textContent = '🖼 Load images';
        loadImgBtn.style.cssText = 'display:none; margin-bottom:8px; font-size:12px;';
        loadImgBtn.addEventListener('click', () => {
          emailBodyDiv.querySelectorAll<HTMLImageElement>('img[data-original-src]').forEach(img => {
            const orig = img.getAttribute('data-original-src')!;
            img.setAttribute('src', orig);
            img.removeAttribute('data-original-src');
          });
          loadImgBtn.remove();
        });

        const blockedImgs = emailBodyDiv.querySelectorAll('img[data-original-src]');
        if (blockedImgs.length > 0) loadImgBtn.style.display = 'inline-block';

        contentWrap.appendChild(loadImgBtn);
        contentWrap.appendChild(emailBodyDiv);
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

    bodyEl.scrollTop = 0;

    // Render attachment chips below messages
    renderAttachmentChips(bodyEl, t.gmailThreadId);
  } catch (err) {
    console.error('[threadReader] Failed to load messages:', err);
    reader.querySelector('.reader-body')!.innerHTML = `<p style="color:var(--text-muted)">Could not load messages. ${esc(String(err))}</p>`;
    // Hide reply/forward actions when messages failed to load
    const footer = reader.querySelector('.reader-footer') as HTMLElement | null;
    if (footer) footer.style.display = 'none';
  }

  // ── Reply / Forward buttons open floating compose ──
  let lastPlainText = '';
  try {
    const bodyEl2 = reader.querySelector('.reader-body');
    if (bodyEl2) {
      const msgs = bodyEl2.querySelectorAll('.thread-message-content');
      if (msgs.length > 0) lastPlainText = (msgs[msgs.length - 1] as HTMLElement).innerText?.slice(0, 2000) ?? '';
    }
  } catch { /* non-fatal */ }

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
    openComposeReply({
      to: t.senderEmail,
      subject: t.subject,
      threadId: t.gmailThreadId,
      inReplyTo: lastMessageId ?? undefined,
      quotedText: lastPlainText,
    });
  });

  document.getElementById('btn-forward')!.addEventListener('click', () => {
    openComposeForward({
      subject: t.subject,
      quotedText: lastPlainText,
    });
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

// ── Attachment chips ─────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽';
  if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
  return '📎';
}

async function renderAttachmentChips(bodyEl: Element, threadId: string) {
  const attachments = await loadAttachments(threadId);
  if (!attachments.length) return;

  const section = document.createElement('div');
  section.className = 'attachment-section';
  section.innerHTML = `<div class="attachment-section-title">📎 ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}</div>`;

  const grid = document.createElement('div');
  grid.className = 'attachment-grid';

  for (const att of attachments) {
    const chip = document.createElement('button');
    chip.className = 'attachment-chip';
    chip.title = `${att.filename} (${formatFileSize(att.size)})`;
    chip.innerHTML = `
      <span class="attachment-icon">${getFileIcon(att.mime_type)}</span>
      <span class="attachment-name">${esc(att.filename.length > 24 ? att.filename.slice(0, 22) + '…' : att.filename)}</span>
      <span class="attachment-size">${formatFileSize(att.size)}</span>`;
    chip.addEventListener('click', () => handleAttachmentDownload(att));

    // Inline preview for images
    if (att.mime_type.startsWith('image/') && att.size < 5 * 1024 * 1024) {
      chip.classList.add('attachment-chip-image');
    }

    grid.appendChild(chip);
  }

  section.appendChild(grid);
  bodyEl.appendChild(section);
}

async function handleAttachmentDownload(att: AttachmentMeta) {
  if (!state.account) return;

  // For images: show inline preview
  if (att.mime_type.startsWith('image/')) {
    return handleImagePreview(att);
  }

  showToast(`Downloading ${att.filename}…`);
  try {
    const bytes = await downloadAttachment(state.account, att.message_id, att.attachment_id);
    triggerBlobDownload(bytes, att.mime_type, att.filename);
    showToast(`Downloaded ${att.filename}`);
  } catch (err) {
    showToast(`Failed to download: ${err}`);
  }
}

function triggerBlobDownload(bytes: Uint8Array, mimeType: string, filename: string) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleImagePreview(att: AttachmentMeta) {
  if (!state.account) return;

  // Check if lightbox already open
  const existing = document.querySelector('.attachment-lightbox');
  if (existing) existing.remove();

  showToast(`Loading ${att.filename}…`);
  try {
    const bytes = await downloadAttachment(state.account, att.message_id, att.attachment_id);
    const blob = new Blob([bytes], { type: att.mime_type });
    const url = URL.createObjectURL(blob);

    const lightbox = document.createElement('div');
    lightbox.className = 'attachment-lightbox';
    lightbox.innerHTML = `
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-content">
        <img src="${url}" alt="${esc(att.filename)}" class="lightbox-image" />
        <div class="lightbox-footer">
          <span class="lightbox-filename">${esc(att.filename)}</span>
          <button class="btn-primary lightbox-download">⬇ Download</button>
          <button class="btn-secondary lightbox-close">✕ Close</button>
        </div>
      </div>`;

    document.body.appendChild(lightbox);

    lightbox.querySelector('.lightbox-backdrop')!.addEventListener('click', () => {
      lightbox.remove();
      URL.revokeObjectURL(url);
    });
    lightbox.querySelector('.lightbox-close')!.addEventListener('click', () => {
      lightbox.remove();
      URL.revokeObjectURL(url);
    });
    lightbox.querySelector('.lightbox-download')!.addEventListener('click', () => {
      triggerBlobDownload(bytes, att.mime_type, att.filename);
    });

    document.addEventListener('keydown', function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        lightbox.remove();
        URL.revokeObjectURL(url);
        document.removeEventListener('keydown', onEsc);
      }
    });
  } catch (err) {
    showToast(`Failed to load image: ${err}`);
  }
}


