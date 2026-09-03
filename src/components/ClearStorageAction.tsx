import { useState } from 'react'
import { resetAppState } from '../lib/resetAppState'
import { PageHeader } from './PageHeader'
import styles from './ClearStorageAction.module.css'

// Reachable from a plain link on the Installation/Help page, not linked from
// the nav — a small utility page, not a real destination, so it's
// deliberately excluded from useLastPagePersistence's saved/restored pages
// (see that hook's VALID_HREFS) the same way the /debug routes are.
// Resetting happens on an explicit button click, not automatically on mount
// — landing on this URL (a stray link, back/forward navigation, a
// service-worker prefetch) shouldn't silently wipe someone's state on its
// own.
//
// Runs the same resetAppState() as ResetHintsLink.tsx/ResetAction.tsx — see
// that module's own comment for what "reset" means now. The button stays
// disabled (rather than the page just navigating away instantly) since
// resetAppState() can take a few seconds if it's also applying a pending app
// update — without this, a click that seems to do nothing for a moment could
// read as broken.
export function ClearStorageAction() {
  const [resetting, setResetting] = useState(false)

  return (
    <>
      <PageHeader title="Clear saved settings" />
      <p>
        Resets your saved date, level filters, GCA setting, and last-visited page back to their
        defaults, and makes sure you're on the current version of the app.
      </p>
      <button
        type="button"
        className={styles.button}
        disabled={resetting}
        onClick={() => {
          setResetting(true)
          void resetAppState()
        }}
      >
        {resetting ? 'Resetting…' : 'Clear saved settings'}
      </button>
    </>
  )
}
