import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'path';

const solidPkg = resolve(__dirname, 'node_modules/solid-js');

export default defineConfig({
  plugins: [solidPlugin({ ssr: false })],
  test: {
    environment: 'happy-dom',
    exclude: ['e2e-tests/**', 'node_modules/**'],
    deps: {
      inline: [/solid-js/, /@solidjs\/testing-library/],
    },
    server: {
      deps: {
        inline: [/solid-js/, /@solidjs\/testing-library/],
      },
    },
  },
  resolve: {
    conditions: ['browser', 'solid'],
    alias: {
      'solid-js/store': resolve(solidPkg, 'store/dist/store.js'),
      'solid-js/web': resolve(solidPkg, 'web/dist/web.js'),
      'solid-js': resolve(solidPkg, 'dist/solid.js'),
    },
  },
});
