/**
 * actions.ts — Async thread actions that call pure-logic modules
 * and update the Solid store directly. No DOM manipulation.
 */
import { type Account, getAccountById } from '../auth';
import { type Thread, loadThreads, loadThreadsUnified, unsnoozeThread, unmuteThread, setAsideThread, unsetAsideThread, invalidateSectionCache } from '../store';
import { markRead, markUnread, archiveThread, trashThread, untrashThread, blockSender, toggleStar, muteThread } from '../gmail';
import { showToast, showUndoToast } from '../toasts';
import { appState, setAppState, setThreads } from './store';

function accountFor(t: Thread): Account | null {
  if (appState.unifiedMode && t.accountId) {
    return appState.accounts.find(a => a.id === t.accountId) ?? appState.account;
  }
  return appState.account;
}

async function reloadThreads(): Promise<Thread[]> {
  if (appState.unifiedMode) {
    return loadThreadsUnified(appState.accountFilter);
  }
  if (appState.account) {
    return loadThreads(appState.account.id);
  }
  return [];
}

export async function doMarkRead(t: Thread) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await markRead(acct, t);
    const fresh = await getAccountById(acct.id);
    if (fresh && !appState.unifiedMode) setAppState('account', fresh);
    // Update thread in store
    const idx = appState.threads.findIndex(x => x.id === t.id);
    if (idx >= 0) {
      setAppState('threads', idx, 'isUnread', false);
    }
  } catch (e) {
    console.error('Mark read failed:', e);
    showToast('Mark read failed');
  }
}

export async function doMarkUnread(t: Thread) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await markUnread(acct, t);
    const idx = appState.threads.findIndex(x => x.id === t.id);
    if (idx >= 0) {
      setAppState('threads', idx, 'isUnread', true);
    }
  } catch (e) {
    console.error('Mark unread failed:', e);
    showToast('Mark unread failed');
  }
}

export async function doToggleStar(t: Thread) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    const nowStarred = await toggleStar(acct, t);
    const idx = appState.threads.findIndex(x => x.id === t.id);
    if (idx >= 0) {
      setAppState('threads', idx, 'isStarred', nowStarred);
    }
  } catch (e) {
    console.error('Toggle star failed:', e);
    showToast('Star toggle failed');
  }
}

export async function doArchive(t: Thread) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await archiveThread(acct, t);
    const fresh = await getAccountById(acct.id);
    if (fresh && !appState.unifiedMode) setAppState('account', fresh);
    setThreads(appState.threads.filter(x => x.id !== t.id));
    invalidateSectionCache();
  } catch (e) {
    console.error('Archive failed:', e);
    showToast('Archive failed');
  }
}

export async function doTrash(t: Thread) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await trashThread(acct, t);
    setThreads(appState.threads.filter(x => x.id !== t.id));
    showUndoToast('Moved to Trash', async () => {
      await untrashThread(acct, t);
      const threads = await reloadThreads();
      setThreads(threads);
    });
  } catch (e) {
    console.error('Trash failed:', e);
    showToast('Trash failed');
  }
}

export async function doBlock(t: Thread): Promise<boolean> {
  const acct = accountFor(t);
  if (!acct) return false;
  if (!confirm(`Block all email from ${t.senderEmail}?\n\nThis will archive + unsubscribe + label in Gmail.`)) return false;
  await blockSender(acct, t);
  const fresh = await getAccountById(acct.id);
  if (fresh && !appState.unifiedMode) setAppState('account', fresh);
  setThreads(appState.threads.filter(x => !(x.senderEmail === t.senderEmail && x.accountId === t.accountId)));
  showUndoToast(`Blocked ${t.senderEmail}`, async () => {
    const threads = await reloadThreads();
    setThreads(threads);
  });
  return true;
}

export async function doUnsnooze(t: Thread) {
  await unsnoozeThread(t);
  setThreads(appState.threads.filter(x => x.id !== t.id));
  showToast('Back in inbox', 3000);
  const threads = await reloadThreads();
  setThreads(threads);
}

