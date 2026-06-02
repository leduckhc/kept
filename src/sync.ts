// sync.ts — Sync orchestration extracted from main.ts
import { getAllAccounts } from './auth';
import { type Thread, syncInbox, loadThreads, hasSyncedBefore, invalidateSectionCache, getGroupedSenders, getGroupedDomains } from './gmail';
import { notifyNewThreads, updateBadge, ensureNotificationPermission } from './notifications';
import { setStatus, flashStatus, esc } from './helpers';
import { state } from './state';

export interface SyncDeps {
  renderInbox: () => void;
  loadUnifiedThreads: () => Promise<Thread[]>;
  refreshKnownSenders: () => Promise<void>;
}

let _deps: SyncDeps | null = null;

export function initSync(deps: SyncDeps) {
  _deps = deps;
}

/** On boot: load active account threads, then kick off parallel sync for all accounts. */
export async function refreshAll() {
  if (!state.account || !_deps) return;
  const { renderInbox, loadUnifiedThreads } = _deps;

  // Reload grouped senders & domains for current account
  state.groupedSenders = await getGroupedSenders(state.account.id);
  state.groupedDomains = await getGroupedDomains(state.account.id);

  if (state.unifiedMode) {
    state.threads = await loadUnifiedThreads();
  } else {
    state.threads = await loadThreads(state.account.id);
  }
  renderInbox();

  // Request notification permission early (non-blocking)
  ensureNotificationPermission().catch(() => {});

  // E2E mode: skip network sync entirely, DB is pre-seeded
  if (import.meta.env.VITE_E2E === '1') {
    setStatus(`E2E mode — ${state.threads.length} threads loaded`);
    return;
  }

  // Parallel sync — one per account, errors are non-fatal per account
  const allAccts = await getAllAccounts();
  const syncPromises = allAccts.map(acct =>
    syncInbox(acct, acct.id === state.account!.id ? n => setStatus(`Syncing… ${n} threads`) : undefined)
      .catch(err => console.error(`Sync error for ${acct.email}:`, err))
  );
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  setStatus('Syncing…');
  await Promise.all(syncPromises);
  if (btn) btn.style.opacity = '';
  invalidateSectionCache();
  if (state.unifiedMode) {
    state.threads = await loadUnifiedThreads();
  } else {
    state.threads = await loadThreads(state.account.id);
  }
  renderInbox();
  flashStatus(`Synced — ${state.threads.length} threads`);
}

export async function syncAndRender() {
  if (state.syncing || !state.account || !_deps) return;
  const { renderInbox, loadUnifiedThreads, refreshKnownSenders } = _deps;

  // E2E mode: just reload from DB, no network
  if (import.meta.env.VITE_E2E === '1') {
    if (state.unifiedMode) {
      state.threads = await loadUnifiedThreads();
    } else {
      state.threads = await loadThreads(state.account.id);
    }
    renderInbox();
    setStatus(`E2E mode — ${state.threads.length} threads`);
    return;
  }

  state.syncing = true;
  setStatus('Syncing…');
  const btn = document.getElementById('btn-sync');
  if (btn) btn.style.opacity = '0.4';
  try {
    if (state.unifiedMode) {
      // Sync all accounts in parallel
      const allAccts = await getAllAccounts();
      await Promise.all(allAccts.map(a =>
        syncInbox(a, a.id === state.account!.id ? n => setStatus(`Syncing… ${n} threads`) : undefined)
          .catch(err => console.error(`Sync error for ${a.email}:`, err))
      ));
      state.threads = await loadUnifiedThreads();
      renderInbox();
      flashStatus(`Synced — ${state.threads.length} threads`);
    } else {
      // Capture thread IDs known before sync to detect new arrivals
      const preSync = await loadThreads(state.account.id);
      const knownIds = new Set(preSync.map(t => t.id));
      // Gate: only send notifications on second+ sync (historyId already set)
      const isSubsequentSync = await hasSyncedBefore(state.account.id);

      await syncInbox(state.account, n => setStatus(`Syncing… ${n} threads`));
      state.threads = await loadThreads(state.account.id);
      renderInbox();
      flashStatus(`Synced — ${state.threads.length} threads`);

      // Refresh known-senders after sync (SENT folder may have grown)
      refreshKnownSenders().catch(() => {});

      // Fire notifications for newly-arrived threads (not first sync)
      if (isSubsequentSync) {
        const newThreads = state.threads.filter(t => !knownIds.has(t.id));
        if (newThreads.length > 0) {
          const smartNotifs = localStorage.getItem('smartNotifications') !== 'false';
          const toNotify = smartNotifs
            ? newThreads.filter(t => state.knownSenders.has(t.senderEmail.toLowerCase()))
            : newThreads;
          if (toNotify.length > 0) {
            notifyNewThreads(toNotify.map(t => ({ senderName: t.senderName, subject: t.subject }))).catch(() => {});
          }
        }
      }
    }

    // Update tray badge / dock badge with total unread count
    const unreadCount = state.threads.filter(t => t.isUnread).length;
    updateBadge(unreadCount).catch(() => {});
  } catch (e) {
    console.error('Sync error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    flashStatus(`Sync error: ${msg}`);
    // Show error in inbox if it's empty so user sees it
    if (state.threads.length === 0) {
      const container = document.getElementById('inbox');
      if (container) container.innerHTML = `
        <div class="empty-state" style="color:var(--text-muted)">
          <div style="font-size:24px">⚠</div>
          <div>Sync failed</div>
          <div style="font-size:12px; margin-top:4px; max-width:320px; word-break:break-all">${esc(msg)}</div>
        </div>`;
    }
  } finally {
    state.syncing = false;
    if (btn) btn.style.opacity = '';
  }
}

/** Load and merge inbox threads from all accounts, sorted by receivedAt desc. */
export async function loadUnifiedThreads(): Promise<Thread[]> {
  const allAccts = await getAllAccounts();
  const perAccount = await Promise.all(allAccts.map(a => loadThreads(a.id).catch(() => [] as Thread[])));
  const merged = perAccount.flat();
  merged.sort((a, b) => b.receivedAt - a.receivedAt);
  return merged;
}
