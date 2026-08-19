import { clearAllStorage } from '../lib/appStorage'
import styles from './ResetHintsLink.module.css'

// A quick way to replay the onboarding hints (PageMenu.tsx's kebab-menu
// hint, DanceScheduleFilters.tsx's level-slider hint, FirstRunTextSizePrompt.tsx's
// text-size prompt) from a clean slate without manually poking localStorage —
// added specifically to make hands-on testing/tuning of those hints fast,
// since they only show during a device's first few launches
// (useFirstLaunchHint.ts) and, once dismissed, never reappear on their own.
//
// Uses the same clearAllStorage() as the Installation page's "Clear saved
// settings" (ClearStorageAction.tsx) — per direct product decision, the two
// should reset everything and have identical semantics, rather than this
// button hand-picking a narrower list of just the hint-related keys. An
// earlier version did exactly that (launch-count + each hint's own
// dismissed flag), then grew a one-off addition for the text-size
// preference too once that stayed stale across a reset and made the
// first-run prompt confusing to replay — at that point duplicating (and
// now already having drifted from) ClearStorageAction's own "reset
// everything" definition stopped making sense to maintain separately.
//
// Still reloads the page afterward (ClearStorageAction does not, in favor
// of its own inline confirmation message) — not just a courtesy here:
// useAppLaunchCount.ts's own increment only runs once, in a lazy useState
// initializer at mount, so a route change alone wouldn't pick up the
// just-cleared count the way a fresh mount does, and this button's whole
// point is to immediately see the replayed hints, not read a confirmation.
export function ResetHintsLink() {
  return (
    <button
      type="button"
      className={styles.resetLink}
      onClick={() => {
        clearAllStorage()
        window.location.reload()
      }}
    >
      Reset
    </button>
  )
}
