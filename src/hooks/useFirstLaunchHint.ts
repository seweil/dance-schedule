import { useCallback, useState } from 'react'
import { readStorageJson, writeStorageJson } from '../lib/appStorage'

const DISMISSED_KEY_PREFIX = 'dance-schedule:hint-dismissed:'
// Must match useAppLaunchCount.ts's own STORAGE_KEY — duplicated rather than
// imported as a shared constant, since the two files' only actual coupling is
// this one string; see that file's own comment for why reading it directly
// here (rather than via Context or this hook's return value) is enough.
const LAUNCH_COUNT_KEY = 'dance-schedule:launch-count'

function resolveCurrentLaunchCount(): number {
  const stored = readStorageJson<number>(LAUNCH_COUNT_KEY)
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : 0
}

function resolveDismissed(id: string): boolean {
  return readStorageJson<boolean>(DISMISSED_KEY_PREFIX + id) === true
}

export interface UseFirstLaunchHintResult {
  shouldShow: boolean
  dismiss: () => void
}

// Generic "should this one onboarding hint show right now" logic — the
// reusable half of this app's onboarding-hint mechanism (see
// docs/design/onboarding-hints.md); HintBalloon.tsx is the presentational
// half. A hint is eligible while the app is still within its first
// `maxLaunches` launches (App.tsx's useAppLaunchCount, read directly here —
// by the time this hook's own lazy initializer runs, App.tsx's has already
// incremented and persisted the count, since a parent's hooks fully run
// before its children's during the initial render) AND hasn't been
// explicitly dismissed. Once dismissed, stays dismissed forever, regardless
// of remaining launches — this is a one-time nudge, not something meant to
// keep reappearing after someone's acknowledged it.
//
// `id` is a short, stable, kebab-case identifier — part of the persisted
// dismissed-state's storage key, so it should describe the HINT, not the
// exact copy shown (e.g. "kebab-menu", not "tap-here-for-the-menu") —
// changing the wording later shouldn't reset whether someone already saw
// and dismissed it. Every future hint calls this same hook with its own id;
// nothing here is specific to the kebab-menu hint that motivated it.
//
// Each id today has exactly one owning component (PageMenu.tsx for
// "kebab-menu", DanceScheduleFilters.tsx for "level-slider") that both
// calls dismiss() and reads shouldShow — so a plain useState, seeded once
// at mount from storage, is enough; nothing else needs to learn about a
// dismissal that happens elsewhere while it's still mounted. (An earlier
// version of this hook briefly went through useSyncExternalStore instead,
// to support RotateDeviceBanner.tsx reading BOTH ids read-only to suppress
// itself while either hint was showing — reverted, along with that
// suppression, once it started causing a visible layout jump; see
// docs/design/onboarding-hints.md's own "leave the rotate banner up"
// decision. Revisit this if a future read-only third consumer shows up
// again.)
//
// `dismiss` is wrapped in `useCallback` — NOT just a plain function — even
// though nothing here needs it memoized for ITS own sake: `HintBalloon.tsx`
// passes it straight through as `onDismiss`, a dependency of ITS OWN
// `useEffect` that registers/tears down document-level pointerdown/click
// listeners. A plain (non-memoized) `dismiss` gets a brand-new identity on
// EVERY render of the owning component — and `DanceScheduleFilters.tsx`
// re-renders often, independent of anything hint-related (its own
// `hoveredTickIndex` ghost-preview state changes on every tick hover) —
// so that effect was tearing down and re-registering its listeners far
// more often than it needed to. Reported live: with the level-slider hint
// showing, the FIRST tap on a tick sometimes failed to dismiss the hint at
// all (confirmed reproducible even with the kebab-menu hint NOT also
// showing, ruling out cross-hint interference) — a SECOND tap always
// worked. `useCallback(..., [id])` keeps `dismiss`'s own identity stable
// across re-renders (since `id` never changes for a given call site),
// which keeps `HintBalloon`'s effect stable too, eliminating that churn
// entirely rather than trying to reason about exactly which re-render
// timing made it reproduce.
export function useFirstLaunchHint(id: string, maxLaunches = 3): UseFirstLaunchHintResult {
  const [dismissed, setDismissed] = useState(() => resolveDismissed(id))
  const [launchCount] = useState(() => resolveCurrentLaunchCount())

  const dismiss = useCallback(() => {
    setDismissed(true)
    writeStorageJson(DISMISSED_KEY_PREFIX + id, true)
  }, [id])

  return { shouldShow: !dismissed && launchCount <= maxLaunches, dismiss }
}
