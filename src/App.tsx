import { Suspense } from 'react'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import { MDXProvider } from '@mdx-js/react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import routes from '~react-pages'
import { Nav } from './components/Nav'
import { ZoomableImage } from './components/ZoomableImage'
import { normalizeRoutes } from './lib/buildNavTree'

const mdxComponents = { img: ZoomableImage }

// Registered routes must match the clean hrefs buildNavTree computes for the nav
// (order prefixes like "2 " are stripped from the URL, not just the label).
const normalizedRoutes = normalizeRoutes(routes)

function Pages() {
  return useRoutes(normalizedRoutes)
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
      </MDXProvider>
    </BrowserRouter>
  )
}
