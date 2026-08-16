import { useState } from 'react'
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
export function useFirstLaunchHint(id: string, maxLaunches = 3): UseFirstLaunchHintResult {
  const [dismissed, setDismissed] = useState(() => resolveDismissed(id))
  const [launchCount] = useState(() => resolveCurrentLaunchCount())

  function dismiss() {
    setDismissed(true)
    writeStorageJson(DISMISSED_KEY_PREFIX + id, true)
  }

  return { shouldShow: !dismissed && launchCount <= maxLaunches, dismiss }
}
