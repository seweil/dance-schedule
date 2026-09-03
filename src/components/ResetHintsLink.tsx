import { useState } from 'react'
import { resetAppState } from '../lib/resetAppState'
import styles from './ResetHintsLink.module.css'

// A quick way to replay the onboarding hints (PageMenu.tsx's kebab-menu
// hint, DanceScheduleFilters.tsx's level-slider hint, FirstRunTextSizePrompt.tsx's
// text-size prompt) from a clean slate without manually poking localStorage —
// added specifically to make hands-on testing/tuning of those hints fast,
// since they only show during a device's first few launches
// (useFirstLaunchHint.ts) and, once dismissed, never reappear on their own.
//
// Runs the same resetAppState() as ClearStorageAction.tsx/ResetAction.tsx —
// see that module's own comment for what "reset" means now, and why this no
// longer hand-rolls its own clearAllStorage() + plain reload.
export function ResetHintsLink() {
  const [resetting, setResetting] = useState(false)

  return (
    <button
      type="button"
      className={styles.resetLink}
      disabled={resetting}
      onClick={() => {
        setResetting(true)
        void resetAppState()
      }}
    >
      {resetting ? 'Resetting…' : 'Reset'}
    </button>
  )
}
