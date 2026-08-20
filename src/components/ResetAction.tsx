import { useEffect } from 'react'
import { clearAllStorage } from '../lib/appStorage'

// Mirrors UpdatePrompt.tsx's own skip-waiting + controllerchange dance, right
// down to the same Safari-doesn't-reliably-fire-controllerchange fallback
// timeout — just triggered automatically here instead of behind a "Reload"
// click. Landing on /reset already IS the explicit "give me a completely
// fresh state" signal that UpdatePrompt.tsx's own banner click normally
// supplies, so silently applying a pending update here isn't the
// silent-content-swap CLAUDE.md warns against elsewhere — it's the whole
// point of this route. Without this, someone using /reset to demo the
// first-run experience could land on a stale precached shell and then get
// interrupted by "A new version is available" mid-demo, or need a second
// manual reload to actually pick it up.
const CONTROLLERCHANGE_FALLBACK_MS = 3_000

// Waits for a currently-installing worker (if any) to finish installing, so
// registration.waiting is populated before we check it — registration.update()
// only resolves once the update *check* completes, not once a found update has
// finished downloading and installing.
function waitForInstalledWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  if (registration.waiting) {
    return Promise.resolve(registration.waiting)
  }
  const installing = registration.installing
  if (!installing) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    installing.addEventListener('statechange', function onStateChange() {
      if (installing.state === 'installed' || installing.state === 'redundant') {
        installing.removeEventListener('statechange', onStateChange)
        resolve(registration.waiting)
      }
    })
  })
}

// Posts the same { type: 'SKIP_WAITING' } message the generated service
// worker's own listener expects (vite.config.ts's workbox config; also what
// workbox-window's messageSkipWaiting() sends under the hood for
// UpdatePrompt.tsx's updateServiceWorker(true)) — activates a waiting worker
// immediately instead of leaving it queued behind the "Reload" banner click.
async function applyPendingUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return
  }
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined)
  if (!registration) {
    return
  }
  await registration.update().catch(() => undefined)
  const waiting = await waitForInstalledWorker(registration)
  if (!waiting) {
    return
  }
  const activated = new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
  })
  waiting.postMessage({ type: 'SKIP_WAITING' })
  await Promise.race([activated, new Promise((resolve) => setTimeout(resolve, CONTROLLERCHANGE_FALLBACK_MS))])
}

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
// the freshly-cleared storage. applyPendingUpdate() runs first so that
// navigation lands on the latest deployed version's app shell, not whatever
// was precached at the time the currently-active service worker installed.
export function ResetAction() {
  useEffect(() => {
    void applyPendingUpdate().finally(() => {
      clearAllStorage()
      window.location.href = import.meta.env.BASE_URL
    })
  }, [])

  return null
}
