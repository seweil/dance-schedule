import { test, expect, devices } from '@playwright/test'

test('nav links to the dance schedule page, which renders the default date\'s grid', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: /dance schedule/i }).click()
  await expect(page.getByRole('heading', { name: /dance schedule/i })).toBeVisible()
  // At least one room column header renders for the default (earliest) date.
  await expect(page.locator('[class*="roomHeader"]').first()).toBeVisible()
})

test('changing the date select swaps the grid to that date', async ({ page }) => {
  await page.goto('/dance-schedule')
  await expect(page.getByText('All Callers Dance')).not.toBeVisible()

  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  await expect(page.getByText('All Callers Dance')).toBeVisible()
})

test('a session spanning multiple rooms renders as one block, not two', async ({ page }) => {
  await page.goto('/dance-schedule')
  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  const spanningCards = page.getByText('All Callers Dance - All Callers')
  await expect(spanningCards).toHaveCount(1)
})

test('a roomless session renders as a full-width banner with its time range', async ({ page }) => {
  await page.goto('/dance-schedule')
  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  await expect(page.getByText('Lunch Break')).toBeVisible()
  await expect(page.getByText('12:00 PM – 1:30 PM')).toBeVisible()
})

test('narrowing the level slider hides out-of-range sessions and their now-empty room column', async ({
  page,
}) => {
  await page.goto('/dance-schedule')
  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  const columnCountBefore = await page.locator('[class*="roomHeader"]').count()

  const minThumb = page.getByRole('slider', { name: /minimum level/i })
  await minThumb.focus()
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('ArrowRight')
  }
  await expect(page.getByText('Level: C4 – C4')).toBeVisible()

  // Only C4 sessions remain — everything else, and any room column that had nothing
  // in C4, disappears.
  const columnCountAfter = await page.locator('[class*="roomHeader"]').count()
  expect(columnCountAfter).toBeLessThan(columnCountBefore)
  await expect(page.getByText('All Callers Dance - All Callers')).not.toBeVisible()
})

test('unchecking "Show GCA callers" hides the GCA line without hiding the session', async ({
  page,
}) => {
  await page.goto('/dance-schedule')
  await expect(page.getByText(/^GCA:/).first()).toBeVisible()

  await page.getByLabel(/show gca callers/i).uncheck()

  await expect(page.getByText(/^GCA:/)).toHaveCount(0)
  await expect(page.getByText('Dancing -').first()).toBeVisible()
})

test('app shell still renders the dance schedule page when offline after the SW takes control', async ({
  page,
  context,
}) => {
  await page.goto('/dance-schedule')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: /dance schedule/i })).toBeVisible()
  await expect(page.locator('[class*="roomHeader"]').first()).toBeVisible()
  await context.setOffline(false)
})

test.describe('mobile viewport', () => {
  // Both orientations matter here, not just portrait: an iPhone in landscape is wide
  // (past a naive width-only breakpoint) but short — exactly the case
  // DanceScheduleGrid.module.css's `(max-width: 640px), (max-height: 500px)` query is
  // built to also catch, and the primary motivating scenario for this behavior.
  const orientations = [
    { label: 'portrait', deviceKey: 'iPhone 13' },
    { label: 'landscape', deviceKey: 'iPhone 13 landscape' },
  ] as const

  for (const { label, deviceKey } of orientations) {
    test.describe(label, () => {
      const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices[deviceKey]
      test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

      test('room header pins to the top of the viewport as the page scrolls down', async ({
        page,
      }) => {
        await page.goto('/dance-schedule')
        const firstHeader = page.locator('[class*="roomHeader"]').first()
        await expect(firstHeader).toBeVisible()

        await page.evaluate(() => window.scrollBy(0, 400))
        await expect(async () => {
          const scrollTop = await page.evaluate(() => document.documentElement.scrollTop)
          expect(scrollTop).toBeGreaterThan(0)
        }).toPass()

        // Sticky top: 0 puts it flush with the viewport's top edge once scrolled past
        // its natural position — a couple of px of slack for sub-pixel layout.
        const box = await firstHeader.boundingBox()
        expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
        expect(box?.y ?? Infinity).toBeLessThan(2)
      })

      test('nav and filters scroll out of view as the page scrolls down', async ({ page }) => {
        await page.goto('/dance-schedule')
        const navLink = page.getByRole('link', { name: /dance schedule/i })
        const dateSelect = page.getByLabel('Date')
        await expect(navLink).toBeVisible()
        await expect(dateSelect).toBeVisible()

        await page.evaluate(() => window.scrollBy(0, 400))

        // Fully above the viewport's top edge — not just "not intersecting the
        // pointer," genuinely scrolled out of view.
        const navBox = await navLink.boundingBox()
        const dateBox = await dateSelect.boundingBox()
        expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeLessThanOrEqual(0)
        expect((dateBox?.y ?? 0) + (dateBox?.height ?? 0)).toBeLessThanOrEqual(0)
      })

      test('grid spans the full viewport width with no left/right inset', async ({ page }) => {
        await page.goto('/dance-schedule')
        const grid = page.locator('[class*="scrollContainer"]')
        await expect(grid).toBeVisible()

        const box = await grid.boundingBox()
        const viewportWidth = page.viewportSize()?.width ?? 0
        expect(Math.abs(box?.x ?? 999)).toBeLessThan(2)
        // The grid itself may be wider than the viewport (more room columns than fit,
        // scrolling the page horizontally) — only the left edge needs to be flush.
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(viewportWidth)
      })

      test('page scrolls horizontally when the grid is wider than the viewport', async ({
        page,
      }) => {
        await page.goto('/dance-schedule')
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(scrollWidth).toBeGreaterThan(clientWidth)
      })
    })
  }
})
