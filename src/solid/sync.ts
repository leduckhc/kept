/**
 * sync.ts — Sync orchestration for Solid app.
 * Calls gmail.ts, updates the Solid store directly.
 */
import { getAllAccounts } from '../auth';
import { type Thread, loadThreads, loadThreadsUnified, hasSyncedBefore, invalidateSectionCache, getAllGroupedSenders, getAllGroupedDomains, getAllVipSenders, getGroupedSenders, getGroupedDomains, getVipSenders, loadRepliedToSenders, loadAllSenderEmails } from '../store';
import { syncInbox } from '../gmail';
import { notifyNewThreads, updateBadge, ensureNotificationPermission } from '../notifications';
import { loadPhotoCache, resolvePhotos, hasCachedResult } from '../senderPhotos';
import { patchAvatarsWithPhotos } from '../avatar';
import { runAutoLabelsOnSync } from '../autoLabels';
import { appState, setAppState, setThreads, setStatus } from './store';
import { loadSmartFolders } from './smartFolderActions';

let _syncAbort: AbortController | null = null;

async function loadUnifiedThreads(): Promise<Thread[]> {
  return loadThreadsUnified(appState.accountFilter, 'ALL');
}

async function reloadThreads(): Promise<Thread[]> {
  if (appState.unifiedMode) {
    return loadUnifiedThreads();
  }
  if (appState.account) {
    return loadThreads(appState.account.id, 'ALL');
  }
  return [];
}

/** Refresh known senders from DB for smart notifications */
export async function refreshKnownSenders() {
  if (!appState.accounts.length) return;

  const BASELINE_KEY = 'kept-known-senders-seeded';
  const ACCEPTED_KEY = 'kept-accepted-senders';

  if (!localStorage.getItem(BASELINE_KEY)) {
    const allSenders = await Promise.all(
      appState.accounts.map(a => loadAllSenderEmails(a.id).catch(() => [] as string[]))
    );
    const baseline = allSenders.flat().map(e => e.toLowerCase());
    const existing: string[] = JSON.parse(localStorage.getItem(ACCEPTED_KEY) || '[]');
    const merged = [...new Set([...existing, ...baseline])];
    localStorage.setItem(ACCEPTED_KEY, JSON.stringify(merged));
    localStorage.setItem(BASELINE_KEY, '1');
  }

  const allEmails = await Promise.all(appState.accounts.map(a => loadRepliedToSenders(a.id).catch(() => [] as string[])));
  const known = new Set(allEmails.flat().map(e => e.toLowerCase()));

  const accepted: string[] = JSON.parse(localStorage.getItem(ACCEPTED_KEY) || '[]');
  for (const email of accepted) {
    known.add(email.toLowerCase());
  }

  setAppState('knownSenders', [...known]);
}

/** On boot: load active account threads, then kick off parallel sync for all accounts. */
export async function refreshAll() {
  if (!appState.account) return;

  await loadPhotoCache();

  // Reload grouped senders & domains
  if (appState.accountFilter === null) {
    setAppState('groupedSenders', await getAllGroupedSenders());
    setAppState('groupedDomains', await getAllGroupedDomains());
    setAppState('vipSenders', await getAllVipSenders());
  } else {
    setAppState('groupedSenders', await getGroupedSenders(appState.accountFilter));
    setAppState('groupedDomains', await getGroupedDomains(appState.accountFilter));
    setAppState('vipSenders', await getVipSenders(appState.accountFilter));
  }

  const threads = await reloadThreads();
  setThreads(threads);

  // Load saved smart folders
  await loadSmartFolders();

  ensureNotificationPermission().catch(() => {});

  // E2E mode: skip network sync entirely
  if (import.meta.env.VITE_E2E === '1') {
    setStatus(`E2E mode — ${appState.threads.length} threads loaded`);
    return;
  }

  // Parallel sync
  const allAccts = await getAllAccounts();
  setAppState('syncing', true);
  setStatus('Syncing…');

  const syncPromises = allAccts.map(acct =>
    syncInbox(acct, acct.id === appState.account!.id ? n => setStatus(`Syncing… ${n} threads`) : undefined)
      .catch(err => console.error(`Sync error for ${acct.email}:`, err))
  );
  await Promise.all(syncPromises);

  invalidateSectionCache();
  const freshThreads = await reloadThreads();
  setThreads(freshThreads);
  setAppState('syncing', false);
  setStatus(`Synced — ${appState.threads.length} threads`);
  setTimeout(() => setStatus(''), 5000);
}

