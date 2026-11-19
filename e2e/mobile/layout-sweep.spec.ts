import { test, expect, type Page } from '@playwright/test'

// Runs under the Android projects only (playwright.config.ts): a Pixel 7 and a
// 360px-wide Galaxy S24. Written against whatever phone the project emulates —
// never a fixed size — so it checks the layout at Android widths, which are
// often narrower than the iPhones the app is mostly hand-checked on.
//
// Opens every page of the live event's set, in portrait and landscape, and
// every day of each schedule, and fails on the two most likely Android-width
// bugs: the page scrolling sideways, and a control (a button, select, slider,
// heading or image) cut off at the screen's edge. The schedule grids
// themselves scroll sideways inside their own panel by design, so anything in
// that panel is exempt, as is the nav tab bar, which scrolls on its own too.

const SET = '/MidWinter2027'

async function navHrefs(page: Page): Promise<string[]> {
  await page.goto(`${SET}/`)
  const hrefs = await page
    .locator('nav[aria-label="Site navigation"] a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  const unique = [...new Set(hrefs)].filter(Boolean)
  // Guards against a selector change silently turning the sweep into a no-op.
  expect(unique.length, 'nav links found').toBeGreaterThanOrEqual(10)
  return unique
}

// The phone's real screen width. Not window.innerWidth: with mobile emulation,
// as on a real phone, Chrome widens the layout to fit content that overflows —
// measured, a 280px screen reported 556px once one button was 400px wide — so a
// width the page reports about itself can never show the page as too wide.
function screenWidth(page: Page): number {
  return page.viewportSize()!.width
}

async function expectNoSidewaysPageScroll(page: Page, where: string) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(screenWidth(page))
}

async function expectControlsOnScreen(page: Page, where: string) {
  const offScreen = await page.evaluate((width) => {
    const exempt = '[class*="panelWrapper"], nav'
    const controls = document.querySelectorAll<HTMLElement>(
      'main button, main select, main [role="slider"], main h1, main h2, main img, h1',
    )
    return [...controls]
      .filter((element) => !element.closest(exempt))
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && (box.left < -1 || box.right > width + 1)
      })
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent || element.getAttribute('alt') || '').trim().slice(0, 40)}"`)
  }, screenWidth(page))
  // Guards against the check silently examining nothing (e.g. run before render).
  const examined = await page.locator('main button, main select, main h1, main h2, main img, h1').count()
  expect(examined, `${where}: controls examined`).toBeGreaterThan(0)
  expect(offScreen, `${where}: cut off at the screen edge`).toEqual([])
}

async function checkPage(page: Page, where: string) {
  await expect(page.locator('h1').first()).toBeVisible()
  await expectNoSidewaysPageScroll(page, where)
  await expectControlsOnScreen(page, where)
}

for (const orientation of ['portrait', 'landscape'] as const) {
  test.describe(orientation, () => {
    test.beforeEach(async ({ page }) => {
      if (orientation === 'landscape') {
        const { width, height } = page.viewportSize()!
        await page.setViewportSize({ width: height, height: width })
      }
    })

    test('every page fits the screen', async ({ page }) => {
      for (const href of await navHrefs(page)) {
        await page.goto(href)
        await checkPage(page, href)
      }
    })

    for (const route of ['dance-schedule', 'room-schedule', 'caller-schedule']) {
      test(`every day of ${route} fits the screen`, async ({ page }) => {
        await page.goto(`${SET}/${route}`)
        const days = await page.getByLabel('Date').locator('option').count()
        for (let day = 0; day < days; day++) {
          await page.getByLabel('Date').selectOption({ index: day })
          await checkPage(page, `${route}, day ${day + 1}`)
        }
      })
    }
  })
}
