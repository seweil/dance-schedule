import { test, expect } from '@playwright/test'

// A tab still running a previous build lazy-loads a route chunk that a newer
// deploy has since deleted. Simulated by aborting that chunk's first request;
// src/lib/staleChunkReload.ts should reload the page once and the route should
// then render. Service workers blocked: an SW-controlled tab serves the old
// chunk from its precache, so this only ever bites a non-SW-controlled tab.
test.use({ serviceWorkers: 'block' })

test('reloads once and recovers when a route chunk fails to load', async ({ page }) => {
  await page.goto('/automated-testing/')
  await expect(page.getByRole('heading', { name: /welcome to montreal mix/i })).toBeVisible()

  let aborted = 0
  await page.route(
    (url) => /dance-schedule-[^/]*\.js$/.test(decodeURIComponent(url.pathname)),
    async (route) => {
      if (aborted++ === 0) return route.abort()
      return route.continue()
    },
  )

  let loads = 0
  page.on('load', () => loads++)

  await page.getByRole('link', { name: 'Dance Schedule' }).first().click()

  await expect(page.getByRole('heading', { name: /dance schedule/i })).toBeVisible()
  expect(aborted).toBeGreaterThanOrEqual(2)
  expect(loads).toBe(1)
  await expect(page).toHaveURL(/\/automated-testing\/dance-schedule$/)
})