export async function syncAndRender() {
  if (appState.syncing || !appState.account) return;

  // E2E mode: just reload from DB
  if (import.meta.env.VITE_E2E === '1') {
    const threads = await reloadThreads();
    setThreads(threads);
    setStatus(`E2E mode — ${threads.length} threads`);
    return;
  }

  setAppState('syncing', true);
  setStatus('Syncing…');

  if (_syncAbort) _syncAbort.abort();
  const abort = _syncAbort = new AbortController();

  try {
    if (appState.unifiedMode) {
      const allAccts = await getAllAccounts();
      const interval = Math.floor(60_000 / Math.max(allAccts.length, 1));
      for (let i = 0; i < allAccts.length; i++) {
        if (abort.signal.aborted) break;
        const a = allAccts[i];
        if (i > 0) await new Promise(r => setTimeout(r, interval));
        if (abort.signal.aborted) break;
        await syncInbox(a, a.id === appState.account!.id ? n => setStatus(`Syncing ${a.email.split('@')[0]}… ${n}`) : undefined)
          .catch(err => console.error(`Sync error for ${a.email}:`, err));
      }
      const threads = await loadUnifiedThreads();
      setThreads(threads);
      setStatus(`Synced — ${threads.length} threads`);
    } else {
      const preSync = await loadThreads(appState.account.id, 'ALL');
      const knownIds = new Set(preSync.map(t => t.id));
      const isSubsequentSync = await hasSyncedBefore(appState.account.id);

      await syncInbox(appState.account, n => setStatus(`Syncing… ${n} threads`));
      const threads = await loadThreads(appState.account.id, 'ALL');
      setThreads(threads);
      setStatus(`Synced — ${threads.length} threads`);

      refreshKnownSenders().catch(() => {});

      if (isSubsequentSync) {
        const newThreads = threads.filter(t => !knownIds.has(t.id));
        if (newThreads.length > 0) {
          const smartNotifs = appState.smartNotifications;
          const knownSet = new Set(appState.knownSenders);
          const toNotify = smartNotifs
            ? newThreads.filter(t => knownSet.has(t.senderEmail.toLowerCase()))
            : newThreads;
          if (toNotify.length > 0) {
            notifyNewThreads(toNotify.map(t => ({ senderName: t.senderName, subject: t.subject }))).catch(() => {});
          }
        }
      }
    }

    const unreadCount = appState.threads.filter(t => t.isUnread).length;
    updateBadge(unreadCount).catch(() => {});

    // Run auto-label rules after sync
    if (appState.unifiedMode) {
      const allAccts2 = await getAllAccounts();
      await Promise.all(allAccts2.map(a => runAutoLabelsOnSync(a.id).catch(() => 0)));
    } else {
      await runAutoLabelsOnSync(appState.account.id).catch(() => 0);
    }

    // Resolve photos
    resolveVisiblePhotos().catch(() => {});
  } catch (e) {
    console.error('Sync error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(`Sync error: ${msg}`);
  } finally {
    setAppState('syncing', false);
    setTimeout(() => setStatus(''), 5000);
  }
}

async function resolveVisiblePhotos(): Promise<void> {
  if (!appState.account || import.meta.env.VITE_E2E === '1') return;
  const emails = [...new Set(appState.threads.map(t => t.senderEmail.toLowerCase()))];
  const uncached = emails.filter(e => !hasCachedResult(e));
  if (uncached.length === 0) return;
  if (appState.unifiedMode) {
    const allAccts = await getAllAccounts();
    const ordered = [appState.account, ...allAccts.filter(a => a.id !== appState.account!.id)];
    for (const acct of ordered) {
      try {
        const resolved = await resolvePhotos(uncached, acct);
        patchAvatarsWithPhotos(resolved);
        return;
      } catch { /* try next account */ }
    }
  } else {
    const resolved = await resolvePhotos(uncached, appState.account);
    patchAvatarsWithPhotos(resolved);
  }
}
