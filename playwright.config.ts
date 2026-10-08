import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run against the production build. Set CHROMIUM_PATH to use an
 * installed Chromium instead of downloading one.
 */
const chromiumPath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'off',
    launchOptions: chromiumPath ? { executablePath: chromiumPath, args: ['--no-sandbox'] } : {},
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
