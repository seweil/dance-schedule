import { test, expect, devices } from '@playwright/test'

test('renders the home page generated from content/index.md', async ({ page }) => {
  await page.goto('/automated-testing/')
  await expect(page.getByRole('heading', { name: /welcome to montreal mix/i })).toBeVisible()
})

test('nav links to a page generated from a content file', async ({ page }) => {
  await page.goto('/automated-testing/')
  // Scoped to the nav — the home page's own body text also links to
  // Installation, so an unscoped query would match two elements.
  const nav = page.getByRole('navigation', { name: /site navigation/i })
  await nav.getByRole('link', { name: /installation/i }).click()
  await expect(page.getByRole('heading', { name: /installation/i })).toBeVisible()
})

test('clicking an embedded markdown image opens the full-screen lightbox', async ({ page }) => {
  // The FAQ page (not Installation, which has no image) is the one that actually
  // has an embedded image, per its own "tap or click any image" answer.
  await page.goto('/automated-testing/faq')
  await page.getByAltText(/dancer checking the schedule/i).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('registers and activates a service worker against the built app', async ({ page }) => {
  await page.goto('/automated-testing/')
  const hasActiveServiceWorker = await page.evaluate(async () => {
    // .ready resolves once a worker has installed and activated for this scope —
    // checking .getRegistration() right after goto() races the install step.
    const registration = await navigator.serviceWorker.ready
    return Boolean(registration.active)
  })
  expect(hasActiveServiceWorker).toBe(true)
})

test('app shell still renders when offline after the SW takes control', async ({
  page,
  context,
}) => {
  await page.goto('/automated-testing/')
  // The page that performs the initial registration is never itself controlled —
  // control only applies to navigations that happen after a worker is active, so
  // wait for activation, then reload to pick up a controller.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: /welcome to montreal mix/i })).toBeVisible()
  await context.setOffline(false)
})

test('desktop nav shows the flat link list with no kebab toggle', async ({ page }) => {
  await page.goto('/automated-testing/')
  const nav = page.getByRole('navigation', { name: /site navigation/i })
  await expect(nav.getByRole('link', { name: /installation/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /menu/i })).not.toBeVisible()
})

test('nav links to the schedule page, which renders events', async ({ page }) => {
  await page.goto('/automated-testing/')
  // Exact name — "Dance Schedule" is also a nav link, so a bare /schedule/i regex
  // now matches both.
  await page.getByRole('link', { name: 'Event Schedule' }).click()
  await expect(page.getByRole('heading', { name: /schedule/i })).toBeVisible()
  // Asserts structurally (at least one event renders) rather than exact event content,
  // since data/event-schedule.xlsx is live hand-authored content, not a test fixture —
  // coupling assertions to its exact contents would make this brittle to content edits.
  await expect(page.getByRole('listitem').first()).toBeVisible()
})

test('app shell still renders the schedule page when offline after the SW takes control', async ({
  page,
  context,
}) => {
  await page.goto('/automated-testing/event-schedule')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: /schedule/i })).toBeVisible()
  await expect(page.getByRole('listitem').first()).toBeVisible()
  await context.setOffline(false)
})

test('schedule cards lay out as columns without horizontal overflow on a narrow landscape window', async ({
  page,
}) => {
  // A narrow-but-wider-than-tall window (e.g. a small resized desktop browser) still
  // matches `orientation: landscape` — this is deliberately narrow to catch the same
  // overflow risk a fixed-width column floor would reintroduce.
  await page.setViewportSize({ width: 500, height: 300 })
  await page.goto('/automated-testing/event-schedule')
  // Not getByRole('listitem').first() — the list's first item is now a date
  // heading (ScheduleList.tsx interleaves one per date), not an event card.
  const firstCard = page.locator('[class*="card"]').first()
  await expect(firstCard).toBeVisible()

  expect(await page.evaluate(() => window.matchMedia('(orientation: landscape)').matches)).toBe(
    true,
  )
  expect(await firstCard.evaluate((el) => getComputedStyle(el).display)).toBe('grid')

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})

test.describe('mobile viewport', () => {
  // Playwright forbids setting defaultBrowserType inside a describe block (it would
  // force a new worker), so pick the viewport/UA/touch fields out of the preset
  // rather than spreading it whole — this project only runs the chromium project.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13']
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })

  test('renders content and nav without horizontal overflow on a small screen', async ({
    page,
  }) => {
    await page.goto('/automated-testing/installation')
    await expect(page.getByRole('heading', { name: /installation/i })).toBeVisible()
    await page.getByRole('button', { name: /menu/i }).click()
    await expect(page.getByRole('link', { name: /home/i })).toBeVisible()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('kebab menu hides the link list until toggled, and closes after navigating', async ({
    page,
  }) => {
    await page.goto('/automated-testing/')
    // Scoped to the nav — the home page's own body text also links to
    // Installation, so an unscoped query would match two elements.
    const nav = page.getByRole('navigation', { name: /site navigation/i })
    const toggle = page.getByRole('button', { name: /menu/i })
    const homeLink = nav.getByRole('link', { name: /home/i })

    await expect(toggle).toBeVisible()
    await expect(homeLink).not.toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(nav.getByRole('link', { name: /installation/i })).toBeVisible()

    await nav.getByRole('link', { name: /installation/i }).click()
    await expect(page.getByRole('heading', { name: /installation/i })).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  test('schedule reflows to a single column without horizontal overflow on a small screen', async ({
    page,
  }) => {
    await page.goto('/automated-testing/event-schedule')
    await expect(page.getByRole('heading', { name: /schedule/i })).toBeVisible()
    await expect(page.getByRole('listitem').first()).toBeVisible()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})
