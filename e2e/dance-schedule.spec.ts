import { test, expect, devices } from '@playwright/test'

test('nav links to the dance schedule page, which renders the default date\'s grid', async ({
  page,
}) => {
  await page.goto('/automated-testing/')
  await page.getByRole('link', { name: /dance schedule/i }).click()
  await expect(page.getByRole('heading', { name: /dance schedule/i })).toBeVisible()
  // At least one room column header renders for the default (earliest) date.
  await expect(page.locator('[class*="roomHeader"]').first()).toBeVisible()
})

test('the redundant "Dancing -" prefix is omitted, and the caller name renders bold', async ({
  page,
}) => {
  await page.goto('/automated-testing/dance-schedule')
  await expect(page.getByRole('heading', { name: /dance schedule/i })).toBeVisible()

  // Thursday (the default date) has real "Dancing"-type sessions — none of their
  // cards should show the literal "Dancing -" prefix.
  await expect(page.getByText('Dancing -')).toHaveCount(0)

  const caller = page.locator('[class*="details"] strong', { hasText: 'Kris Jensen' }).first()
  await expect(caller).toBeVisible()
})

test('a non-"Dancing" event type keeps its plain-text prefix before the bold caller name', async ({
  page,
}) => {
  await page.goto('/automated-testing/dance-schedule')

  await expect(page.getByText('Skirt Work Hour -')).toBeVisible()
  const caller = page.locator('[class*="details"] strong', { hasText: 'Wendy VanderMeulen' }).first()
  await expect(caller).toBeVisible()
})

test('desktop: the panel itself scrolls both directions, unaffected by the mobile split-header behavior', async ({
  page,
}) => {
  await page.goto('/automated-testing/dance-schedule')
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
  await page.goto('/automated-testing/dance-schedule')
  await expect(page.getByText('All Callers Dance')).not.toBeVisible()

  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  await expect(page.getByText('All Callers Dance')).toBeVisible()
})

test('a session spanning multiple rooms renders as one block, not two', async ({ page }) => {
  await page.goto('/automated-testing/dance-schedule')
  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  const spanningCards = page.getByText('All Callers Dance - All Callers')
  await expect(spanningCards).toHaveCount(1)
})

test('a roomless session renders as a full-width banner with its time range', async ({ page }) => {
  await page.goto('/automated-testing/dance-schedule')
  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  await expect(page.getByText('Lunch Break')).toBeVisible()
  await expect(page.getByText('12:00 PM – 1:30 PM')).toBeVisible()
})

test('narrowing the level slider hides out-of-range sessions and their now-empty room column', async ({
  page,
}) => {
  await page.goto('/automated-testing/dance-schedule')
  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  const columnCountBefore = await page.locator('[class*="roomHeader"]').count()

  const minThumb = page.getByRole('slider', { name: /minimum level/i })
  await minThumb.focus()
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('ArrowRight')
  }
  // 7 — "C3B+"'s slot index once combineA1A2 and combineC3BC4 each merge their
  // pair into one stop (see getLevelSlots in src/lib/levelOrder.ts), the last of
  // 8 slots — not 9, which would be C4's index in the raw, uncombined LEVEL_ORDER.
  await expect(minThumb).toHaveAttribute('aria-valuenow', '7')

  // Only C3B/C4 sessions remain — everything else, and any room column that had
  // nothing at that level, disappears.
  const columnCountAfter = await page.locator('[class*="roomHeader"]').count()
  expect(columnCountAfter).toBeLessThan(columnCountBefore)
  await expect(page.getByText('All Callers Dance - All Callers')).not.toBeVisible()
})

