/**
 * Temporary bridge: syncs the legacy mutable `state` object into the reactive
 * SolidJS store. This allows old imperative code to coexist with new Solid
 * components during incremental migration.
 *
 * Removed in Phase 4 when all mutations go through setAppState directly.
 */
import { state } from '../state';
import { appState, setAppState } from './store';

let bridgeInterval: ReturnType<typeof setInterval> | null = null;
let lastThreadsRef: unknown = null;

/** Start polling the legacy state and pushing changes to SolidJS store. */
export function initBridge() {
  if (bridgeInterval) return; // Already running

  bridgeInterval = setInterval(() => {
    // Threads — track by reference to the legacy array
    if (state.threads !== lastThreadsRef) {
      lastThreadsRef = state.threads;
      setAppState('threads', state.threads);
    }
    if (state.currentView !== appState.currentView) {
      setAppState('currentView', state.currentView);
    }
    if (state.selectedThreadId !== appState.selectedThreadId) {
      setAppState('selectedThreadId', state.selectedThreadId);
    }
    if (state.bulkMode !== appState.bulkMode) {
      setAppState('bulkMode', state.bulkMode);
    }
    // Convert Set<string> → string[] for the Solid store
    const legacyIds = [...state.selectedIds];
    const storeIds = appState.selectedIds;
    if (legacyIds.length !== storeIds.length || legacyIds.some((id, i) => id !== storeIds[i])) {
      setAppState('selectedIds', legacyIds);
    }
    if (state.searchQuery !== appState.searchQuery) {
      setAppState('searchQuery', state.searchQuery);
    }
    if (state.syncing !== appState.syncing) {
      setAppState('syncing', state.syncing);
    }
    if (state.account !== appState.account) {
      setAppState('account', state.account);
    }
    if ((state.accounts as unknown) !== (appState.accounts as unknown)) {
      setAppState('accounts', state.accounts);
    }
    if (state.categoryFilter !== appState.categoryFilter) {
      setAppState('categoryFilter', state.categoryFilter);
    }
    if (state.senderFilter !== appState.senderFilter) {
      setAppState('senderFilter', state.senderFilter);
    }
    if (state.domainFilter !== appState.domainFilter) {
      setAppState('domainFilter', state.domainFilter);
    }
    if (state.layoutMode !== appState.layoutMode) {
      setAppState('layoutMode', state.layoutMode);
    }
    if (state.unifiedMode !== appState.unifiedMode) {
      setAppState('unifiedMode', state.unifiedMode);
    }
    if (state.accountFilter !== appState.accountFilter) {
      setAppState('accountFilter', state.accountFilter);
    }
  }, 50);
}

/** Stop the bridge (call during Phase 4 cleanup). */
export function destroyBridge() {
  if (bridgeInterval) {
    clearInterval(bridgeInterval);
    bridgeInterval = null;
  }
}
