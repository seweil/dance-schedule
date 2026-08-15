import { useCallback, useState, useSyncExternalStore } from 'react'
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

// Per-id subscriber sets backing the useSyncExternalStore below — lets a
// dismiss() call from ONE component instance notify every OTHER instance
// watching the same id, including read-only ones that never call dismiss()
// themselves (RotateDeviceBanner.tsx, which needs to know live whether the
// kebab-menu or level-slider hint another component owns is currently
// showing, to suppress itself and avoid overlapping it — see
// docs/design/onboarding-hints.md). Before this existed, each call site's
// `dismissed` was a private useState seeded once at mount from storage —
// fine as long as exactly one component both owned and read a given hint,
// but a third, read-only reader would keep observing its own stale
// mount-time snapshot forever, since nothing re-ran that initializer just
// because a DIFFERENT component's state (and localStorage) changed.
const listenersById = new Map<string, Set<() => void>>()

function getListeners(id: string): Set<() => void> {
  let listeners = listenersById.get(id)
  if (!listeners) {
    listeners = new Set()
    listenersById.set(id, listeners)
  }
  return listeners
}

function subscribe(id: string, onStoreChange: () => void): () => void {
  const listeners = getListeners(id)
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

function notify(id: string): void {
  for (const listener of getListeners(id)) {
    listener()
  }
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
// `dismissed` is a useSyncExternalStore subscription (see the module-level
// listener registry above), not a plain useState, precisely so a second or
// third component watching the SAME id — not just the one that owns/calls
// dismiss() — re-renders the instant it changes, from wherever it changed.
// launchCount stays a plain useState: it's fixed for the whole session by
// the time any of this runs (App.tsx's own useAppLaunchCount already
// incremented and persisted it before any child's hooks run), so there's
// nothing for a second reader to ever observe changing.
export function useFirstLaunchHint(id: string, maxLaunches = 3): UseFirstLaunchHintResult {
  const dismissed = useSyncExternalStore(
    useCallback((onStoreChange) => subscribe(id, onStoreChange), [id]),
    () => resolveDismissed(id),
  )
  const [launchCount] = useState(() => resolveCurrentLaunchCount())

  const dismiss = useCallback(() => {
    writeStorageJson(DISMISSED_KEY_PREFIX + id, true)
    notify(id)
  }, [id])

  return { shouldShow: !dismissed && launchCount <= maxLaunches, dismiss }
}
