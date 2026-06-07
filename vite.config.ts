import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;
const isE2E = process.env.VITE_E2E === '1';

// https://vite.dev/config/
export default defineConfig(async () => {
  const plugins: any[] = [];

  if (isE2E) {
    const { default: sqliteProxy } = await import('./e2e/vite-plugin-sqlite-proxy');
    plugins.push(sqliteProxy());
  }

  return {
    plugins,
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
  };
});