test('clicking a level tick label sets the range directly, without using the slider thumbs', async ({
  page,
}) => {
  await page.goto('/automated-testing/dance-schedule')
  const maxThumb = page.getByRole('slider', { name: /maximum level/i })
  // 7 — "C3B+"'s slot index (getLevelSlots merges A1/A2 and C3B/C4 each into one
  // stop when combineA1A2/combineC3BC4 are both true, src/lib/levelOrder.ts): the
  // default range starts at the full SSD-"C3B+" span, 8 slots wide (indices 0-7).
  await expect(maxThumb).toHaveAttribute('aria-valuenow', '7')

  // Clicking a tick close to the current max (but not at either thumb's own
  // position) moves the *nearer* thumb to it — no drag, no keyboard, just a click
  // on the label itself. C3A (index 6) is nearer the max end (distance 1) than the
  // min end (distance 6), so this unambiguously moves the max thumb inward to meet
  // it (see moveNearestThumb's interior-click branch, src/lib/moveNearestThumb.ts).
  await page.getByRole('button', { name: 'C3A', exact: true }).click()

  // 6 — C3A's slot index.
  await expect(maxThumb).toHaveAttribute('aria-valuenow', '6')
})

test('unchecking "Show GCA callers" hides the GCA line without hiding the session', async ({
  page,
}) => {
  await page.goto('/automated-testing/dance-schedule')
  await expect(page.getByText(/^GCA:/).first()).toBeVisible()

  const detailsBefore = await page.locator('[class*="details"]').first().textContent()

  await page.getByLabel(/show gca callers/i).uncheck()

  await expect(page.getByText(/^GCA:/)).toHaveCount(0)
  // The session card's own details (event type/caller) are untouched by the GCA
  // toggle — same text before and after, just the GCA line disappears.
  await expect(page.locator('[class*="details"]').first()).toHaveText(detailsBefore ?? '')
})

test('app shell still renders the dance schedule page when offline after the SW takes control', async ({
  page,
  context,
}) => {
  await page.goto('/automated-testing/dance-schedule')
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
        await page.goto('/automated-testing/dance-schedule')
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

      test('heading and filters scroll out of view as the page scrolls down', async ({ page }) => {
        await page.goto('/automated-testing/dance-schedule')
        // Not the nav link — on mobile it's inside PageMenu.tsx's still-closed kebab
        // menu, so it's never visible without toggling it first. The page's own
        // heading is the always-visible mobile equivalent.
        const heading = page.getByRole('heading', { name: /dance schedule/i })
        const dateSelect = page.getByLabel('Date')
        await expect(heading).toBeVisible()
        await expect(dateSelect).toBeVisible()

        await page.evaluate(() => window.scrollBy(0, 400))

        // Fully above the viewport's top edge — not just "not intersecting the
        // pointer," genuinely scrolled out of view.
        const headingBox = await heading.boundingBox()
        const dateBox = await dateSelect.boundingBox()
        expect((headingBox?.y ?? 0) + (headingBox?.height ?? 0)).toBeLessThanOrEqual(0)
        expect((dateBox?.y ?? 0) + (dateBox?.height ?? 0)).toBeLessThanOrEqual(0)
      })

      test('grid spans the full viewport width with no left/right inset', async ({ page }) => {
        await page.goto('/automated-testing/dance-schedule')
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
        await page.goto('/automated-testing/dance-schedule')
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

      test('scrolling the grid body horizontally leaves heading and filters in place', async ({
        page,
      }) => {
        await page.goto('/automated-testing/dance-schedule')
        const heading = page.getByRole('heading', { name: /dance schedule/i })
        const dateSelect = page.getByLabel('Date')
        const [headingBoxBefore, dateBoxBefore] = await Promise.all([
          heading.boundingBox(),
          dateSelect.boundingBox(),
        ])

        const body = page.locator('[class*="bodyWrapper"]')
        await body.evaluate((el) => {
          el.scrollLeft = 300
        })

        const [headingBoxAfter, dateBoxAfter] = await Promise.all([
          heading.boundingBox(),
          dateSelect.boundingBox(),
        ])
        expect(headingBoxAfter?.x).toBe(headingBoxBefore?.x)
        expect(dateBoxAfter?.x).toBe(dateBoxBefore?.x)
      })

      test('scrolling the grid body horizontally mirrors onto the header (room names track their column)', async ({
        page,
      }) => {
        await page.goto('/automated-testing/dance-schedule')
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
        await page.goto('/automated-testing/dance-schedule')
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
