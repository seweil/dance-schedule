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

test('desktop: the panel itself scrolls both directions, unaffected by the mobile split-header behavior', async ({
  page,
}) => {
  await page.goto('/dance-schedule')
  const panel = page.locator('[class*="panelWrapper"]')
  const { scrollWidth, clientWidth, scrollHeight, clientHeight } = await panel.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  // The panel is its own scroll area on desktop (today's pre-existing behavior) —
  // more rooms than fit horizontally, and content taller than the 70vh cap vertically.
  expect(scrollWidth).toBeGreaterThan(clientWidth)
  expect(scrollHeight).toBeGreaterThan(clientHeight)

  // The page itself never needs to scroll — everything is contained in the panel.
  const { docScrollHeight, docClientHeight } = await page.evaluate(() => ({
    docScrollHeight: document.documentElement.scrollHeight,
    docClientHeight: document.documentElement.clientHeight,
  }))
  expect(docScrollHeight).toBeLessThanOrEqual(docClientHeight + 1)
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
        const panel = page.locator('[class*="panelWrapper"]')
        await expect(panel).toBeVisible()

        const box = await panel.boundingBox()
        const viewportWidth = page.viewportSize()?.width ?? 0
        expect(Math.abs(box?.x ?? 999)).toBeLessThan(2)
        expect(box?.width ?? 0).toBeCloseTo(viewportWidth, 0)
      })

      test('only the grid body scrolls horizontally — the page itself never overflows', async ({
        page,
      }) => {
        await page.goto('/dance-schedule')
        const body = page.locator('[class*="bodyWrapper"]')
        const { scrollWidth, clientWidth } = await body.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }))
        // More room columns than fit — the body itself is the thing that scrolls.
        expect(scrollWidth).toBeGreaterThan(clientWidth)

        const { docScrollWidth, docClientWidth } = await page.evaluate(() => ({
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
        }))
        expect(docScrollWidth).toBeLessThanOrEqual(docClientWidth)
      })

      test('scrolling the grid body horizontally leaves nav, heading, and filters in place', async ({
        page,
      }) => {
        await page.goto('/dance-schedule')
        const navLink = page.getByRole('link', { name: /dance schedule/i })
        const heading = page.getByRole('heading', { name: /dance schedule/i })
        const dateSelect = page.getByLabel('Date')
        const [navBoxBefore, headingBoxBefore, dateBoxBefore] = await Promise.all([
          navLink.boundingBox(),
          heading.boundingBox(),
          dateSelect.boundingBox(),
        ])

        const body = page.locator('[class*="bodyWrapper"]')
        await body.evaluate((el) => {
          el.scrollLeft = 300
        })

        const [navBoxAfter, headingBoxAfter, dateBoxAfter] = await Promise.all([
          navLink.boundingBox(),
          heading.boundingBox(),
          dateSelect.boundingBox(),
        ])
        expect(navBoxAfter?.x).toBe(navBoxBefore?.x)
        expect(headingBoxAfter?.x).toBe(headingBoxBefore?.x)
        expect(dateBoxAfter?.x).toBe(dateBoxBefore?.x)
      })

      test('scrolling the grid body horizontally mirrors onto the header (room names track their column)', async ({
        page,
      }) => {
        await page.goto('/dance-schedule')
        const firstHeaderBefore = await page.locator('[class*="roomHeader"]').first().boundingBox()

        const body = page.locator('[class*="bodyWrapper"]')
        const header = page.locator('[class*="headerWrapper"]')
        await body.evaluate((el) => {
          el.scrollLeft = 300
        })

        // The scroll listener fires on the native 'scroll' event, which can lag a
        // JS-driven scrollLeft assignment by more than one tick (observed live) —
        // poll for the sync to settle rather than asserting immediately.
        await expect(async () => {
          const [headerScrollLeft, bodyScrollLeft] = await Promise.all([
            header.evaluate((el) => el.scrollLeft),
            body.evaluate((el) => el.scrollLeft),
          ])
          expect(headerScrollLeft).toBe(bodyScrollLeft)
          expect(bodyScrollLeft).toBeGreaterThan(0)
        }).toPass()

        const firstHeaderAfter = await page.locator('[class*="roomHeader"]').first().boundingBox()
        // The room header moved with its column (not left in place like nav/filters) —
        // this is what keeps a header aligned with the cells underneath it.
        expect(firstHeaderAfter?.x).not.toBe(firstHeaderBefore?.x)
      })

      test('switching date resets horizontal scroll position', async ({ page }) => {
        await page.goto('/dance-schedule')
        const body = page.locator('[class*="bodyWrapper"]')
        await body.evaluate((el) => {
          el.scrollLeft = 300
        })
        await expect(async () => {
          expect(await body.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
        }).toPass()

        // Index 1 — Friday is always the 2nd of the 3 known dates.
        await page.getByLabel('Date').selectOption({ index: 1 })

        expect(await body.evaluate((el) => el.scrollLeft)).toBe(0)
        expect(
          await page.locator('[class*="headerWrapper"]').evaluate((el) => el.scrollLeft),
        ).toBe(0)
      })
    })
  }
})
