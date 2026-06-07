/**
 * boot.ts — Initialization: register providers, load accounts, start sync.
 */
import { getAllAccounts, startOAuth, migrateTokensToKeychain } from '../auth';
import { resolveActiveAccount, setActiveAccountId } from '../accountContext';
import { registerProvider } from '../providerRegistry';
import { registerAuthProvider } from '../authProviderRegistry';
import { applyTheme } from '../helpers';
import { setupSnoozeResurface } from '../snooze';
import { startScheduledSendDispatch } from '../scheduledSend';
import { sendEmail } from '../gmail';
import { appState, setAppState } from './store';
import { refreshAll, syncAndRender, refreshKnownSenders } from './sync';

let syncInterval: ReturnType<typeof setInterval> | null = null;

export async function boot() {
  // Register providers (lazy imports to avoid top-level Tauri crashes in browser)
  const { GmailProvider } = await import('../providers/gmail');
  const { GoogleAuthProvider } = await import('../authProviders/google');
  registerProvider('gmail', new GmailProvider());
  registerAuthProvider('gmail', new GoogleAuthProvider());

  // Apply saved theme
  applyTheme(localStorage.getItem('theme') ?? 'light');

  // E2E mode: skip OAuth, load from pre-seeded DB
  const isE2E = import.meta.env.VITE_E2E === '1';
  const isTauri = '__TAURI_INTERNALS__' in window;

  if (!isTauri && !isE2E) {
    // Browser-only dev: just show login screen
    return;
  }

  try {
    // One-time migration: tokens from SQLite → OS keychain
    await migrateTokensToKeychain();

    const accounts = await getAllAccounts();
    setAppState('accounts', accounts);

    const account = await resolveActiveAccount();
    if (account) {
      setAppState('account', account);
      setAppState('authenticated', true);
      setActiveAccountId(account.id);

      refreshKnownSenders().catch(() => {});
      await refreshAll();

      // Setup snooze resurface (uses a callback, but we just reload threads)
      setupSnoozeResurface(async () => {
        const { loadThreads, loadThreadsUnified } = await import('../store');
        const threads = appState.unifiedMode
          ? await loadThreadsUnified(appState.accountFilter, 'ALL')
          : await loadThreads(appState.account!.id, 'ALL');
        setAppState('threads', threads);
      });

      // Start scheduled send dispatch
      startScheduledSendDispatch(() => appState.account, sendEmail);

      // Background auto-sync every 60s
      syncInterval = setInterval(() => { syncAndRender().catch(() => {}); }, 60_000);
    }
  } catch (e) {
    console.error('Boot error:', e);
    // Auth screen already shown — user can log in fresh
  }
}

export async function doLogin() {
  try {
    const account = await startOAuth();
    const accounts = await getAllAccounts();
    setAppState('account', account);
    setAppState('accounts', accounts);
    setAppState('authenticated', true);
    setActiveAccountId(account.id);

    refreshKnownSenders().catch(() => {});
    await refreshAll();

    // Start periodic sync
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => { syncAndRender().catch(() => {}); }, 60_000);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    alert(`Login failed: ${msg}`);
  }
}
