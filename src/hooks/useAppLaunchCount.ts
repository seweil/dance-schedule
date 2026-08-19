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

// Module-level, not component state: React StrictMode (src/main.tsx)
// deliberately invokes a useState lazy initializer TWICE per real mount, in
// development only, specifically to help surface impure code — confirmed
// live, this really does persist two separate increments (launch count
// jumps by 2, not 1, on a single dev-mode page load), since the initializer
// below writes to localStorage as a side effect and that write isn't
// idempotent on its own. That silently broke ResetHintsLink.tsx for the
// text-size hint specifically (useFirstLaunchHint('text-size', 1) has no
// slack for an inflated count the way the other two hints' maxLaunches: 3
// does). A per-component ref can't guard against this: StrictMode's
// double-invoke reruns the ENTIRE component function body, including a
// ref's own creation, so nothing inside the component can tell invocation
// #1 apart from #2. This flag lives at module scope instead — the module
// itself is only ever evaluated once per real page load (a browser reload
// creates an entirely fresh module registry; StrictMode's double-invoke
// happens WITHIN that one load, before the module could reload) — so the
// second invocation sees this already flipped and skips incrementing again.
let hasIncrementedThisLoad = false

// Test-only: Vitest doesn't reload this module between `it()` blocks in the
// same file the way a real page load does, so each test needs its own fresh
// "page load." Not used by any app code.
export function resetLaunchCountGuardForTests() {
  hasIncrementedThisLoad = false
}

// Called once, from App.tsx — increments a persisted "how many times has this
// browser opened the app" counter exactly once per real page load (a fresh
// tab, refresh, or PWA launch), not once per in-app route navigation, since
// the increment happens in the lazy useState initializer below (runs once per
// mount, modulo the StrictMode double-invoke guarded against above) rather
// than an effect. Any component that needs the CURRENT count for its own
// purposes (useFirstLaunchHint.ts, deciding whether a new user is still
// within their first few launches) reads the same storage key directly
// instead of relying on this hook's return value or a Context — the count
// doesn't change again for the rest of the session after this one increment.
export function useAppLaunchCount(): number {
  const [count] = useState(() => {
    if (hasIncrementedThisLoad) {
      return resolveStoredLaunchCount()
    }
    hasIncrementedThisLoad = true
    const next = resolveStoredLaunchCount() + 1
    writeStorageJson(STORAGE_KEY, next)
    return next
  })

  return count
}
