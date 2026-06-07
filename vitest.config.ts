import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: 'happy-dom',
    exclude: ['e2e-tests/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      'solid-js/store': 'solid-js/store/dist/store.js',
      'solid-js/web': 'solid-js/web/dist/web.js',
      'solid-js': 'solid-js/dist/solid.js',
    },
  },
});
