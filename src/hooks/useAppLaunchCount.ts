import { useState } from 'react'
import { readStorageJson, writeStorageJson } from '../lib/appStorage'

// Unscoped — not namespaced by BASE_URL the way useLastPagePersistence.ts's key
// is — since "how many times has this person opened the app" is a property of
// the device/browser, not of which content set/event they happen to be
// viewing right now. See docs/design/onboarding-hints.md.
const STORAGE_KEY = 'dance-schedule:launch-count'

function resolveStoredLaunchCount(): number {
  const stored = readStorageJson<number>(STORAGE_KEY)
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : 0
}

// Called once, from App.tsx — increments a persisted "how many times has this
// browser opened the app" counter exactly once per real page load (a fresh
// tab, refresh, or PWA launch), not once per in-app route navigation, since
// the increment happens in the lazy useState initializer below (runs once per
// mount) rather than an effect. Any component that needs the CURRENT count
// for its own purposes (useFirstLaunchHint.ts, deciding whether a new user is
// still within their first few launches) reads the same storage key directly
// instead of relying on this hook's return value or a Context — the count
// doesn't change again for the rest of the session after this one increment.
export function useAppLaunchCount(): number {
  const [count] = useState(() => {
    const next = resolveStoredLaunchCount() + 1
    writeStorageJson(STORAGE_KEY, next)
    return next
  })

  return count
}
