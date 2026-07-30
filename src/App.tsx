import { Suspense } from 'react'
import { BrowserRouter, Navigate, useRoutes, type RouteObject } from 'react-router-dom'
import { MDXProvider } from '@mdx-js/react'
import routes from '~react-pages'
import { ClearStorageAction } from './components/ClearStorageAction'
import { Nav } from './components/Nav'
import { ScrollToTopButton } from './components/ScrollToTopButton'
import { UpdatePrompt } from './components/UpdatePrompt'
import { ZoomableImage } from './components/ZoomableImage'
import { RawDanceScheduleDebugPage } from './components/RawDanceScheduleDebugPage'
import { useLastPagePersistence } from './hooks/useLastPagePersistence'
import { normalizeRoutes } from './lib/buildNavTree'

const mdxComponents = { img: ZoomableImage }

// Registered routes must match the clean hrefs buildNavTree computes for the nav
// (order prefixes like "2 " are stripped from the URL, not just the label).
const normalizedRoutes = normalizeRoutes(routes)

// Hand-added outside ~react-pages on purpose: Nav derives its menu straight from
// ~react-pages' own routes (src/components/Nav.tsx), so a route added only here is
// reachable but never appears in the nav — debug tooling only, not a real page.
const debugRoutes: RouteObject[] = [
  { path: '/debug', element: <Navigate to="/debug/dance-schedule" replace /> },
  { path: '/debug/dance-schedule', element: <RawDanceScheduleDebugPage /> },
]

// Same "reachable but not in nav" treatment as debugRoutes above, for a different
// reason: this is a one-off utility action (linked from the Installation page), not
// a page worth a permanent nav entry.
const utilityRoutes: RouteObject[] = [{ path: '/clear-storage', element: <ClearStorageAction /> }]

// Without this, any unmatched path (typo, stale link, or — now that every content
// set publishes under its own "/<set>/" prefix, see docs/design/content-sets.md —
// a path that happens to look like another set's name, e.g. "/real/test") rendered
// nothing below the nav instead of a real 404 or a helpful fallback. `to="/"` is
// basename-relative (see BrowserRouter below), so this lands on *this* build's own
// home page, not some other content set's.
const notFoundRoute: RouteObject = { path: '*', element: <Navigate to="/" replace /> }

function Pages() {
  useLastPagePersistence()
  return useRoutes([...normalizedRoutes, ...debugRoutes, ...utilityRoutes, notFoundRoute])
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <MDXProvider components={mdxComponents}>
        <Nav />
        <UpdatePrompt />
        <Suspense fallback={<p>Loading…</p>}>
          <Pages />
        </Suspense>
        <ScrollToTopButton />
      </MDXProvider>
    </BrowserRouter>
  )
}
