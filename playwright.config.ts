import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    // Desktop viewports
    {
      name: 'desktop-1920',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // Narrow desktop (simulates tablet-ish)
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    // Mobile (Chrome on Pixel)
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'VITE_E2E=1 pnpm vite --port 5175',
    port: 5175,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
