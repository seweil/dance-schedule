import { clearAllStorage } from './appStorage'

// A single, shared "get me to a known, fresh, current state" action — used by
// every reset entry point in the app: the Help/Installation page's "clear
// saved settings" link (ClearStorageAction.tsx), the Home page footer's
// "Reset" button (ResetHintsLink.tsx), and the /reset route someone can be
// handed directly (ResetAction.tsx). These three used to each mean something
// slightly different (one just cleared localStorage with an inline
// confirmation and no reload, one cleared localStorage and did a plain
// reload, one force-applied a pending app update too) — no real use case
// ever called for that variation, just three call sites that had drifted
// independently, so this is now the one place "reset" is defined. Each call
// site still controls its OWN trigger — an explicit click before running vs.
// running automatically on mount — that distinction is still meaningful (see
// each file's own comment), just not the RESULT of running it.
//
// Always all three steps, in this order:
// 1. Apply any pending service-worker update, so step 3's navigation lands on
//    the latest deployed version's app shell — not whatever was precached
//    when the currently-active worker installed.
// 2. Clear all localStorage (this app's only other client-side persistence).
// 3. A real browser navigation to the app's own root (not react-router's
//    client-side Link) — the state that matters (useAppLaunchCount's launch
//    counter, every first-run hint) is evaluated fresh at mount, which only
//    a real navigation guarantees.

// Mirrors UpdatePrompt.tsx's own skip-waiting + controllerchange dance:
// updateServiceWorker(true)/postMessage({ type: 'SKIP_WAITING' }) sends the
// new worker a skip-waiting message, then waits for the browser's own
// 'controllerchange' event to fire. Safari has a long-standing bug where
// 'controllerchange' doesn't reliably fire after skipWaiting() — this
// fallback is a safety net, not the primary mechanism: in a browser where it
// fires normally, `activated` below has already resolved well before this
// timeout, making it a no-op.
const CONTROLLERCHANGE_FALLBACK_MS = 3_000

// A second, OUTER safety net around the whole applyPendingUpdate() call below
// — confirmed live (macOS Safari, a regular non-private window with an
// already-registered service worker from prior testing): the page got stuck
// showing chrome but no routed content, indefinitely, because
// registration.update()/waitForInstalledWorker() had no timeout of their own
// and never settled once in that state. This bounds the WHOLE update-check
// step, not just its last part, so a reset always proceeds within a few
// seconds no matter which internal step (if any) never settles.
const APPLY_UPDATE_OVERALL_TIMEOUT_MS = 5_000

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

export async function resetAppState(): Promise<void> {
  const timeout = new Promise((resolve) => setTimeout(resolve, APPLY_UPDATE_OVERALL_TIMEOUT_MS))
  await Promise.race([applyPendingUpdate(), timeout])
  clearAllStorage()
  window.location.href = import.meta.env.BASE_URL
}
