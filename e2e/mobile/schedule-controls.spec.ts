import { test, expect, type Locator, type Page } from '@playwright/test'

// Runs under the Android projects only (playwright.config.ts) — see
// layout-sweep.spec.ts. The schedule pages' pop-up and overlay controls, each
// checked for fitting on the emulated phone's screen in portrait: the "Show
// more staff" checklist, the page menu with its boxed schedule group, the level
// slider's first-launch hint, the rotate banner and the zoomable venue map.

const SET = '/MidWinter2027'

async function expectWithinScreen(page: Page, locator: Locator, what: string) {
  const box = (await locator.boundingBox())!
  const width = page.viewportSize()!.width
  expect(box.x, `${what} starts off the left edge`).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width, `${what} runs off the right edge`).toBeLessThanOrEqual(width + 1)
}

test('"Show more staff" sits by the date, and its checklist opens under it, fitting the screen', async ({ page }) => {
  await page.goto(`${SET}/caller-schedule`)
  await page.getByLabel('Date').selectOption({ index: 2 })
  const button = page.getByRole('button', { name: /Show more staff/ })
  const date = page.getByLabel('Date')
  const buttonBox = (await button.boundingBox())!
  const dateBox = (await date.boundingBox())!
  // Same line as the date, not wrapped below it.
  expect(Math.abs(buttonBox.y + buttonBox.height / 2 - (dateBox.y + dateBox.height / 2))).toBeLessThan(12)
  await expectWithinScreen(page, button, 'the "Show more staff" button')

  await button.click()
  const panel = page.getByRole('group', { name: 'Callers' }).locator('..')
  await expectWithinScreen(page, panel, 'the checklist')
  expect((await panel.boundingBox())!.y - (buttonBox.y + buttonBox.height)).toBeLessThan(16)
  // Every name fits inside the checklist rather than running past its edge.
  const panelBox = (await panel.boundingBox())!
  for (const label of await panel.locator('label').all()) {
    const box = (await label.boundingBox())!
    expect(box.x + box.width, `"${await label.textContent()}" runs past the checklist`).toBeLessThanOrEqual(
      panelBox.x + panelBox.width + 1,
    )
  }
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('group', { name: 'Callers' })).toBeHidden()
})

test('the page menu opens on screen, with the schedule pages boxed together', async ({ page }) => {
  await page.goto(`${SET}/venue`)
  await page.getByRole('button', { name: /menu/i }).first().click()
  const schedules = page.getByRole('list', { name: 'Schedules' })
  await expect(schedules).toBeVisible()
  await expectWithinScreen(page, schedules, 'the schedule group')
  await expect(schedules.getByRole('link')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(schedules).toBeHidden()
})

test.describe('first launch', () => {
  // Only the hints that come before the slider hint are already seen (see
  // e2e/slider-hint.spec.ts).
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

  test("the level slider's hint fits the screen, just below the slider", async ({ page }) => {
    await page.goto(`${SET}/dance-schedule`)
    const hint = page.getByRole('status').filter({ hasText: 'Tap or drag to filter dance levels' })
    await expect(hint).toBeVisible()
    await expectWithinScreen(page, hint, 'the hint balloon')
    const slider = (await page.getByRole('slider', { name: 'Maximum level' }).boundingBox())!
    expect((await hint.boundingBox())!.y).toBeGreaterThan(slider.y)
  })
})

test('the rotate banner shows on a schedule in portrait, and can be closed', async ({ page }) => {
  await page.goto(`${SET}/room-schedule`)
  const banner = page.getByText('This might look better if you rotate your phone to landscape')
  await expect(banner).toBeVisible()
  await page.getByRole('button', { name: /dismiss|close/i }).first().click()
  await expect(banner).toBeHidden()
})

test('the venue map opens in a lightbox that zooms in', async ({ page }) => {
  await page.goto(`${SET}/venue`)
  await page.getByRole('img', { name: 'Venue map' }).click()
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  await expect(zoomIn).toBeEnabled()
  await zoomIn.click()
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeEnabled()

  // Zoomed in, the map covers the screen, and the close button still works.
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(zoomIn).toBeHidden()
})

test('the image viewer closes on a swipe down or a tap on the backdrop, not just its close button', async ({
  page,
}) => {
  await page.goto(`${SET}/venue`)
  const map = page.getByRole('img', { name: 'Venue map' })
  const close = page.getByRole('button', { name: 'Close' })

  await map.click()
  await expect(close).toBeVisible()
  // The map is taller than wide but still shorter than an upright phone's
  // screen, so there's backdrop below it.
  const viewport = page.viewportSize()!
  await page.mouse.click(viewport.width / 2, viewport.height - 20)
  await expect(close).toBeHidden()

  await map.click()
  await expect(close).toBeVisible()
  await page.mouse.move(viewport.width / 2, viewport.height / 2)
  await page.mouse.down()
  await page.mouse.move(viewport.width / 2, viewport.height / 2 + 200, { steps: 10 })
  await page.mouse.up()
  await expect(close).toBeHidden()
})

test('the image viewer closes when the app goes to the background', async ({ page }) => {
  await page.goto(`${SET}/venue`)
  await page.getByRole('img', { name: 'Venue map' }).click()
  const close = page.getByRole('button', { name: 'Close' })
  await expect(close).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(close).toBeHidden()
})
