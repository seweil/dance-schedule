import { test, expect, devices } from '@playwright/test'

test('renders the home page generated from content/index.md', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /welcome to dance schedule/i })).toBeVisible()
})

test('nav links to a page generated from a content file', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /installation/i }).click()
  await expect(page.getByRole('heading', { name: /installation/i })).toBeVisible()
})

test('clicking an embedded markdown image opens the full-screen lightbox', async ({ page }) => {
  await page.goto('/installation')
  await page.getByAltText(/screenshot of the app/i).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('registers and activates a service worker against the built app', async ({ page }) => {
  await page.goto('/')
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
  await page.goto('/')
  // The page that performs the initial registration is never itself controlled —
  // control only applies to navigations that happen after a worker is active, so
  // wait for activation, then reload to pick up a controller.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: /welcome to dance schedule/i })).toBeVisible()
  await context.setOffline(false)
})

test('desktop nav shows the flat link list with no kebab toggle', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /installation/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /menu/i })).not.toBeVisible()
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
    await page.goto('/installation')
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
    await page.goto('/')
    const toggle = page.getByRole('button', { name: /menu/i })
    const homeLink = page.getByRole('link', { name: /home/i })

    await expect(toggle).toBeVisible()
    await expect(homeLink).not.toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('link', { name: /installation/i })).toBeVisible()

    await page.getByRole('link', { name: /installation/i }).click()
    await expect(page.getByRole('heading', { name: /installation/i })).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
