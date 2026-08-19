import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // Every test otherwise gets a genuinely fresh browser context (no
    // localStorage) — which, at a phone-shaped viewport, is exactly what
    // FirstRunTextSizePrompt.tsx's one-time modal is FOR: it correctly shows
    // on that literal first load, same as a real first-time visitor. Its
    // opaque, blocking backdrop (z-index above everything) then intercepts
    // any click a test tries to make elsewhere on the page — confirmed live,
    // it broke two existing "mobile viewport" tests in app.spec.ts that have
    // nothing to do with text size at all. None of today's specs are
    // actually testing the first-run prompt itself, so pre-seeding its
    // dismissed flag here — the same way a real device stays past onboarding
    // after its own first launch — is the right default for everything else;
    // a future spec that specifically wants to exercise the modal can clear
    // this one key itself before navigating.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [
            { name: 'dance-schedule:hint-dismissed:text-size', value: JSON.stringify(true) },
          ],
        },
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
