import { test, expect, devices, type Page } from '@playwright/test'

// The level slider's first-launch hint ("Tap or drag to filter dance levels" —
// DanceScheduleFilters.tsx, HintBalloon.tsx, docs/design/onboarding-hints.md).
// playwright.config.ts pre-dismisses every hint so other specs' taps aren't
// swallowed; here only the two that legitimately come first are — the phone's
// one-time text-size prompt (which holds this hint back while it's up) and the
// menu hint — so this one is live, as on a real first launch.
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:4173',
        localStorage: [
          { name: 'dance-schedule:hint-dismissed:text-size', value: JSON.stringify(true) },
          { name: 'dance-schedule:hint-dismissed:kebab-menu', value: JSON.stringify(true) },
        ],
      },
    ],
  },
})

const HINT = 'Tap or drag to filter dance levels'

function hint(page: Page) {
  return page.getByRole('status').filter({ hasText: HINT })
}

// The field the hint rings — the level slider's own field, which carries the
// hint's state.
function levelField(page: Page) {
  return page.locator('[data-hint-visible]').filter({ has: page.getByRole('slider', { name: 'Minimum level' }) })
}

test('shows on first launch, ringing the level slider', async ({ page }) => {
  await page.goto('/automated-testing/dance-schedule')
  await expect(hint(page)).toBeVisible()
  await expect(levelField(page)).toHaveAttribute('data-hint-visible', 'true')
})

test('a first tap on a tick only dismisses it; the next tap selects', async ({ page }) => {
  await page.goto('/automated-testing/dance-schedule')
  const minThumb = page.getByRole('slider', { name: 'Minimum level' })
  const before = await minThumb.getAttribute('aria-valuenow')
  const plusTick = page.getByRole('button', { name: 'Plus', exact: true })

  await plusTick.click()
  await expect(hint(page)).toHaveCount(0)
  await expect(levelField(page)).toHaveAttribute('data-hint-visible', 'false')
  await expect(minThumb).toHaveAttribute('aria-valuenow', before!)

  await plusTick.click()
  await expect(minThumb).not.toHaveAttribute('aria-valuenow', before!)
})

test('once dismissed, stays dismissed across reloads and the other schedule pages', async ({ page }) => {
  await page.goto('/automated-testing/dance-schedule')
  await expect(hint(page)).toBeVisible()
  await page.getByRole('heading', { level: 1 }).click()
  await expect(hint(page)).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('slider', { name: 'Minimum level' })).toBeVisible()
  await expect(hint(page)).toHaveCount(0)
  await page.goto('/automated-testing/room-schedule')
  await expect(page.getByRole('slider', { name: 'Minimum level' })).toBeVisible()
  await expect(hint(page)).toHaveCount(0)
})

// The Staff Schedule's filter row now also holds the "Show more staff" button,
// and a phone lays the filters out three ways — check the hint still points at
// the level slider in each.
for (const [label, device] of [
  ['phone portrait', 'iPhone 13'],
  ['phone landscape', 'iPhone 13 landscape'],
] as const) {
  test.describe(label, () => {
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices[device]
    test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

    for (const route of ['dance-schedule', 'caller-schedule']) {
      test(`on ${route}, the balloon sits just below the level slider and overlaps it horizontally`, async ({
        page,
      }) => {
        await page.goto(`/MidWinter2027/${route}`)
        await expect(hint(page)).toBeVisible()
        const balloon = (await hint(page).boundingBox())!
        const slider = (await levelField(page).boundingBox())!
        expect(balloon.y).toBeGreaterThan(slider.y)
        expect(balloon.y - (slider.y + slider.height)).toBeLessThan(viewport.height / 4)
        expect(balloon.x).toBeLessThan(slider.x + slider.width)
        expect(balloon.x + balloon.width).toBeGreaterThan(slider.x)
      })
    }
  })
}
