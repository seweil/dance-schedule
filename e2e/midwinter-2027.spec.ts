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

  // Dragging the max thumb all the way down pins the range to phase 1 alone.
  await page.getByRole('slider', { name: 'Maximum phase' }).focus()
  await page.keyboard.press('Home')
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

test('the phase slider is absent at an event with no round dancing', async ({ page }) => {
  await page.goto('/automated-testing/dance-schedule')
  await expect(page.getByRole('slider', { name: 'Minimum level' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Minimum phase' })).toHaveCount(0)
})
