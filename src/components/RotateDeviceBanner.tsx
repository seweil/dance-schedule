import { useMediaQuery } from '../hooks/useMediaQuery'
import { useRotateBannerDismissed } from '../hooks/useRotateBannerDismissed'
import { useFirstLaunchHint } from '../hooks/useFirstLaunchHint'
import { PORTRAIT_PHONE_QUERY } from '../lib/breakpoints'
import styles from './RotateDeviceBanner.module.css'

// Nudges toward landscape on the three dance-schedule grid pages (Room/Dance/
// Caller Schedule) — each renders a StickyScrollGrid whose column count
// (rooms/levels/callers) routinely exceeds what a portrait phone can show
// without horizontal scrolling; landscape roughly doubles the usable width
// for the same content. role="status", not "alert" — a helpful, non-urgent
// suggestion. Dismissible via the close button; useRotateBannerDismissed
// keeps that dismissal sticky across the three pages but resets it the next
// time the phone leaves and re-enters portrait, rather than silencing it
// forever.
export function RotateDeviceBanner() {
  const isPortraitPhone = useMediaQuery(PORTRAIT_PHONE_QUERY)
  const { dismissed, dismiss } = useRotateBannerDismissed(isPortraitPhone)
  // Suppressed while either onboarding hint is showing — confirmed live that
  // on a genuinely fresh device, this banner and PageMenu.tsx's kebab-menu
  // hint balloon (both near the top of these pages) can render at the same
  // time and visually collide. Reads the SAME two ids PageMenu.tsx and
  // DanceScheduleFilters.tsx themselves own/dismiss — this only works
  // because useFirstLaunchHint's `dismissed` is a useSyncExternalStore
  // subscription (see that file's own comment), not a private useState; a
  // plain useState here would capture whatever was true at THIS component's
  // own mount and never learn that the other component later dismissed it.
  // Hardcodes both ids rather than a registry — there are exactly two hints
  // in the app today (docs/design/onboarding-hints.md); revisit if a third
  // one also needs to suppress this banner.
  const { shouldShow: showKebabHint } = useFirstLaunchHint('kebab-menu')
  const { shouldShow: showLevelHint } = useFirstLaunchHint('level-slider')

  if (!isPortraitPhone || dismissed || showKebabHint || showLevelHint) {
    return null
  }

  return (
    <div className={styles.banner} role="status">
      <div className={styles.content}>
        {/* A phone outline plus a curved arrow around its top-right corner —
            the same "rotate to landscape" glyph convention as iOS/Android's
            own rotation prompts. Sized (via .icon, not width/height
            attributes) to stand roughly as tall as two lines of the message
            text — the tiny original size read as an afterthought next to it.
            aria-hidden: the message text alone already says "rotate," so the
            icon is decorative, not additional information. */}
        <svg viewBox="0 0 24 24" className={styles.icon} fill="none" aria-hidden="true">
          <rect x="9" y="4" width="9" height="16" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M3 9.5a6 6 0 0 1 3-5.2M1.3 6 3 9.5l3.3-1.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className={styles.message}>This might look better if you rotate your phone to landscape</p>
      </div>
      <button type="button" className={styles.closeButton} onClick={dismiss} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
