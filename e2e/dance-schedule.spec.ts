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
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13']
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('grid scrolls horizontally with the time column and room header staying pinned', async ({
    page,
  }) => {
    await page.goto('/dance-schedule')
    await expect(page.getByRole('heading', { name: /dance schedule/i })).toBeVisible()

    const firstHeader = page.locator('[class*="roomHeader"]').first()
    await expect(firstHeader).toBeVisible()
    const beforeScrollBox = await firstHeader.boundingBox()

    // The grid's own scroll container should be wider than the viewport (more rooms
    // than fit), independent of the page itself never overflowing horizontally.
    const grid = page.locator('[class*="scrollContainer"]')
    const { scrollWidth, clientWidth } = await grid.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(scrollWidth).toBeGreaterThan(clientWidth)

    await grid.evaluate((el) => {
      el.scrollLeft = 300
    })

    // The first room header stays visually pinned at the same screen position even
    // though the grid's content scrolled sideways underneath it.
    const afterScrollBox = await firstHeader.boundingBox()
    expect(afterScrollBox?.x).toBeCloseTo(beforeScrollBox?.x ?? 0, 0)

    const { docScrollWidth, docClientWidth } = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    }))
    expect(docScrollWidth).toBeLessThanOrEqual(docClientWidth)
  })
})
