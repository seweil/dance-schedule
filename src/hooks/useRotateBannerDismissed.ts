import { useState } from 'react'
import { loadRotateBannerDismissed, saveRotateBannerDismissed } from '../lib/rotateBannerDismissalStorage'

export interface UseRotateBannerDismissedResult {
  dismissed: boolean
  dismiss: () => void
}

// Dismissing RotateDeviceBanner.tsx sticks across the three dance-schedule
// pages — same persisted-key-shared-across-pages pattern
// useDanceScheduleFilters.ts's own filter state already uses — for as long as
// the phone STAYS in portrait, but resets the moment it leaves portrait, so
// the suggestion gets a fresh chance to be noticed next time it's rotated
// back into portrait, rather than being silenced forever like
// useFirstLaunchHint.ts's own one-time nudges. Clearing the persisted flag on
// leaving portrait is useResetRotateBannerOnLandscape.ts's job (mounted once,
// globally, in App.tsx — see its own comment for why it can't be done from
// here alone); this hook's own responsibility is narrower: resync ITS local
// React state from storage whenever ITS caller's `isPortraitPhone` newly
// becomes true, so an on-screen banner reflects whatever that global watcher
// already settled on, however long ago or on whatever other page that
// happened.
export function useRotateBannerDismissed(isPortraitPhone: boolean): UseRotateBannerDismissedResult {
  const [dismissed, setDismissed] = useState(loadRotateBannerDismissed)

  // "Adjusting state when a prop changes," not an effect — tracks the previous
  // isPortraitPhone across renders and, only on a genuine entering-portrait
  // transition, resyncs synchronously within THIS render (React discards it
  // and re-renders immediately with the correction before anything commits,
  // so there's no flash of a stale dismissed/not-dismissed banner and no
  // extra effect-driven render pass — same reasoning, and the same pattern,
  // as useDanceScheduleFilters.ts's own prevPresentRange; also what
  // react-hooks/set-state-in-effect steers away from calling setState
  // directly in a useEffect for).
  const [wasPortraitPhone, setWasPortraitPhone] = useState(isPortraitPhone)
  if (isPortraitPhone !== wasPortraitPhone) {
    setWasPortraitPhone(isPortraitPhone)
    if (isPortraitPhone) {
      setDismissed(loadRotateBannerDismissed())
    }
  }

  function dismiss() {
    setDismissed(true)
    saveRotateBannerDismissed(true)
  }

  return { dismissed, dismiss }
}
