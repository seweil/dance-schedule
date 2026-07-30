import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './UpdatePrompt.module.css'

// Without this, an already-open tab only checks for a new service worker on its
// next navigation/registration — so a deployed update goes undetected until the
// user manually reloads. Polling registration.update() surfaces the "new version
// available" prompt on its own; the user still has to click Reload to apply it
// (per CLAUDE.md: never swap content out from under them silently).
const UPDATE_CHECK_INTERVAL_MS = 60_000

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
        void registration.update()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  if (!needRefresh) {
    return null
  }

  return (
    <div role="alert" className={styles.banner}>
      <p className={styles.message}>A new version is available.</p>
      <button type="button" className={styles.button} onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  )
}
