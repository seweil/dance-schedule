import { test, expect } from '@playwright/test'

// Caller-columns counterpart of e2e/room-schedule.spec.ts's filter-behavior tests —
// same underlying automated-testing fixture and filter wiring (useDanceScheduleFilters
// + DanceScheduleFilters are shared, byte-identical, across all three dance-schedule
// pages — see docs/design/dance-schedule.md), so this deliberately trims down to the
// filter-facing subset rather than re-covering every case already exercised there.
//
// Per content/automated-testing/data/dance-schedule-dump.md's "Hours by caller"
// table, Dayle Hodge has zero sessions on Thursday (the default date) but a real
// event-wide total of 4.5h (1.5 Friday + 3 Saturday) — comfortably clearing
// MIN_CALLER_HOURS (> 3), which computeDanceScheduleCallerLayout.ts computes
// event-wide, not per-day (see that file's own comment on why). So she's eligible
// for a column every day, but only actually shows one on a day she has a session
// at all — a real, day-varying fact used below instead of a session the caller
// view would exclude outright (e.g. "All Callers Dance", whose "All Callers"
// caller never clears the threshold on any day, unlike the room/level views
// which show it regardless).

test('nav links to the caller-schedule page, which renders the default date\'s grid', async ({
  page,
}) => {
  await page.goto('/automated-testing/')
  await page.getByRole('link', { name: /caller schedule/i }).click()
  await expect(page.getByRole('heading', { name: /caller schedule/i })).toBeVisible()
  // At least one caller-column header renders for the default (earliest) date —
  // "roomHeader" is the literal, shared CSS class every column header uses in all
  // three grids, whatever the column actually represents.
  await expect(page.locator('[class*="roomHeader"]').first()).toBeVisible()
})

test('changing the date select swaps the grid to that date', async ({ page }) => {
  await page.goto('/automated-testing/caller-schedule')
  // Thursday (the default date) — Dayle Hodge has no sessions at all, so no column
  // even though she's eligible event-wide.
  await expect(page.getByText('Dayle Hodge', { exact: true })).not.toBeVisible()

  // Index 2 — Saturday is always the 3rd of the 3 known dates, regardless of the
  // exact year parseEventDate's year-inference resolves to.
  await page.getByLabel('Date').selectOption({ index: 2 })

  // Dayle Hodge has real sessions on Saturday, so her column now appears — proof
  // the grid actually re-rendered for the new date.
  await expect(page.getByText('Dayle Hodge', { exact: true })).toBeVisible()
})

test('narrowing the level slider hides out-of-range sessions and their now-empty caller column', async ({
  page,
}) => {
  await page.goto('/automated-testing/caller-schedule')
  // .count() doesn't auto-wait like an assertion does — make sure the grid has
  // actually rendered before taking the "before" snapshot.
  await expect(page.locator('[class*="roomHeader"]').first()).toBeVisible()
  const columnCountBefore = await page.locator('[class*="roomHeader"]').count()

  const minThumb = page.getByRole('slider', { name: /minimum level/i })
  await minThumb.focus()
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('ArrowRight')
  }
  // 7 — "C3B+"'s slot index once combineA1A2 and combineC3BC4 each merge their pair
  // into one stop (see getLevelSlots in src/lib/levelOrder.ts), the last of 8 slots.
  await expect(minThumb).toHaveAttribute('aria-valuenow', '7')

  // A caller's column stays eligible day-wide regardless of the level filter (see
  // computeDanceScheduleCallerLayout.ts's MIN_CALLER_HOURS) — but a caller with
  // nothing visible in the narrowed range still loses their column, so narrowing
  // still reduces the count even though eligibility itself doesn't react to it.
  const columnCountAfter = await page.locator('[class*="roomHeader"]').count()
  expect(columnCountAfter).toBeLessThan(columnCountBefore)
})

test('unchecking "Show GCA callers" hides the GCA line without hiding the session', async ({
  page,
}) => {
  await page.goto('/automated-testing/caller-schedule')
  await expect(page.getByText(/^GCA:/).first()).toBeVisible()

  await page.getByLabel(/show gca callers/i).uncheck()

  await expect(page.getByText(/^GCA:/)).toHaveCount(0)
})
