/**
 * App.tsx — Root Solid component for Kept.
 * Owns the main-area layout: unified-bar + app-body (inbox + reader-pane).
 */
import { Show } from 'solid-js';
import { UnifiedBar } from './UnifiedBar';
import { ThreadList } from './ThreadList';
import { ThreadReader } from './ThreadReader';
import { selectedThread, appState } from './store';

export function App() {
  // Solid owns inbox rendering; other views still use legacy innerHTML on #inbox
  const isInboxView = () => appState.currentView === 'Inbox';

  return (
    <>
      <div class="unified-bar-slot" id="unified-bar-slot">
        <UnifiedBar />
      </div>
      <div class="app-body">
        <div class="inbox" id="inbox">
          <Show when={isInboxView()}>
            <ThreadList />
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
    </>
  );
}
