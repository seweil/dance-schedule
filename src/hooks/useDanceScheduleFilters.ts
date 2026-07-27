import { useEffect, useMemo, useState } from 'react'
import { computeDanceScheduleLayout, type DanceScheduleLayout } from '../lib/computeDanceScheduleLayout'
import {
  loadStoredDanceScheduleFilters,
  resolveStoredDate,
  resolveStoredLevelRange,
  resolveStoredShowGca,
  saveDanceScheduleFilters,
} from '../lib/danceScheduleFiltersStorage'
import { filterDanceSessions } from '../lib/filterDanceSessions'
import { groupDanceSessionsByDate } from '../lib/groupDanceSessionsByDate'
import { getLevelSlots, type LevelSlot } from '../lib/levelOrder'
import type { DanceSession } from '../types/danceSchedule'

export interface UseDanceScheduleFiltersResult {
  dates: Date[]
  selectedDate: Date
  setSelectedDate: (date: Date) => void
  slots: readonly LevelSlot[]
  minLevelIndex: number
  maxLevelIndex: number
  setLevelRange: (minLevelIndex: number, maxLevelIndex: number) => void
  showGca: boolean
  setShowGca: (showGca: boolean) => void
  layout: DanceScheduleLayout
}

// Owns the dance-schedule page's filter state and derives everything downstream from
// it — keeps DanceSchedulePage presentational, per CLAUDE.md's "push data-fetching and
// side effects into hooks" convention. `combineA1A2` (from the active content set's
// config.yaml, via virtual:content-config) is a build-time-constant feature flag, not
// expected to change within a session — see docs/design/dance-schedule.md.
export function useDanceScheduleFilters(
  sessions: DanceSession[],
  combineA1A2: boolean,
): UseDanceScheduleFiltersResult {
  const groups = useMemo(() => groupDanceSessionsByDate(sessions), [sessions])
  const dates = useMemo(() => groups.map((group) => group.date), [groups])
  const slots = useMemo(() => getLevelSlots(combineA1A2), [combineA1A2])

  // Read once, at mount — a stable lazy useState initializer, not a plain call, so
  // it doesn't re-read localStorage on every render. See
  // src/lib/danceScheduleFiltersStorage.ts for how each stored field is validated/
  // clamped against the CURRENT dates/slots before being trusted.
  const [initialStoredFilters] = useState(() => loadStoredDanceScheduleFilters())

  const [selectedDate, setSelectedDate] = useState<Date>(() => resolveStoredDate(initialStoredFilters, dates))
  const [minLevelIndex, setMinLevelIndex] = useState(
    () => resolveStoredLevelRange(initialStoredFilters, slots.length).minLevelIndex,
  )
  const [maxLevelIndex, setMaxLevelIndex] = useState(
    () => resolveStoredLevelRange(initialStoredFilters, slots.length).maxLevelIndex,
  )
  const [showGca, setShowGca] = useState(() => resolveStoredShowGca(initialStoredFilters))

  const setLevelRange = (min: number, max: number) => {
    setMinLevelIndex(min)
    setMaxLevelIndex(max)
  }

  // Persists on every change (including the initial mount, harmlessly re-writing the
  // just-resolved/clamped values) so a returning visit — or a fresh PWA launch —
  // picks up right where the user left off.
  useEffect(() => {
    saveDanceScheduleFilters({ selectedDateISO: selectedDate.toISOString(), minLevelIndex, maxLevelIndex, showGca })
  }, [selectedDate, minLevelIndex, maxLevelIndex, showGca])

  // The full, unfiltered set of sessions for the selected date — layout needs this
  // (not just the visible subset) to keep room order/time bounds stable as the level
  // filter changes.
  const dateSessions = useMemo(
    () => groups.find((group) => group.date.getTime() === selectedDate.getTime())?.sessions ?? [],
    [groups, selectedDate],
  )

  const visibleSessions = useMemo(
    () => filterDanceSessions(sessions, selectedDate, minLevelIndex, maxLevelIndex, slots),
    [sessions, selectedDate, minLevelIndex, maxLevelIndex, slots],
  )

  const layout = useMemo(
    () => computeDanceScheduleLayout(dateSessions, visibleSessions),
    [dateSessions, visibleSessions],
  )

  return {
    dates,
    selectedDate,
    setSelectedDate,
    slots,
    minLevelIndex,
    maxLevelIndex,
    setLevelRange,
    showGca,
    setShowGca,
    layout,
  }
}
