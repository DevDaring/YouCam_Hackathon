import { defineConfig, devices } from '@playwright/test'
import { homedir } from 'node:os'

/**
 * Button-by-button E2E suite. Needs the API running (backend: uvicorn on :8000) and serves the
 * production build with `vite preview` (which proxies /api to :8000). Against production:
 *   E2E_BASE_URL=https://dearyou.koushikdeb.com npx playwright test
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const CHROME = process.env.E2E_CHROME ?? `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`

const shared = {
  timezoneId: 'Asia/Kolkata',
  locale: 'en-IN',
  geolocation: { latitude: 22.5726, longitude: 88.3639 }, // Kolkata
  permissions: ['geolocation', 'camera'],
  launchOptions: {
    executablePath: CHROME,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: BASE, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], ...shared } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, ...shared } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npx vite preview --port 4173 --strictPort', url: BASE, reuseExistingServer: true, timeout: 30_000 },
})
