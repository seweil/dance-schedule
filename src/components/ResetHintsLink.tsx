import styles from './ResetHintsLink.module.css'

// A quick way to re-trigger the onboarding hints (PageMenu.tsx's kebab-menu
// hint, DanceScheduleFilters.tsx's level-slider hint) without manually poking
// localStorage — added specifically to make hands-on testing/tuning of those
// hints fast, since they only show during a device's first few launches
// (useFirstLaunchHint.ts) and, once dismissed, never reappear on their own.
// Hardcodes the same two hint ids used elsewhere in the app
// (`useFirstLaunchHint('kebab-menu')` in PageMenu.tsx, `useFirstLaunchHint(
// 'level-slider')` in DanceScheduleFilters.tsx) rather than a registry —
// there are exactly two hints in the app today. A real page reload (not a
// client-side navigation) is
// required, not just a courtesy — useAppLaunchCount.ts's own increment only
// runs once, in a lazy useState initializer at mount, so a route change alone
// wouldn't pick up the just-cleared count the way a fresh mount does.
export function ResetHintsLink() {
  return (
    <button
      type="button"
      className={styles.resetLink}
      onClick={() => {
        localStorage.removeItem('dance-schedule:launch-count')
        localStorage.removeItem('dance-schedule:hint-dismissed:kebab-menu')
        localStorage.removeItem('dance-schedule:hint-dismissed:level-slider')
        window.location.reload()
      }}
    >
      Reset
    </button>
  )
}
