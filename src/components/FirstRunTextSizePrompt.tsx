import { useEffect, useId, useRef } from 'react'
import { useFirstLaunchHint } from '../hooks/useFirstLaunchHint'
import { usePinnedMediaQuery } from '../hooks/usePinnedMediaQuery'
import { PHONE_QUERY } from '../lib/breakpoints'
import { TextSizeControl } from './TextSizeControl'
import styles from './FirstRunTextSizePrompt.module.css'

// A one-time, modal first-run prompt letting a new user set their text-size
// preference (useTextSizePreference.ts) directly, up front - distinct from
// this app's existing HintBalloon-based onboarding hints (kebab-menu,
// level-slider), which only ever point at a control rather than perform its
// action. See docs/design/onboarding-hints.md for why: TextSizeControl now
// lives exclusively inside a dropdown (the nav's "Text size" toggle, or
// PageMenu.tsx's hamburger menu), so a low-vision first-time visitor would
// otherwise have to notice a small icon, open a menu, and find the control
// inside it - all at the smallest text they'll ever see in the app - before
// anything gets bigger. No separate "keep default"/"skip" button - "Normal"
// among TextSizeControl's own three options already IS the default, so a
// second button doing the same thing was redundant (reported live); a
// backdrop click or Escape remains how to leave without an explicit choice.
// maxLaunches: 1 (not the default 3) since this is a
// heavier, modal prompt: it shows exactly once, on the very first launch,
// and never again regardless of whether it was acted on or skipped. The
// control stays reachable afterward via the nav/menu for anyone who wants
// to change it later. Also gated on PHONE_QUERY (breakpoints.ts, matches a
// phone in either orientation), per direct product decision — the
// motivating scenario is specifically a phone, and this prompt would
// otherwise also interrupt a desktop-width first visit. Pinned at mount
// (usePinnedMediaQuery, not the reactive useMediaQuery) — per direct
// product decision, live-tracking this let a desktop user resizing their
// browser window narrower mid-session make the modal suddenly pop up (or
// vanish again on resizing back out before dismissing it), which a plain
// mount-time snapshot doesn't need: a genuine phone rotating stays "isPhone"
// either way, since PHONE_QUERY itself already matches both orientations —
// see usePinnedMediaQuery.ts's own comment.
export function FirstRunTextSizePrompt() {
  const { shouldShow, dismiss } = useFirstLaunchHint('text-size', 1)
  const isPhone = usePinnedMediaQuery(PHONE_QUERY)
  const isVisible = shouldShow && isPhone
  const headingId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focuses the dialog itself (not a particular control inside it) on
  // mount, so a keyboard/screen-reader user lands here immediately rather
  // than wherever focus happened to be before this appeared - mirrors this
  // being the first thing a fresh visitor should encounter.
  useEffect(() => {
    if (!isVisible) {
      return
    }
    dialogRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dismiss()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, dismiss])

  if (!isVisible) {
    return null
  }

  return (
    <div className={styles.backdrop} onClick={dismiss}>
      {/* stopPropagation: this is a genuinely modal backdrop (unlike
          HintBalloon's decorative, pointer-events: none dimming), so a
          plain onClick here is enough to catch every "outside" tap without
          needing HintBalloon's own pointerdown/click-swallow machinery -
          nothing underneath this opaque backdrop can be HIT-TESTED, so
          there's no real click-through risk of the kind that machinery
          guards against. That's not the same as HintBalloon being inert
          while this is up, though: its own document-level listeners fire
          for ANY tap anywhere, regardless of what's visually on top -
          PageMenu.tsx/DanceScheduleFilters.tsx suppress their own hints
          outright while this modal is visible specifically to avoid that
          (see their own comments), rather than this component trying to
          defend against it. */}
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={headingId} className={styles.heading}>
          Make text easier to read?
        </h2>
        <p className={styles.body}>You can change this anytime from the menu.</p>
        {/* No separate "keep default" button - the "Normal" option here IS
            the default, so it would have been a redundant second way to do
            the exact same thing (reported live). Backdrop click/Escape
            (below) remain the way to leave without making an explicit
            choice at all. */}
        <TextSizeControl onSelect={dismiss} />
      </div>
    </div>
  )
}
