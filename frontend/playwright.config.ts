import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: process.env.E2E_APP_URL || 'http://127.0.0.1:4179',
    storageState: process.env.E2E_STORAGE_STATE || undefined,
  },
  webServer: process.env.E2E_APP_URL ? undefined : { command: 'npm run dev -- --port 4179', url: 'http://127.0.0.1:4179', reuseExistingServer: !process.env.CI },
});
