import { useEffect, useMemo, useState } from 'react'
import {
  loadStoredDanceScheduleFilters,
  resolveStoredDate,
  resolveStoredLevelRange,
  resolveStoredShowGca,
  saveDanceScheduleFilters,
} from '../lib/danceScheduleFiltersStorage'
import { filterDanceSessions } from '../lib/filterDanceSessions'
import { groupDanceSessionsByDate } from '../lib/groupDanceSessionsByDate'
import { clampLevelIndex, getLevelSlots, getPresentLevelIndexRange, type LevelSlot } from '../lib/levelOrder'
import type { DanceSession } from '../types/danceSchedule'

export interface UseDanceScheduleFiltersResult {
  dates: Date[]
  selectedDate: Date
  setSelectedDate: (date: Date) => void
  slots: readonly LevelSlot[]
  minLevelIndex: number
  maxLevelIndex: number
  setLevelRange: (minLevelIndex: number, maxLevelIndex: number) => void
  // The [minLevelIndex, maxLevelIndex]-shaped sub-range of `slots` actually
  // scheduled on the selected date — e.g. an event whose registration starts at A2
  // never has anything below it, so these trim the level slider's otherwise-dead
  // low end. See getPresentLevelIndexRange (levelOrder.ts).
  minPresentLevelIndex: number
  maxPresentLevelIndex: number
  showGca: boolean
  setShowGca: (showGca: boolean) => void
  // Whether any session on the selected date has a GCA caller-credit line — lets the
  // filter row omit the "Show GCA callers" checkbox entirely on a day (or event) with
  // nothing for it to toggle.
  hasGcaOnSelectedDate: boolean
  // The full, unfiltered set of sessions for the selected date, and the level-
  // filtered subset actually visible — shared, view-agnostic inputs that each page
  // (room-columns or level-columns) turns into its own layout via its own compute*
  // function. Not computed here so this hook stays reusable by both.
  dateSessions: DanceSession[]
  visibleSessions: DanceSession[]
}

// Owns the dance-schedule page's filter state and derives everything downstream from
// it — keeps DanceSchedulePage/DanceScheduleLevelsPage presentational, per
// CLAUDE.md's "push data-fetching and side effects into hooks" convention. Shared by
// both pages (same localStorage-persisted state, via danceScheduleFiltersStorage.ts)
// so switching between the room-columns and level-columns views keeps the same
// date/level-range/GCA selection rather than resetting it. `combineA1A2`/
// `combineC3BC4` (from the active content set's config.yaml, via
// virtual:content-config) are build-time-constant feature flags, not expected to
// change within a session — see docs/design/dance-schedule.md.
export function useDanceScheduleFilters(
  sessions: DanceSession[],
  combineA1A2: boolean,
  combineC3BC4: boolean,
): UseDanceScheduleFiltersResult {
  const groups = useMemo(() => groupDanceSessionsByDate(sessions), [sessions])
  const dates = useMemo(() => groups.map((group) => group.date), [groups])
  const slots = useMemo(
    () => getLevelSlots(combineA1A2, combineC3BC4),
    [combineA1A2, combineC3BC4],
  )

  // Read once, at mount — a stable lazy useState initializer, not a plain call, so
  // it doesn't re-read localStorage on every render. See
  // src/lib/danceScheduleFiltersStorage.ts for how each stored field is validated/
  // clamped against the CURRENT dates/slots before being trusted.
  const [initialStoredFilters] = useState(() => loadStoredDanceScheduleFilters())

  const [selectedDate, setSelectedDate] = useState<Date>(() => resolveStoredDate(initialStoredFilters, dates))

  // The full, unfiltered set of sessions for the selected date — layout needs this
  // (not just the visible subset) to keep room order/time bounds stable as the level
  // filter changes. Computed here, ahead of the level-range state below, so its
  // initial value can feed that state's own lazy initializer in the same render.
  const dateSessions = useMemo(
    () => groups.find((group) => group.date.getTime() === selectedDate.getTime())?.sessions ?? [],
    [groups, selectedDate],
  )

  const { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex } = useMemo(
    () => getPresentLevelIndexRange(dateSessions, slots),
    [dateSessions, slots],
  )

  // Clamped against the initial date's own present range (not just slots.length) so
  // the first paint already shows a trimmed slider — no flash of the untrimmed range.
  const [minLevelIndex, setMinLevelIndex] = useState(() =>
    clampLevelIndex(resolveStoredLevelRange(initialStoredFilters, slots.length).minLevelIndex, {
      minIndex: minPresentLevelIndex,
      maxIndex: maxPresentLevelIndex,
    }),
  )
  const [maxLevelIndex, setMaxLevelIndex] = useState(() =>
    clampLevelIndex(resolveStoredLevelRange(initialStoredFilters, slots.length).maxLevelIndex, {
      minIndex: minPresentLevelIndex,
      maxIndex: maxPresentLevelIndex,
    }),
  )
  const [showGca, setShowGca] = useState(() => resolveStoredShowGca(initialStoredFilters))

  const setLevelRange = (min: number, max: number) => {
    setMinLevelIndex(min)
    setMaxLevelIndex(max)
  }

  // Re-scopes the level range whenever the selected date's own present range changes
  // (a date switch, primarily) — but NOT when the user just drags the slider within a
  // day. "Adjusting state when a prop changes" (react.dev), not a useEffect: compares
  // this render's present range against the previous render's (tracked in state, not
  // a ref, so it stays correct under concurrent rendering) and, only on a genuine
  // change, both records the new range and re-clamps minLevelIndex/maxLevelIndex
  // synchronously within THIS render — React discards this render and re-renders
  // immediately with the corrected state before anything commits, so there's no
  // flash of the untrimmed range and no extra effect-driven render pass (which is
  // also what react-hooks/set-state-in-effect steers away from). Never fires from a
  // manual setLevelRange call, since the condition only depends on the present-range
  // bounds, not minLevelIndex/maxLevelIndex themselves.
  const [prevPresentRange, setPrevPresentRange] = useState({
    minIndex: minPresentLevelIndex,
    maxIndex: maxPresentLevelIndex,
  })
  if (prevPresentRange.minIndex !== minPresentLevelIndex || prevPresentRange.maxIndex !== maxPresentLevelIndex) {
    const range = { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex }
    setPrevPresentRange(range)
    setMinLevelIndex((prev) => clampLevelIndex(prev, range))
    setMaxLevelIndex((prev) => clampLevelIndex(prev, range))
  }

  // Persists on every change (including the initial mount, harmlessly re-writing the
  // just-resolved/clamped values) so a returning visit — or a fresh PWA launch —
  // picks up right where the user left off.
  useEffect(() => {
    saveDanceScheduleFilters({ selectedDateISO: selectedDate.toISOString(), minLevelIndex, maxLevelIndex, showGca })
  }, [selectedDate, minLevelIndex, maxLevelIndex, showGca])

  const hasGcaOnSelectedDate = useMemo(
    () => dateSessions.some((session) => session.kind === 'structured' && !!session.gca),
    [dateSessions],
  )

  const visibleSessions = useMemo(
    () => filterDanceSessions(sessions, selectedDate, minLevelIndex, maxLevelIndex, slots),
    [sessions, selectedDate, minLevelIndex, maxLevelIndex, slots],
  )

  return {
    dates,
    selectedDate,
    setSelectedDate,
    slots,
    minLevelIndex,
    maxLevelIndex,
    setLevelRange,
    minPresentLevelIndex,
    maxPresentLevelIndex,
    showGca,
    setShowGca,
    hasGcaOnSelectedDate,
    dateSessions,
    visibleSessions,
  }
}
