/**
 * App.tsx — Root Solid component for Kept.
 * Full shell: auth screen OR (sidebar + main area with unified bar + inbox/reader).
 * Also includes compose overlay and settings panel.
 */
import { Show } from 'solid-js';
import { UnifiedBar } from './UnifiedBar';
import { ThreadList } from './ThreadList';
import { ThreadReader } from './ThreadReader';
import { TriageView } from './TriageView';
import { Sidebar, NavDrawer } from './Sidebar';
import { Compose } from './Compose';
import { Settings } from './Settings';
import { selectedThread, appState } from './store';
import { useKeyboardShortcuts } from './keyboard';
import { doLogin } from './boot';

function AuthScreen() {
  const handleLogin = () => {
    doLogin();
  };

  return (
    <div id="auth-screen">
      <div class="app-name">Kept</div>
      <div class="app-tagline">A minimal email client</div>
      <button class="btn-google" id="btn-login" onClick={handleLogin}>
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.1 0 5.5 1.1 7.4 2.9l5.5-5.5C33.5 3.7 29 1.5 24 1.5 14.9 1.5 7.2 7.2 4.2 15.2l6.4 5C12 13.4 17.5 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.9-2.2 5.4-4.6 7l7.1 5.5c4.2-3.8 6.6-9.5 6.6-16.5z"/>
          <path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.7-4.6l-6.4-5A23.5 23.5 0 0 0 .5 24c0 3.8.9 7.4 2.5 10.6l7.6-6z"/>
          <path fill="#34A853" d="M24 46.5c5 0 9.2-1.6 12.3-4.4l-7.1-5.5c-2 1.3-4.4 2.1-5.2 2.1-6.5 0-12-4-14-9.5l-7.6 6C7.2 40.8 14.9 46.5 24 46.5z"/>
        </svg>
        Sign in with Google
      </button>
    </div>
  );
}

function AppShell() {
  // Register keyboard shortcuts at the shell level
  useKeyboardShortcuts();

  return (
    <div id="app-shell" class={`layout-2pane${selectedThread() ? ' reader-open' : ''}`}>
      <NavDrawer />
      <Sidebar />
      <div class="main-area">
        <div class="unified-bar-slot" id="unified-bar-slot">
          <UnifiedBar />
        </div>
        <div class="app-body">
          <div class="inbox" id="inbox">
            <Show when={appState.currentView === 'Triage'} fallback={<ThreadList />}>
              <TriageView />
            </Show>
          </div>
          <div class="reader-pane" id="reader-pane">
            <Show when={selectedThread()} fallback={
              <div class="reader-pane-empty">
                <div class="reader-pane-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </div>
                <div class="reader-pane-empty-text">Select a conversation</div>
              </div>
            }>
              <ThreadReader />
            </Show>
          </div>
        </div>
        <div class="statusbar">
          <span id="status-right">{appState.statusMessage}</span>
        </div>
      </div>
      <Compose />
      <Settings />
    </div>
  );
}

export function App() {
  return (
    <Show when={appState.authenticated} fallback={<AuthScreen />}>
      <AppShell />
    </Show>
  );
}
