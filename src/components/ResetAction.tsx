import { useEffect } from 'react'
import { resetAppState } from '../lib/resetAppState'

// Reachable at /reset — unlike ClearStorageAction.tsx's /clear-storage or
// ResetHintsLink.tsx's footer button, both of which require an explicit
// click first so a stray link/back-forward/SW prefetch can't silently wipe
// someone's state, this route is meant to BE that stray link: a URL you can
// hand someone else so they land straight in a fresh first-run experience,
// no tap required on their end — landing here already IS the explicit "give
// me a completely fresh state" signal a click would otherwise supply.
//
// Runs the exact same resetAppState() as those other two — see that
// module's own comment for what "reset" means now and why all three share
// one definition.
export function ResetAction() {
  useEffect(() => {
    void resetAppState()
  }, [])

  return null
}
