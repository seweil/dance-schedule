import { Suspense } from 'react'
import { BrowserRouter, Navigate, useRoutes, type RouteObject } from 'react-router-dom'
import { MDXProvider } from '@mdx-js/react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import routes from '~react-pages'
import { ClearStorageAction } from './components/ClearStorageAction'
import { Nav } from './components/Nav'
import { ScrollToTopButton } from './components/ScrollToTopButton'
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

function Pages() {
  useLastPagePersistence()
  return useRoutes([...normalizedRoutes, ...debugRoutes, ...utilityRoutes])
}

// Without this, an already-open tab only checks for a new service worker on its
// next navigation/registration — so a deployed update goes undetected until the
// user manually reloads. Polling registration.update() surfaces the "new version
// available" prompt on its own; the user still has to click Reload to apply it
// (per CLAUDE.md: never swap content out from under them silently).
const UPDATE_CHECK_INTERVAL_MS = 60_000

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) {
        return
      }
      setInterval(() => {
        void registration.update()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  if (!needRefresh) {
    return null
  }

  return (
    <div role="alert">
      <p>A new version is available.</p>
      <button type="button" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <MDXProvider components={mdxComponents}>
        <Nav />
        <Suspense fallback={<p>Loading…</p>}>
          <Pages />
        </Suspense>
        <UpdatePrompt />
        <ScrollToTopButton />
      </MDXProvider>
    </BrowserRouter>
  )
}