export async function doMute(t: Thread) {
  const acct = accountFor(t);
  if (!acct) return;
  try {
    await muteThread(acct, t);
    setThreads(appState.threads.filter(x => x.id !== t.id));
    showUndoToast('Thread muted', async () => {
      await unmuteThread(t);
      const threads = await reloadThreads();
      setThreads(threads);
    });
  } catch (e) {
    console.error('Mute failed:', e);
    showToast('Mute failed');
  }
}

export async function doSetAside(t: Thread) {
  try {
    await setAsideThread(t);
    setThreads(appState.threads.filter(x => x.id !== t.id));
    showUndoToast('Set aside', async () => {
      await unsetAsideThread(t);
      const threads = await reloadThreads();
      setThreads(threads);
    });
  } catch (e) {
    console.error('Set aside failed:', e);
    showToast('Set aside failed');
  }
}

export async function doUnsetAside(t: Thread) {
  try {
    await unsetAsideThread(t);
    setThreads(appState.threads.filter(x => x.id !== t.id));
    showToast('Back in inbox', 3000);
    const threads = await reloadThreads();
    setThreads(threads);
  } catch (e) {
    console.error('Unset aside failed:', e);
    showToast('Unset aside failed');
  }
}

/** Bulk archive all selected threads */
export async function bulkArchive() {
  const ids = [...appState.selectedIds];
  const threads = appState.threads.filter(t => ids.includes(t.id));
  for (const t of threads) {
    const acct = accountFor(t);
    if (acct) await archiveThread(acct, t).catch(() => {});
  }
  setThreads(appState.threads.filter(t => !ids.includes(t.id)));
  setAppState('selectedIds', []);
  setAppState('bulkMode', false);
  invalidateSectionCache();
}

/** Bulk trash all selected threads */
export async function bulkTrash() {
  const ids = [...appState.selectedIds];
  const threads = appState.threads.filter(t => ids.includes(t.id));
  for (const t of threads) {
    const acct = accountFor(t);
    if (acct) await trashThread(acct, t).catch(() => {});
  }
  setThreads(appState.threads.filter(t => !ids.includes(t.id)));
  setAppState('selectedIds', []);
  setAppState('bulkMode', false);
}

/** Bulk mark read */
export async function bulkMarkRead() {
  const ids = [...appState.selectedIds];
  const threads = appState.threads.filter(t => ids.includes(t.id));
  for (const t of threads) {
    const acct = accountFor(t);
    if (acct) await markRead(acct, t).catch(() => {});
  }
  // Update store
  const newThreads = appState.threads.map(t =>
    ids.includes(t.id) ? { ...t, isUnread: false } : t
  );
  setThreads(newThreads);
  setAppState('selectedIds', []);
  setAppState('bulkMode', false);
}

/** Bulk mark unread */
export async function bulkMarkUnread() {
  const ids = [...appState.selectedIds];
  const threads = appState.threads.filter(t => ids.includes(t.id));
  for (const t of threads) {
    const acct = accountFor(t);
    if (acct) await markUnread(acct, t).catch(() => {});
  }
  const newThreads = appState.threads.map(t =>
    ids.includes(t.id) ? { ...t, isUnread: true } : t
  );
  setThreads(newThreads);
  setAppState('selectedIds', []);
  setAppState('bulkMode', false);
}

/** Bulk star */
export async function bulkStar() {
  const ids = [...appState.selectedIds];
  const threads = appState.threads.filter(t => ids.includes(t.id));
  for (const t of threads) {
    const acct = accountFor(t);
    if (acct) await toggleStar(acct, t).catch(() => {});
  }
  const newThreads = appState.threads.map(t =>
    ids.includes(t.id) ? { ...t, isStarred: true } : t
  );
  setThreads(newThreads);
  setAppState('selectedIds', []);
  setAppState('bulkMode', false);
}
