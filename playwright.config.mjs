import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 1,
  use: { headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
