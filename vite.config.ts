import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

const host = process.env.TAURI_DEV_HOST;
const isE2E = process.env.VITE_E2E === '1';

// https://vite.dev/config/
export default defineConfig({
  plugins: [wasm()],
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // In E2E mode, serve the e2e directory so sql.js can fetch kept.db + sql-wasm.wasm
  ...(isE2E ? { publicDir: 'e2e' } : {}),

  // Pre-bundle sql.js (CJS→ESM) for browser E2E mode
  optimizeDeps: {
    include: isE2E ? ['sql.js'] : [],
  },
});
