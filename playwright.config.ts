import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'ui.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  outputDir: 'test-results/playwright',
  use: {
    baseURL: 'http://127.0.0.1:5067',
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx tests/ui-server.ts',
    url: 'http://127.0.0.1:5067/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
