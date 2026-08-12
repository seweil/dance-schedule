import { useMediaQuery } from '../hooks/useMediaQuery'
import { PHONE_MAX_WIDTH_PX } from '../lib/breakpoints'
import styles from './RotateDeviceBanner.module.css'

// Phone-width AND portrait, not just --phone alone — a landscape phone is
// already past PHONE_MAX_WIDTH_PX in practice (see
// docs/design/dance-schedule-mobile-scroll.md's own note that "an iPhone in
// landscape is past a naive 640px width check"), but being explicit about
// orientation here (rather than relying on that width-only coincidence)
// keeps this query correct even on a device where it doesn't hold. Built as
// a runtime string, not a static .module.css rule, the same way
// PageHeader.tsx's WIDE_LANDSCAPE_QUERY is — this needs to react live to a
// rotation via useMediaQuery's 'change' listener, not just render once.
const PORTRAIT_PHONE_QUERY = `(orientation: portrait) and (max-width: ${PHONE_MAX_WIDTH_PX}px)`

// Nudges toward landscape on the three dance-schedule grid pages (Room/Dance/
// Caller Schedule) — each renders a StickyScrollGrid whose column count
// (rooms/levels/callers) routinely exceeds what a portrait phone can show
// without horizontal scrolling; landscape roughly doubles the usable width
// for the same content. role="status", not "alert" — a helpful, non-urgent
// suggestion. No dismiss affordance: it simply stops rendering the moment the
// phone is rotated (useMediaQuery is live), so there's nothing to dismiss.
export function RotateDeviceBanner() {
  const isPortraitPhone = useMediaQuery(PORTRAIT_PHONE_QUERY)

  if (!isPortraitPhone) {
    return null
  }

  return (
    <div className={styles.banner} role="status">
      {/* A phone outline plus a curved arrow around its top-right corner —
          the same "rotate to landscape" glyph convention as iOS/Android's own
          rotation prompts. aria-hidden: the message text alone already says
          "rotate," so the icon is decorative, not additional information. */}
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
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
  )
}
