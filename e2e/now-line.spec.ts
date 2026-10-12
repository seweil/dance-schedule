import { test, expect, type Page } from '@playwright/test'

const GRID_ROUTES = [
  '/automated-testing/room-schedule',
  '/automated-testing/dance-schedule',
  '/automated-testing/caller-schedule',
]

function parseLabelMinutes(label: string): number {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim())
  if (!match) throw new Error(`Unrecognized time label: ${label}`)
  const hours = (Number(match[1]) % 12) + (match[3]!.toUpperCase() === 'PM' ? 12 : 0)
  return hours * 60 + Number(match[2])
}

// The default date's ISO value (UTC midnight, year inferred at build time — so
// never hardcoded here) plus its first two time labels, read off the real page.
async function readFirstSegment(page: Page, route: string) {
  await page.goto(route)
  const dateIso = await page.getByLabel('Date').inputValue()
  const labels = page.locator('[class*="timeLabel"]')
  await expect(labels.nth(1)).toBeVisible()
  const [first, second] = await Promise.all([labels.nth(0).innerText(), labels.nth(1).innerText()])
  return { dateIso, startMinutes: parseLabelMinutes(first), endMinutes: parseLabelMinutes(second) }
}

// A device-LOCAL time on the schedule's date — the browser and this test process
// share the host's timezone (no timezoneId override in playwright.config.ts), and
// the app compares the device's local wall clock against the schedule.
function localTimeOn(dateIso: string, minutesOfDay: number): Date {
  const date = new Date(dateIso)
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Math.floor(minutesOfDay / 60),
    minutesOfDay % 60,
  )
}

for (const route of GRID_ROUTES) {
  test(`${route}: draws the current-time line between the two surrounding labels`, async ({ page }) => {
    const { dateIso, startMinutes, endMinutes } = await readFirstSegment(page, route)
    const midpoint = (startMinutes + endMinutes) / 2

    await page.clock.install({ time: localTimeOn(dateIso, midpoint) })
    await page.reload()

    const line = page.getByTestId('now-line').locator('div')
    await expect(line).toBeVisible()
    const labels = page.locator('[class*="timeLabel"]')
    const [lineBox, firstBox, secondBox] = await Promise.all([
      line.boundingBox(),
      labels.nth(0).boundingBox(),
      labels.nth(1).boundingBox(),
    ])
    // Each label's top edge is its own time's position on the axis.
    const expectedY = firstBox!.y + (secondBox!.y - firstBox!.y) / 2
    expect(Math.abs(lineBox!.y + lineBox!.height / 2 - expectedY)).toBeLessThan(2)
  })

  test(`${route}: hides only the time label the badge actually covers`, async ({ page }) => {
    const { dateIso, startMinutes } = await readFirstSegment(page, route)

    // Exactly on the first label: the badge sits right over it.
    await page.clock.install({ time: localTimeOn(dateIso, startMinutes) })
    await page.reload()

    await expect(page.getByTestId('now-badge')).toBeVisible()
    const labels = page.locator('[class*="timeLabel"]')
    await expect(labels.nth(0)).toHaveClass(/timeLabelCovered/)
    await expect(labels.nth(1)).not.toHaveClass(/timeLabelCovered/)
  })

  test(`${route}: no current-time line outside the displayed day's range`, async ({ page }) => {
    const { dateIso, startMinutes } = await readFirstSegment(page, route)

    await page.clock.install({ time: localTimeOn(dateIso, startMinutes - 30) })
    await page.reload()

    await expect(page.locator('[class*="timeLabel"]').first()).toBeVisible()
    await expect(page.getByTestId('now-line')).toHaveCount(0)
  })
}
