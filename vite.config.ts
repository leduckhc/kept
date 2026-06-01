import { defineConfig } from "vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
const isE2E = process.env.VITE_E2E === '1';

// https://vite.dev/config/
export default defineConfig(async () => ({

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
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
    // Serve e2e/ as static assets in E2E browser mode (provides kept.db)
    ...(isE2E ? { fs: { allow: [path.resolve(__dirname, 'e2e')] } } : {}),
  },

  // In E2E mode, serve the e2e directory so sql.js can fetch kept.db
  ...(isE2E ? { publicDir: 'e2e' } : {}),
}));
