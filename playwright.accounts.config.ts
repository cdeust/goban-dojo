import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e-accounts',
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chromium',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'pnpm exec vite preview --mode account-test',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
