import { defineConfig, devices } from '@playwright/test'

// Read-only smoke test of the LIVE site (no sign-up, no writes). Safe to run any time:
//   LIVE_URL=https://helpnear.pages.dev npm run test:live
const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] }
  : {}
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /live\.spec\.ts/,
  timeout: 45_000,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/live.json' }]],
  use: { baseURL: process.env.LIVE_URL || 'https://helpnear.pages.dev', ...devices['Desktop Chrome'], launchOptions },
})
