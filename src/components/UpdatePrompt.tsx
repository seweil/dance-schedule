import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './UpdatePrompt.module.css'

// Without this, an already-open tab only checks for a new service worker on its
// next navigation/registration — so a deployed update goes undetected until the
// user manually reloads. Polling registration.update() surfaces the "new version
// available" prompt on its own; the user still has to click Reload to apply it
// (per CLAUDE.md: never swap content out from under them silently).
const UPDATE_CHECK_INTERVAL_MS = 60_000

// updateServiceWorker(true) sends the new worker a skip-waiting message, then
// waits for the browser's own 'controllerchange' event to actually reload the
// page — that event is what Chrome/Firefox fire once the new worker takes
// over. Reported live (deployed site, macOS Safari): clicking Reload did
// nothing visible at all, no reload, banner still up — Safari has a
// long-standing bug where 'controllerchange' doesn't reliably fire after
// skipWaiting(), so the reload this whole flow depends on simply never
// happens there, even though the skip-waiting message itself went through
// fine. This timeout is a safety net, not the primary mechanism: in a
// browser where 'controllerchange' fires normally, the page has already
// reloaded well before this fires, making it a no-op; it only matters on
// Safari, where nothing else would ever trigger the reload at all.
const RELOAD_FALLBACK_MS = 3_000

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) {
        return
      }
      setInterval(() => {
        // Confirmed live via RUM (macOS Safari, real production traffic): a
        // bare, unguarded registration.update() surfaced as
        // InvalidStateError: "newestWorker is null" — a known WebKit quirk,
        // update() rejecting (or occasionally throwing synchronously) in
        // certain internal states, unrelated to anything this app does.
        // Every 60s on every open Safari tab means this was a real,
        // ongoing, previously-invisible source of noise. A failed
        // background update check isn't worth surfacing as an error either
        // way — the next scheduled check 60s later just tries again — so
        // both the sync-throw and rejected-promise cases are swallowed
        // here, matching ResetAction.tsx's own applyPendingUpdate(), which
        // already guards its own registration.update() call the same way.
        try {
          void registration.update().catch(() => undefined)
        } catch {
          // Ignored — see comment above.
        }
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  if (!needRefresh) {
    return null
  }

  function handleReload() {
    void updateServiceWorker(true)
    setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS)
  }

  return (
    <div role="alert" className={styles.banner}>
      <p className={styles.message}>A new version is available</p>
      <button type="button" className={styles.button} onClick={handleReload}>
        Reload
      </button>
    </div>
  )
}
