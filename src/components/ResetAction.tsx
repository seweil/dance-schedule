import { useEffect } from 'react'
import { clearAllStorage } from '../lib/appStorage'

// Reachable at /reset — unlike ClearStorageAction.tsx's /clear-storage, which
// requires an explicit button click specifically so a stray link/back-forward/
// SW prefetch can't silently wipe someone's settings, this route is meant to
// BE that stray link: a URL you can hand someone else so they land straight
// in a fresh first-run experience, no tap required on their end. Same
// clearAllStorage() + reload as ResetHintsLink.tsx (the nav's own "Reset"
// button) — a hard redirect to home, not just clearAllStorage() alone, since
// useAppLaunchCount.ts's increment only runs once per real page load; landing
// back on "/" via a real browser navigation (not react-router's client-side
// one) is what lets App remount and every first-run hint re-evaluate against
// the freshly-cleared storage.
export function ResetAction() {
  useEffect(() => {
    clearAllStorage()
    window.location.href = import.meta.env.BASE_URL
  }, [])

  return null
}
