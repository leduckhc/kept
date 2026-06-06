import { type Account, getAccountById } from './auth';
import { type Thread, unsnoozeThread, unmuteThread, loadThreads, setAsideThread, unsetAsideThread } from './store';
import { markRead, markUnread, archiveThread, trashThread, untrashThread, blockSender, toggleStar, muteThread } from './gmail';
import { setStatus } from './helpers';
import { showToast, showUndoToast } from './toasts';
import { state, setAccount } from './state';

export interface ActionDeps {
  renderInbox: () => void;
  loadUnifiedThreads: () => Promise<Thread[]>;
}

export function accountFor(t: Thread): Account | null {
  if (state.unifiedMode && t.accountId) {
    return state.accounts.find(a => a.id === t.accountId) ?? state.account;
  }
  return state.account;
}

export async function doMarkRead(t: Thread, row: HTMLElement, deps: ActionDeps) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await markRead(acct, t);
    const fresh = await getAccountById(acct.id);
    if (fresh && !state.unifiedMode) setAccount(fresh);
    t.isUnread = false;
    row.classList.remove('unread');
    row.querySelector<HTMLElement>('.unread-dot')?.classList.remove('filled');
  } catch (e) {
    console.error('Mark read failed:', e);
    setStatus('Mark read failed');
    t.isUnread = true;
    deps.renderInbox();
  }
}

export async function doMarkUnread(t: Thread, row: HTMLElement) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await markUnread(acct, t);
    t.isUnread = true;
    row.classList.add('unread');
    row.querySelector<HTMLElement>('.unread-dot')?.classList.add('filled');
  } catch (e) {
    console.error('Mark unread failed:', e);
    setStatus('Mark unread failed');
  }
}

export async function doToggleStar(t: Thread, row: HTMLElement) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    const nowStarred = await toggleStar(acct, t);
    t.isStarred = nowStarred;
    const btn = row.querySelector<HTMLButtonElement>('.btn-star');
    if (btn) {
      btn.textContent = nowStarred ? '★' : '☆';
      btn.title = nowStarred ? 'Unstar' : 'Star';
      btn.classList.toggle('starred', nowStarred);
    }
    row.classList.toggle('is-starred', nowStarred);
  } catch (e) {
    console.error('Toggle star failed:', e);
    setStatus('Star toggle failed');
  }
}

export async function doArchive(t: Thread, row: HTMLElement, deps: ActionDeps) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await archiveThread(acct, t);
    const fresh = await getAccountById(acct.id);
    if (fresh && !state.unifiedMode) setAccount(fresh);
    row.remove();
    state.threads = state.threads.filter(x => x.id !== t.id);
    deps.renderInbox();
  } catch (e) {
    console.error('Archive failed:', e);
    setStatus('Archive failed');
    deps.renderInbox();
  }
}

export async function doTrash(t: Thread, row: HTMLElement, deps: ActionDeps) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await trashThread(acct, t);
    row.remove();
    state.threads = state.threads.filter(x => x.id !== t.id);
    showUndoToast('Moved to Trash', async () => {
      await untrashThread(acct, t);
      state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(acct.id);
      deps.renderInbox();
    });
  } catch (e) {
    console.error('Trash failed:', e);
    setStatus('Trash failed');
    deps.renderInbox();
  }
}

export async function doBlock(t: Thread, _row: HTMLElement, deps: ActionDeps): Promise<boolean> {
  const acct = accountFor(t);
  if (!acct) return false;
  if (!confirm(`Block all email from ${t.senderEmail}?\n\nThis will archive + unsubscribe + label in Gmail.`)) return false;
  await blockSender(acct, t);
  const fresh = await getAccountById(acct.id);
  if (fresh && !state.unifiedMode) setAccount(fresh);
  state.threads = state.threads.filter(x => !(x.senderEmail === t.senderEmail && x.accountId === t.accountId));
  deps.renderInbox();
  showUndoToast(`Blocked ${t.senderEmail}`, async () => {
    state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(acct.id);
    deps.renderInbox();
  });
  return true;
}

export async function doUnsnooze(t: Thread, row: HTMLElement, deps: ActionDeps) {
  const acct = accountFor(t);
  await unsnoozeThread(t);
  t.snoozedUntil = null;
  row.remove();
  state.threads = state.threads.filter(x => x.id !== t.id);
  showToast('Back in inbox', 3000);
  if (acct) {
    state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(acct.id);
  }
}

export async function doMute(t: Thread, row: HTMLElement, deps: ActionDeps) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await muteThread(acct, t);
    t.isMuted = true;
    row.remove();
    state.threads = state.threads.filter(x => x.id !== t.id);
    showUndoToast('Thread muted', async () => {
      await unmuteThread(t);
      t.isMuted = false;
      state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(acct.id);
      deps.renderInbox();
    });
  } catch (e) {
    console.error('Mute failed:', e);
    setStatus('Mute failed');
  }
}

export async function doSetAside(t: Thread, row: HTMLElement, deps: ActionDeps) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await setAsideThread(t);
    t.isSetAside = true;
    row.remove();
    state.threads = state.threads.filter(x => x.id !== t.id);
    showUndoToast('Set aside', async () => {
      await unsetAsideThread(t);
      t.isSetAside = false;
      state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(acct.id);
      deps.renderInbox();
    });
  } catch (e) {
    console.error('Set aside failed:', e);
    setStatus('Set aside failed');
  }
}

export async function doUnsetAside(t: Thread, row: HTMLElement, deps: ActionDeps) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await unsetAsideThread(t);
    t.isSetAside = false;
    row.remove();
    state.threads = state.threads.filter(x => x.id !== t.id);
    showToast('Back in inbox', 3000);
    state.threads = state.unifiedMode ? await deps.loadUnifiedThreads() : await loadThreads(acct.id);
  } catch (e) {
    console.error('Unset aside failed:', e);
    setStatus('Unset aside failed');
  }
}
