// sync.ts — Sync orchestration extracted from main.ts
import { getAllAccounts } from './auth';
import { type Thread, loadThreads, hasSyncedBefore, invalidateSectionCache, getGroupedSenders, getGroupedDomains, getVipSenders, loadThreadsUnified, getAllVipSenders, getAllGroupedSenders, getAllGroupedDomains } from './store';
import { syncInbox } from './gmail';
import { notifyNewThreads, updateBadge, ensureNotificationPermission } from './notifications';
import { setStatus, flashStatus, esc } from './helpers';
import { appState, setAppState } from './solid/store';
import { loadPhotoCache, resolvePhotos, hasCachedResult } from './senderPhotos';
import { patchAvatarsWithPhotos } from './avatar';
import { runAutoLabelsOnSync } from './autoLabels';

export interface SyncDeps {
  renderCurrentView: () => void;
  loadUnifiedThreads: () => Promise<Thread[]>;
  refreshKnownSenders: () => Promise<void>;
}

let _deps: SyncDeps | null = null;
let _syncAbort: AbortController | null = null;

export function initSync(deps: SyncDeps) {
  _deps = deps;
}

/** On boot: load active account threads, then kick off parallel sync for all accounts. */
export async function refreshAll() {
  if (!appState.account || !_deps) return;
  const { renderCurrentView, loadUnifiedThreads } = _deps;

  // Load photo cache from DB on first call
  await loadPhotoCache();

  // Reload grouped senders & domains for current account
  if (appState.accountFilter === null) {
    // Unified mode: union of all accounts' VIPs and groups
    setAppState('groupedSenders', await getAllGroupedSenders());
    setAppState('groupedDomains', await getAllGroupedDomains());
    setAppState('vipSenders', await getAllVipSenders());
  } else {
    setAppState('groupedSenders', await getGroupedSenders(appState.accountFilter));
    setAppState('groupedDomains', await getGroupedDomains(appState.accountFilter));
    setAppState('vipSenders', await getVipSenders(appState.accountFilter));
  }

  if (appState.unifiedMode) {
    setAppState('threads', await loadUnifiedThreads());
  } else {
    setAppState('threads', await loadThreads(appState.account.id));
  }
  renderCurrentView();

  // Request notification permission early (non-blocking)
  ensureNotificationPermission().catch(() => {});

  // E2E mode: skip network sync entirely, DB is pre-seeded
  if (import.meta.env.VITE_E2E === '1') {
    setStatus(`E2E mode — ${appState.threads.length} threads loaded`);
    return;
  }

  // Parallel sync — one per account, errors are non-fatal per account
  const allAccts = await getAllAccounts();
  const syncPromises = allAccts.map(acct =>
    syncInbox(acct, acct.id === appState.account!.id ? n => setStatus(`Syncing… ${n} threads`) : undefined)
      .catch(err => console.error(`Sync error for ${acct.email}:`, err))
  );
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  setStatus('Syncing…');
  await Promise.all(syncPromises);
  if (btn) btn.style.opacity = '';
  invalidateSectionCache();
  if (appState.unifiedMode) {
    setAppState('threads', await loadUnifiedThreads());
  } else {
    setAppState('threads', await loadThreads(appState.account.id));
  }
  renderCurrentView();
  flashStatus(`Synced — ${appState.threads.length} threads`);
}

export async function syncAndRender() {
  if (appState.syncing || !appState.account || !_deps) return;
  const { renderCurrentView, loadUnifiedThreads, refreshKnownSenders } = _deps;

  // E2E mode: just reload from DB, no network
  if (import.meta.env.VITE_E2E === '1') {
    if (appState.unifiedMode) {
      setAppState('threads', await loadUnifiedThreads());
    } else {
      setAppState('threads', await loadThreads(appState.account.id));
    }
    renderCurrentView();
    setStatus(`E2E mode — ${appState.threads.length} threads`);
    return;
  }

  setAppState('syncing', true);
  setStatus('Syncing…');
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  // Cancel any in-flight stagger loop
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
      setAppState('threads', await loadUnifiedThreads());
      renderCurrentView();
      flashStatus(`Synced — ${appState.threads.length} threads`);
    } else {
      // Capture thread IDs known before sync to detect new arrivals
      const preSync = await loadThreads(appState.account.id);
      const knownIds = new Set(preSync.map(t => t.id));
      // Gate: only send notifications on second+ sync (historyId already set)
      const isSubsequentSync = await hasSyncedBefore(appState.account.id);

      await syncInbox(appState.account, n => setStatus(`Syncing… ${n} threads`));
      setAppState('threads', await loadThreads(appState.account.id));
      renderCurrentView();
      flashStatus(`Synced — ${appState.threads.length} threads`);

      // Refresh known-senders after sync (SENT folder may have grown)
      refreshKnownSenders().catch(() => {});

      // Fire notifications for newly-arrived threads (not first sync)
      if (isSubsequentSync) {
        const newThreads = appState.threads.filter(t => !knownIds.has(t.id));
        if (newThreads.length > 0) {
          const smartNotifs = localStorage.getItem('smartNotifications') !== 'false';
          const toNotify = smartNotifs
            ? newThreads.filter(t => appState.knownSenders.includes(t.senderEmail.toLowerCase()))
            : newThreads;
          if (toNotify.length > 0) {
            notifyNewThreads(toNotify.map(t => ({ senderName: t.senderName, subject: t.subject }))).catch(() => {});
          }
        }
      }
    }

    // Update tray badge / dock badge with total unread count
    const unreadCount = appState.threads.filter(t => t.isUnread).length;
    updateBadge(unreadCount).catch(() => {});

    // KPT-085: Run auto-label rules after sync
    if (appState.unifiedMode) {
      const allAccts2 = await getAllAccounts();
      await Promise.all(allAccts2.map(a => runAutoLabelsOnSync(a.id).catch(() => 0)));
    } else {
      await runAutoLabelsOnSync(appState.account.id).catch(() => 0);
    }

    // Background: resolve Google profile photos for visible senders
    resolveVisiblePhotos().catch(() => {});
  } catch (e) {
    console.error('Sync error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    flashStatus(`Sync error: ${msg}`);
    // Show error in inbox if it's empty so user sees it
    if (appState.threads.length === 0) {
      const container = document.getElementById('inbox');
      if (container) container.innerHTML = `
        <div class="empty-state" style="color:var(--text-muted)">
          <div style="font-size:24px">⚠</div>
          <div>Sync failed</div>
          <div style="font-size:12px; margin-top:4px; max-width:320px; word-break:break-all">${esc(msg)}</div>
        </div>`;
    }
  } finally {
    setAppState('syncing', false);
    if (btn) btn.style.opacity = '';
  }
}

/** Load and merge inbox threads from all accounts, sorted by receivedAt desc. */
export async function loadUnifiedThreads(): Promise<Thread[]> {
  return loadThreadsUnified(appState.accountFilter);
}

/** Resolve Google profile photos for sender emails visible in current inbox (non-blocking). */
async function resolveVisiblePhotos(): Promise<void> {
  if (!appState.account || import.meta.env.VITE_E2E === '1') return;
  // Collect unique emails from current threads that aren't already cached
  const emails = [...new Set(appState.threads.map(t => t.senderEmail.toLowerCase()))];
  const uncached = emails.filter(e => !hasCachedResult(e));
  if (uncached.length === 0) return;
  // In unified mode, try all accounts (primary first) in case primary token is stale
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
