import { test, expect } from '@playwright/test'

// Level-columns counterpart of e2e/room-schedule.spec.ts's filter-behavior tests —
// same underlying automated-testing fixture and filter wiring (useDanceScheduleFilters
// + DanceScheduleFilters are shared, byte-identical, across all three dance-schedule
// pages — see docs/design/dance-schedule.md), so this deliberately trims down to the
// filter-facing subset rather than re-covering every case (multi-room rendering,
// mobile viewport, offline/PWA shell, etc.) that's already exercised there and isn't
// page-specific.

test('nav links to the dancing-by-level page, which renders the default date\'s grid', async ({
  page,
}) => {
  await page.goto('/automated-testing/')
  await page.getByRole('link', { name: /dancing by level/i }).click()
  await expect(page.getByRole('heading', { name: /dancing by level/i })).toBeVisible()
  // At least one level-column header renders for the default (earliest) date —
  // "roomHeader" is the literal, shared CSS class every column header uses in all
  // three grids, whatever the column actually represents.
  await expect(page.locator('[class*="roomHeader"]').first()).toBeVisible()
})

test('changing the date select swaps the grid to that date', async ({ page }) => {
  await page.goto('/automated-testing/dancing-by-level')
  await expect(page.getByText('All Callers Dance')).not.toBeVisible()

  // Index 1 (not a hardcoded label) — Friday is always the 2nd of the 3 known dates,
  // regardless of the exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 1 })

  await expect(page.getByText('All Callers Dance')).toBeVisible()
})

test('narrowing the level slider hides out-of-range sessions and their now-empty level column', async ({
  page,
}) => {
  await page.goto('/automated-testing/dancing-by-level')
  // Index 1 — Friday is always the 2nd of the 3 known dates.
  await page.getByLabel('Date').selectOption({ index: 1 })

  const columnCountBefore = await page.locator('[class*="roomHeader"]').count()

  const minThumb = page.getByRole('slider', { name: /minimum level/i })
  await minThumb.focus()
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('ArrowRight')
  }
  // 7 — "C3B+"'s slot index once combineA1A2 and combineC3BC4 each merge their pair
  // into one stop (see getLevelSlots in src/lib/levelOrder.ts), the last of 8 slots.
  await expect(minThumb).toHaveAttribute('aria-valuenow', '7')

  // Columns here ARE the filter's own range (filter-derived, not data-derived — see
  // docs/design/dance-schedule.md's "Level-columns view" decision), so narrowing
  // directly shrinks the column count, and the SSD-level session from before no
  // longer renders anywhere.
  const columnCountAfter = await page.locator('[class*="roomHeader"]').count()
  expect(columnCountAfter).toBeLessThan(columnCountBefore)
  await expect(page.getByText('All Callers Dance')).not.toBeVisible()
})

test('unchecking "Show GCA callers" hides the GCA line without hiding the session', async ({
  page,
}) => {
  await page.goto('/automated-testing/dancing-by-level')
  await expect(page.getByText(/^GCA:/).first()).toBeVisible()

  await page.getByLabel(/show gca callers/i).uncheck()

  await expect(page.getByText(/^GCA:/)).toHaveCount(0)
})
