import { useEffect } from 'react'
import { PORTRAIT_PHONE_QUERY } from '../lib/breakpoints'
import { loadRotateBannerDismissed, saveRotateBannerDismissed } from '../lib/rotateBannerDismissalStorage'
import { useMediaQuery } from './useMediaQuery'

// Mounted once, globally (App.tsx) — the sole authority that clears a stuck
// RotateDeviceBanner.tsx dismissal once the phone genuinely leaves portrait.
// A per-page effect can't reliably observe every rotation on its own:
// RotateDeviceBanner only renders on the three dance-schedule pages, so a
// user who dismisses it, then navigates to some OTHER page (Home,
// Installation) and rotates there, would have that landscape phase go
// completely unobserved by any schedule-page-scoped hook — the dismissal
// would incorrectly stay stuck "true" forever, even after later rotating back
// into portrait on a schedule page. Mounting this here instead means it's
// alive for the whole app session regardless of route, so
// useRotateBannerDismissed.ts's own per-instance resync (which only runs
// while a schedule page happens to be mounted) always finds an up-to-date,
// already-cleared value in storage once the user rotates back into portrait,
// no matter what page that rotation itself happened on.
export function useResetRotateBannerOnLandscape(): void {
  const isPortraitPhone = useMediaQuery(PORTRAIT_PHONE_QUERY)

  useEffect(() => {
    if (!isPortraitPhone && loadRotateBannerDismissed()) {
      saveRotateBannerDismissed(false)
    }
  }, [isPortraitPhone])
}
