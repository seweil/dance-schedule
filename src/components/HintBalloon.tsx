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
  return (
    <div className={styles.balloon} role="status">
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
