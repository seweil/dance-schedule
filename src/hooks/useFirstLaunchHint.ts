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

// Module-level, per-id subscriber registry — see the big comment on
// useFirstLaunchHint below for why this is needed again (it wasn't, for a
// while). Each id gets its own Set of React-supplied callbacks; dismissing
// an id notifies every currently-mounted consumer of THAT id, regardless of
// which one actually called dismiss().
const subscribers = new Map<string, Set<() => void>>()

function subscribe(id: string, callback: () => void): () => void {
  let idSubscribers = subscribers.get(id)
  if (!idSubscribers) {
    idSubscribers = new Set()
    subscribers.set(id, idSubscribers)
  }
  idSubscribers.add(callback)
  return () => idSubscribers.delete(callback)
}

function notify(id: string) {
  subscribers.get(id)?.forEach((callback) => callback())
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
// `dismissed` goes through useSyncExternalStore, not a private useState —
// this hook briefly used a plain useState (fine as long as exactly one
// component both owns, i.e. calls dismiss(), and reads a given hint's
// state), then went through useSyncExternalStore once RotateDeviceBanner.tsx
// needed to read the kebab-menu/level-slider ids read-only, then reverted
// back to useState once that particular suppression was abandoned (a
// different, visual layout-jump issue — see docs/design/onboarding-hints.md's
// "leave the rotate banner up" decision). It's back again because the same
// situation recurred for real: FirstRunTextSizePrompt.tsx OWNS
// `useFirstLaunchHint('text-size', 1)` (calls dismiss()), while
// PageMenu.tsx/DanceScheduleFilters.tsx each hold their own READ-ONLY
// `useFirstLaunchHint('text-size', 1)` call to suppress their own hints
// while that modal is visible. With a private useState, dismissing from the
// modal's own instance only ever updated THAT instance's local state —
// PageMenu's/DanceScheduleFilters' own separate copies never learned about
// it, so they stayed suppressed forever even after the modal was long gone
// (reported live: "the kebab-menu hint never shows up after picking a text
// size"). The module-level `subscribers` registry above fixes this
// permanently for every id, not just "text-size" specifically, since any
// future hint could grow a second read-only consumer the same way.
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
  const dismissed = useSyncExternalStore(
    useCallback((callback) => subscribe(id, callback), [id]),
    () => resolveDismissed(id),
  )
  const [launchCount] = useState(() => resolveCurrentLaunchCount())

  const dismiss = useCallback(() => {
    writeStorageJson(DISMISSED_KEY_PREFIX + id, true)
    notify(id)
  }, [id])

  return { shouldShow: !dismissed && launchCount <= maxLaunches, dismiss }
}
