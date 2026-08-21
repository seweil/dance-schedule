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
    //
    // The other two onboarding hints (HintBalloon.tsx/useFirstLaunchHint.ts)
    // need the identical treatment, for a related but distinct reason: per
    // direct product decision, EVERY hint swallows a page's very first tap
    // anywhere that isn't the hint's own balloon (dismiss-only, no matter
    // what it landed on — see HintBalloon.tsx's own comment). On a genuinely
    // fresh context, that's the level-slider hint's real target's OWN tick/
    // thumb, or any other in-page control a test happens to click first —
    // confirmed live as two real e2e failures, not hypothetical:
    // room-schedule.spec.ts's "clicking a level tick label..." (the tick's
    // own click got swallowed, range never changed) and both that file's and
    // dance-schedule.spec.ts's "unchecking Show GCA callers..." (the
    // checkbox's click got swallowed, state never changed) — neither test is
    // exercising the hint mechanism itself, so losing their first click to it
    // was never the point. 'kebab-menu' is mobile-only (the toggle it targets
    // doesn't render on desktop), so it's a no-op for chromium's desktop
    // viewport today, but harmless to pre-dismiss regardless — cheap
    // insurance against the same class of failure the moment any test runs
    // at a mobile viewport and clicks something else first.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [
            { name: 'dance-schedule:hint-dismissed:text-size', value: JSON.stringify(true) },
            { name: 'dance-schedule:hint-dismissed:level-slider', value: JSON.stringify(true) },
            { name: 'dance-schedule:hint-dismissed:kebab-menu', value: JSON.stringify(true) },
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
