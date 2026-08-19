import { useState } from 'react'

// Like useMediaQuery, but captured once at mount and never re-evaluated —
// for a check that should reflect the device's ACTUAL type at first paint,
// not track every subsequent live window-resize/orientation change.
// FirstRunTextSizePrompt.tsx (+ PageMenu.tsx/DanceScheduleFilters.tsx's own
// matching suppression checks) originally used the reactive useMediaQuery
// for this — a real device's rotation didn't actually need that reactivity
// (PHONE_QUERY, breakpoints.ts, already matches a phone in EITHER
// orientation by construction, so a real phone stays "isPhone" through a
// rotation whether or not the value is live-tracked), but per direct
// product decision, a plain live resize of a desktop browser window narrower
// than the breakpoint could make the modal suddenly pop up (or vanish again
// on resizing back out, before it was ever dismissed) mid-session — a real,
// if edge-case, surprise reactivity alone introduced. Pinning at mount
// removes that without weakening the one case that actually matters (a
// genuine phone rotating), since PHONE_QUERY's own orientation-invariance
// already covers that regardless of whether the value updates afterward.
export function usePinnedMediaQuery(query: string): boolean {
  const [matches] = useState(() => window.matchMedia(query).matches)
  return matches
}
