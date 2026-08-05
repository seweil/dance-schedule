import { useEffect, useRef } from 'react'
import styles from './HintBalloon.module.css'

export interface HintBalloonProps {
  message: string
  onDismiss: () => void
}

// A small, dismissible callout with an upward-pointing arrow — the
// presentational half of this app's onboarding-hint mechanism (see
// docs/design/onboarding-hints.md); useFirstLaunchHint.ts is the reusable
// logic half deciding WHETHER to render this at all. Positioned to sit
// directly below and point up at whatever it's meant to be calling
// attention to — PageMenu.tsx's kebab toggle today, the only caller so far.
// That positioning (`.balloon`'s own `position: absolute; top: 100%`) is
// baked into this component rather than left to each caller, since every
// real use case so far needs the exact same "sits below its target, points
// up at it" shape; a second caller with a genuinely different placement
// need is the point to reconsider, not something worth generalizing for
// speculatively now.
//
// role="status" (not role="alert") — this is a helpful, non-urgent nudge a
// screen reader user can discover at their own pace, not something that
// needs to interrupt whatever they're already doing.
export function HintBalloon({ message, onDismiss }: HintBalloonProps) {
  const balloonRef = useRef<HTMLDivElement>(null)

  // Reported live: dismissing this should work by tapping anywhere outside
  // it too, not just its own × button — the same "outside click closes it"
  // behavior useDismissableMenu.ts already gives Nav.tsx's/PageMenu.tsx's
  // own dropdowns, but written directly here rather than reused from that
  // hook: this isn't a reopenable toggle menu (no isOpen/Escape-to-refocus
  // behavior needed — once dismissed, a hint never reappears), so
  // useDismissableMenu's own shape doesn't fit. A tap on PageMenu.tsx's real
  // toggle button also counts as "outside" here and dismisses it too, same
  // as PageMenu.tsx's own handleToggleClick already does explicitly — both
  // paths call the same idempotent dismiss, so there's no conflict from
  // triggering it twice for that one tap.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!balloonRef.current?.contains(event.target as Node)) {
        onDismiss()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onDismiss])

  return (
    <div ref={balloonRef} className={styles.balloon} role="status">
      <span className={styles.pointer} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M5 5L15 15M15 5L5 15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
