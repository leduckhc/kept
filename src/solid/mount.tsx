/**
 * Mount entry point — renders the Solid app tree into #solid-root.
 * Called from main.ts after the shell is rendered.
 * Starts the bridge to sync legacy state → Solid store.
 */
import { render } from 'solid-js/web';
import { App } from './App';
import { initBridge, initReverseBridge } from './bridge';

let dispose: (() => void) | null = null;

export function mountSolid(container: HTMLElement) {
  if (dispose) dispose(); // Clean up previous mount
  dispose = render(() => {
    initReverseBridge(); // Solid store → legacy state (runs inside reactive owner)
    return <App />;
  }, container);
  initBridge();
}

export function unmountSolid() {
  if (dispose) {
    dispose();
    dispose = null;
  }
}
