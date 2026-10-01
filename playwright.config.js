import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [['list']],
  outputDir: '.artifacts/browser',
  use: { baseURL: process.env.SITE_URL || 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: process.env.SITE_URL ? undefined : { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1050 } } },
    { name: 'phone-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'phone-chromium', use: { ...devices['Pixel 7'] } }
  ]
});
