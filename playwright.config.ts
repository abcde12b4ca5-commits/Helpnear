import { defineConfig, devices } from '@playwright/test'

// E2E tests drive a real browser against the PRODUCTION BUILD of the site (served by `vite preview`) wired to the Firebase
// EMULATORS, so nothing here ever touches your real Firebase project or users.
//   npm run test:e2e         -> starts the emulators, seeds them, runs everything (needs Java)
//   npm run test:e2e:public  -> only the pages that need no backend
// PW_CHROMIUM_PATH lets you point at a Chromium you already have (used where the official download is blocked).
const PORT = 4173
const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  : {}

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: /live\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/e2e.json' }]] : [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions },
  projects: [
    { name: 'public', testMatch: /(public|a11y)\.spec\.ts/, use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'], launchOptions } },
    { name: 'journey', testMatch: /journey\.spec\.ts/, use: { ...devices['Desktop Chrome'], launchOptions } },
  ],
  webServer: { command: 'node tests/e2e/serve.mjs', url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI, timeout: 180_000, stdout: 'ignore', stderr: 'pipe' },
})
