import { useState } from 'react'
import { Link } from 'react-router-dom'
import { clearAllStorage } from '../lib/appStorage'
import { PageHeader } from './PageHeader'

// Reachable from a plain link on the Installation page (see content/*/pages), not
// linked from the nav — a small utility page, not a real destination, so it's
// deliberately excluded from useLastPagePersistence's saved/restored pages (see that
// hook's VALID_HREFS) the same way the /debug routes are. Clearing happens on an
// explicit button click, not automatically on mount — landing on this URL (a stray
// link, back/forward navigation, a service-worker prefetch) shouldn't silently wipe
// settings on its own.
export function ClearStorageAction() {
  const [cleared, setCleared] = useState(false)

  if (cleared) {
    return (
      <>
        <PageHeader title="Clear saved settings" />
        <p>
          Done — your saved date, filters, GCA setting, and last-visited page have all been cleared.
        </p>
        <p>
          <Link to="/">Go home</Link>
        </p>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Clear saved settings" />
      <p>
        This resets your saved date, level filters, GCA setting, and last-visited page back to their
        defaults.
      </p>
      <button
        type="button"
        onClick={() => {
          clearAllStorage()
          setCleared(true)
        }}
      >
        Clear saved settings
      </button>
    </>
  )
}
