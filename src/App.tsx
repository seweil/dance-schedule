import { Suspense } from 'react'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import { MDXProvider } from '@mdx-js/react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import routes from '~react-pages'
import { Nav } from './components/Nav'
import { ZoomableImage } from './components/ZoomableImage'

const mdxComponents = { img: ZoomableImage }

function Pages() {
  return useRoutes(routes)
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

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
