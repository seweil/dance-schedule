import { test, expect } from '@playwright/test'

// `pnpm build` publishes every content set under its own "/<set>/" prefix (see
// docs/design/content-sets.md) — these tests exercise that.
//
// `vite preview` has no per-prefix SPA-fallback rewrite (confirmed empirically: it
// always falls back to the *root*/default bundle for any unmatched path — correct
// only when the root scope itself is what's being tested; only Amplify would have a
// per-prefix rewrite in production, see docs/design/hosting.md). So these tests
// deliberately avoid hard-navigating to a deep, non-physical route under a "/<set>/"
// prefix while online — they either stay at a real on-disk index.html
// (`/`, `/automated-testing/`, `/test/`), reach a deeper route via genuine in-app client
// navigation (a nav link click) once the correct bundle is already loaded, or — for
// the offline test — rely on the "test" set's own already-active, same-scoped
// service worker intercepting the request before it ever reaches the (buggy, for
// this purpose) preview server.

test('the "test" content set publishes its own distinct build', async ({ page }) => {
  await page.goto('/test/')
  await expect(page.getByRole('heading', { name: /test content set/i })).toBeVisible()
})

test('the debug page lists every published content set, linking to its own home page', async ({
  page,
}) => {
  // Unprefixed root path — vite preview's fallback happens to be correct here,
  // since the root scope *is* the default set's own bundle.
  await page.goto('/debug/dance-schedule')
  await expect(
    page.getByRole('heading', { name: /dance schedule.*debug.*automated-testing/i }),
  ).toBeVisible()

  // Links to that set's home page, not its own copy of this debug page — a deep
  // link into another set's inner routes needs a per-content-set Amplify rewrite
  // rule that's easy to forget for a brand-new set (see docs/design/hosting.md),
  // while the home page is a literal static file that always resolves.
  const testLink = page.getByRole('link', { name: /^test/ })
  await expect(testLink).toBeVisible()
  await expect(testLink).toHaveAttribute('href', '/test/')
})

test('app shell still renders the "test" set\'s own content when offline after its own SW takes control', async ({
  page,
  context,
}) => {
  await page.goto('/test/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  // Reach a deeper route via a real in-app nav click (client-side routing, not a
  // hard navigation) — avoids the vite-preview fallback gap described above.
  await page.getByRole('link', { name: /dance schedule/i }).click()
  await expect(page).toHaveURL(/\/test\/dance-schedule$/)
  await expect(page.getByRole('heading', { name: /dance schedule/i })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  // Confirms navigateFallback resolves to /test/index.html (this set's own scope),
  // not the default set's root index.html, once offline — see
  // docs/design/content-sets.md. The already-active, same-scoped SW intercepts this
  // reload before it reaches the preview server, so it's unaffected by that
  // server's lack of per-prefix fallback.
  await expect(page.getByRole('heading', { name: /dance schedule/i })).toBeVisible()
  await context.setOffline(false)
})
