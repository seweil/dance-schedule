import { test, expect, type Page } from '@playwright/test'

// The MidWinter2027-only features against that set's real build: round-dance
// phases (second slider, phase columns), cuers on cards, MS Ext, Challenge in the
// Advanced slot, and the featured-staff-only Caller Schedule. Unlike the other
// specs, this asserts against a real event's data (content/MidWinter2027, parsed
// from the organizer's published PDF) rather than the automated-testing fixture,
// which is an xlsx room grid that can't express phases or cuers. Expect to update
// it if the organizer republishes the PDF, and to retire it after the event. See
// docs/design/midwinter-festival-2027.md.

const SET = '/MidWinter2027'

// The four dates are Thursday (the pre-event dance), Friday, Saturday, Sunday.
async function selectSaturday(page: Page) {
  await page.getByLabel('Date').selectOption({ index: 2 })
}

function columnHeaders(page: Page) {
  // "roomHeader" is the shared CSS class every column header uses in all three
  // grids, whatever the column represents.
  return page.locator('[class*="roomHeader"]')
}

test('opens on Friday, past the one-session Thursday, which names its one level instead of a slider', async ({
  page,
}) => {
  await page.goto(`${SET}/dance-schedule`)
  await expect(page.getByLabel('Date')).toHaveValue('2027-01-29T00:00:00.000Z')
  await expect(page.getByRole('slider', { name: 'Minimum level' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Minimum phase' })).toBeVisible()

  await page.getByLabel('Date').selectOption({ index: 0 })
  await expect(page.getByText('Only MS Ext this day')).toBeVisible()
  await expect(page.getByRole('slider')).toHaveCount(0)
})

test('the level slider shows MS Ext and folds Challenge into the Advanced stop', async ({ page }) => {
  await page.goto(`${SET}/dance-schedule`)
  await selectSaturday(page)
  await expect(page.getByRole('button', { name: 'MS Ext' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'A2/C1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'C1', exact: true })).toHaveCount(0)
})

test('the Dance Schedule gets a phase slider and phase columns, with each teach under the phase below it', async ({
  page,
}) => {
  await page.goto(`${SET}/dance-schedule`)
  await selectSaturday(page)
  await expect(page.getByRole('slider', { name: 'Minimum phase' })).toBeVisible()
  // Saturday's teaches: Ph 2 (for phase 1) and Ph 5 (for phase 4).
  await expect(columnHeaders(page).filter({ hasText: /^Ph 1$/ })).toBeVisible()
  await expect(columnHeaders(page).filter({ hasText: /^Ph 4$/ })).toBeVisible()
  await expect(page.getByText('Teach Ph 5 -')).toBeVisible()

  // Stepping the max thumb all the way down pins the range to phase 1 alone. Not
  // Home: Radix's Home always moves the FIRST thumb to the minimum, whichever
  // thumb has focus, so on the max thumb it's a no-op here.
  const maxThumb = page.getByRole('slider', { name: 'Maximum phase' })
  await maxThumb.focus()
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowLeft')
  }
  await expect(maxThumb).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByText('Teach Ph 2 -')).toBeVisible()
  await expect(page.getByText('Teach Ph 5 -')).toHaveCount(0)
  // Square dancing is untouched by the phase slider.
  await expect(page.getByText('Challenge -')).toBeVisible()
})

test('a round session bolds its cuer, and a square session shows its cuer on its own line', async ({ page }) => {
  await page.goto(`${SET}/room-schedule`)
  await selectSaturday(page)
  await expect(page.locator('strong', { hasText: 'Pam & Jeff Johnson' }).first()).toBeVisible()
  await expect(page.getByText('Cuer: Judy Russell').first()).toBeVisible()
})

test('the Caller Schedule shows only the featured staff, cuers included', async ({ page }) => {
  await page.goto(`${SET}/caller-schedule`)
  await selectSaturday(page)
  await expect(columnHeaders(page)).toHaveText(['Ted Lizotte', 'Pam & Jeff Johnson', 'Trevor DeWitt'])
  // A Ted Lizotte session cued by Pam & Jeff lands in both columns, each naming
  // the other.
  await expect(page.getByText('Cuer: Pam & Jeff Johnson').first()).toBeVisible()
  await expect(page.getByText('Caller: Ted Lizotte').first()).toBeVisible()
})

test('the staff page is "Staff Schedule" at an event with round dancing, "Caller Schedule" at a square-only one', async ({
  page,
}) => {
  await page.goto(`${SET}/caller-schedule`)
  await expect(page.getByRole('heading', { level: 1, name: 'Staff Schedule' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Staff Schedule', exact: true })).toBeVisible()

  await page.goto('/automated-testing/caller-schedule')
  await expect(page.getByRole('heading', { level: 1, name: 'Caller Schedule' })).toBeVisible()
})

test('the venue page names both off-site hotels, reachable from the nav', async ({ page }) => {
  await page.goto(`${SET}/`)
  await page.getByRole('link', { name: 'Venue', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Venue' })).toBeVisible()
  await expect(page.getByText('Holiday Inn Express, 105 Opal Ct NE')).toBeVisible()
  await expect(page.getByText('Comfort Suites, 100 Opal Ct NE')).toBeVisible()
})

test("an organizer's email link carries no app diagnostics; the app's own help link does", async ({ page }) => {
  await page.goto(`${SET}/contacts`)
  await expect(page.getByRole('link', { name: 'davison.brooke.77@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:davison.brooke.77@gmail.com',
  )
  await page.goto(`${SET}/help`)
  await expect(page.getByRole('link', { name: 'Email us' })).toHaveAttribute('href', /^mailto:help@sqdance\.app\?body=/)
})

test('the venue map still loads offline after the SW takes control', async ({ page, context }) => {
  await page.goto(`${SET}/`)
  // Same register → reload → controlled sequence as app.spec.ts's offline test.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  await page.goto(`${SET}/venue`)
  const map = page.getByRole('img', { name: 'Linn County Fairgrounds layout' })
  await expect(map).toBeVisible()
  // A broken image is still "visible"; naturalWidth is 0 unless it actually loaded.
  await expect.poll(() => map.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await context.setOffline(false)
})

test('the phase slider is absent at an event with no round dancing', async ({ page }) => {
  await page.goto('/automated-testing/dance-schedule')
  await expect(page.getByRole('slider', { name: 'Minimum level' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Minimum phase' })).toHaveCount(0)
})
