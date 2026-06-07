/**
 * index.tsx — New Solid-first entry point for Kept.
 * Renders <App /> into #app, calls boot logic.
 */
import { render } from 'solid-js/web';
import { App } from './solid/App';
import { boot } from './solid/boot';

// Import styles
import './styles.css';

const root = document.getElementById('app');
if (root) {
  render(() => <App />, root);
}

// Boot the app (registers providers, loads accounts, starts sync)
boot();
