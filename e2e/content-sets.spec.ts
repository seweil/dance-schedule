import { test, expect } from '@playwright/test'
import { loadTopLevelContentConfig } from '../content-config'

// `pnpm build` publishes every content set under its own "/<set>/" prefix (see
// docs/design/content-sets.md) — these tests exercise that.
//
// `vite preview` correctly rewrites a hard-navigated deep link under a *known*
// set's prefix (e.g. "/test/dance-schedule") to that set's own index.html —
// vite-plugin-content-sets.ts's configurePreviewServer middleware (confirmed
// empirically: e2e/app.spec.ts and e2e/dance-schedule.spec.ts hard-navigate
// straight to deep "/automated-testing/..." routes). The offline test below still
// reaches its deeper route via a genuine in-app client nav-link click rather than a
// hard reload, simply because that's the natural way to land there before flipping
// the network off — not a workaround for any preview-server gap.

test('the "test" content set publishes its own distinct build', async ({ page }) => {
  await page.goto('/test/')
  await expect(page.getByRole('heading', { name: /test content set/i })).toBeVisible()
})

test('the debug page shows which content set built it', async ({ page }) => {
  // Unprefixed root path — vite preview's fallback happens to be correct here,
  // since the root scope *is* the default set's own bundle. Read the expected
  // set name from content/config.yaml rather than hardcoding it — it changes
  // as real events rotate in and out (see docs/design/content-config.md).
  const { defaultContentSet } = loadTopLevelContentConfig(process.cwd())
  await page.goto('/debug/dance-schedule')
  await expect(
    page.getByRole('heading', { name: new RegExp(`dance schedule.*debug.*${defaultContentSet}`, 'i') }),
  ).toBeVisible()
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
