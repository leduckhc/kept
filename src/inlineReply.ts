import { type Thread, sendEmail, markRead } from './gmail';
import { state } from './state';
import { showToast } from './toasts';

export function openInlineReply(t: Thread, row: HTMLElement) {
  if (state.currentInlineReply) {
    state.currentInlineReply.remove();
    state.currentInlineReply = null;
  }

  const replyEl = document.createElement('div');
  replyEl.className = 'inline-reply';
  replyEl.innerHTML = `
    <textarea class="inline-reply-textarea" placeholder="Write your reply…" rows="3"></textarea>
    <div class="inline-reply-actions">
      <button class="btn-secondary inline-reply-cancel">Cancel</button>
      <button class="btn-primary inline-reply-send">Send</button>
    </div>`;

  row.insertAdjacentElement('afterend', replyEl);
  state.currentInlineReply = replyEl;

  const textarea = replyEl.querySelector<HTMLTextAreaElement>('.inline-reply-textarea')!;
  const sendBtn = replyEl.querySelector<HTMLButtonElement>('.inline-reply-send')!;
  const cancelBtn = replyEl.querySelector<HTMLButtonElement>('.inline-reply-cancel')!;

  textarea.focus();

  function collapse() {
    replyEl.remove();
    if (state.currentInlineReply === replyEl) state.currentInlineReply = null;
  }

  cancelBtn.addEventListener('click', collapse);

  sendBtn.addEventListener('click', async () => {
    const body = textarea.value.trim();
    if (!body || !state.account) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    try {
      await sendEmail(state.account, {
        to: t.senderEmail,
        subject: t.subject.startsWith('Re:') ? t.subject : `Re: ${t.subject}`,
        body,
        threadId: t.gmailThreadId,
      });
      collapse();
      showToast('Reply sent');
      if (t.isUnread) {
        t.isUnread = false;
        row.classList.remove('unread');
        row.querySelector<HTMLElement>('.unread-dot')?.classList.remove('filled');
        markRead(state.account, t).catch(() => {});
      }
    } catch (e) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      const errEl = replyEl.querySelector('.inline-reply-error') ?? (() => {
        const d = document.createElement('div');
        d.className = 'inline-reply-error';
        replyEl.querySelector('.inline-reply-actions')!.insertAdjacentElement('beforebegin', d);
        return d;
      })();
      (errEl as HTMLElement).textContent = `Send failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
}
