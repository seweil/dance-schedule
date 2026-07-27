import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import routes from '~react-pages'
import { readStorageJson, writeStorageJson } from '../lib/appStorage'
import { buildNavTree } from '../lib/buildNavTree'

const STORAGE_KEY = 'dance-schedule:last-page'

// The set of real, resumable destinations — exactly the pages in the nav menu.
// Debug tooling and the "clear saved settings" utility page are reachable but
// deliberately excluded from the nav (see App.tsx), so they're never saved or
// redirected into here either. Also protects against redirecting into a stale saved
// path left over from a page that no longer exists after a content-set change.
const VALID_HREFS = new Set(buildNavTree(routes).map((item) => item.href))

// On a cold launch (the PWA's start_url, "/"), redirects to whichever nav page the
// user was last on — mirrors how installed apps resume where you left off. Only
// checks once, on mount: a later, in-session navigation TO "/" (e.g. clicking Home
// in Nav) must land on Home, not get redirected away from it.
export function useLastPagePersistence(): void {
  const location = useLocation()
  const navigate = useNavigate()
  const isInitialRender = useRef(true)

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      if (location.pathname === '/') {
        const lastPage = readStorageJson<string>(STORAGE_KEY)
        if (lastPage && lastPage !== '/' && VALID_HREFS.has(lastPage)) {
          navigate(lastPage, { replace: true })
          // Skips the save below on purpose — writing "/" here would clobber the
          // saved page we're mid-redirect away from, before the redirect's own
          // pathname change re-fires this effect and saves the real destination.
          return
        }
      }
    }

    if (VALID_HREFS.has(location.pathname)) {
      writeStorageJson(STORAGE_KEY, location.pathname)
    }
  }, [location.pathname, navigate])
}
