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
import { trackEvent } from '../lib/rum'
import {
  clampLevelIndex,
  getLevelSlots,
  getPresentLevelIndexRange,
  labelSlotsByPresence,
  type LevelSlot,
} from '../lib/levelOrder'
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
  // labelSlotsByPresence runs against the FULL, event-wide `sessions` — not
  // dateSessions/visibleSessions — so a merged slot's label ("A1/A2" vs. just "A2")
  // stays stable across date switches instead of flickering with whichever day
  // happens to be selected.
  const slots = useMemo(
    () => labelSlotsByPresence(getLevelSlots(combineA1A2, combineC3BC4), sessions),
    [combineA1A2, combineC3BC4, sessions],
  )

  // Read once, at mount — a stable lazy useState initializer, not a plain call, so
  // it doesn't re-read localStorage on every render. See
  // src/lib/danceScheduleFiltersStorage.ts for how each stored field is validated/
  // clamped against the CURRENT dates/slots before being trusted.
  const [initialStoredFilters] = useState(() => loadStoredDanceScheduleFilters())

  const [selectedDate, setSelectedDateState] = useState<Date>(() => resolveStoredDate(initialStoredFilters, dates))

  // Wraps the raw setter (rather than tracking in an effect keyed on
  // selectedDate) so this only fires on a genuine user pick, not on mount.
  const setSelectedDate = (date: Date) => {
    trackEvent('dance_schedule_date_selected', { date: date.toISOString().slice(0, 10) })
    setSelectedDateState(date)
  }

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

  // The range the user actually SET (persisted, stable) — as opposed to
  // minLevelIndex/maxLevelIndex below, which is the range currently EFFECTIVE/shown,
  // derived from this on every render. Deliberately not clamped to the initial date's
  // present range here (unlike the old single-state version this replaced) — that
  // clamping belongs entirely to the derived view below, so a day that happens to be
  // narrower than the user's own setting never overwrites it. resolveStoredLevelRange
  // still guards against indices invalid for the CURRENT slot count (e.g. combineA1A2
  // toggled between visits), which is a real correctness clamp, not a per-day one.
  const [userMinLevelIndex, setUserMinLevelIndex] = useState(
    () => resolveStoredLevelRange(initialStoredFilters, slots.length).minLevelIndex,
  )
  const [userMaxLevelIndex, setUserMaxLevelIndex] = useState(
    () => resolveStoredLevelRange(initialStoredFilters, slots.length).maxLevelIndex,
  )
  const [showGca, setShowGca] = useState(() => resolveStoredShowGca(initialStoredFilters))

  // The effective range for the selected date — userMin/MaxLevelIndex trimmed into
  // that date's own present range. A pure derivation (no state, no effect): switching
  // to a narrower day changes what's SHOWN without touching what the user SET, so
  // switching back to a wider day restores the original range instead of staying
  // stuck at whatever a narrower day in between happened to trim it to. Bug this
  // fixes: the previous version clamped userMin/MaxLevelIndex's predecessor state
  // in place on every date switch, so the user's original selection was gone for
  // good the moment a narrower day trimmed it — even after returning to a day wide
  // enough for it.
  const minLevelIndex = useMemo(
    () => clampLevelIndex(userMinLevelIndex, { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex }),
    [userMinLevelIndex, minPresentLevelIndex, maxPresentLevelIndex],
  )
  const maxLevelIndex = useMemo(
    () => clampLevelIndex(userMaxLevelIndex, { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex }),
    [userMaxLevelIndex, minPresentLevelIndex, maxPresentLevelIndex],
  )

  // Always a genuine user action (slider drag/tick, or a page's "Show all levels"
  // empty-state link) — never called by the per-day trimming above, which is a pure
  // derivation, not a setter. Since the slider's own draggable bounds are already
  // limited to [minPresentLevelIndex, maxPresentLevelIndex] for the current day
  // (DanceScheduleFilters.tsx's Slider.Root min/max), a drag on a narrow day can only
  // ever record a range that fits within it — consistent with "this is what the user
  // set," not a limitation to work around.
  const setLevelRange = (min: number, max: number) => {
    setUserMinLevelIndex(min)
    setUserMaxLevelIndex(max)
  }

  // Persists the SETTING (userMin/MaxLevelIndex), not the per-day effective view —
  // otherwise a narrower day's trimmed range would overwrite the user's original
  // selection in storage too, the same bug the split above fixes, just one layer
  // down. Runs on every change (including the initial mount, harmlessly re-writing
  // the just-resolved values) so a returning visit — or a fresh PWA launch — picks up
  // right where the user left off.
  useEffect(() => {
    saveDanceScheduleFilters({
      selectedDateISO: selectedDate.toISOString(),
      minLevelIndex: userMinLevelIndex,
      maxLevelIndex: userMaxLevelIndex,
      showGca,
    })
  }, [selectedDate, userMinLevelIndex, userMaxLevelIndex, showGca])

  // Tracks userMin/MaxLevelIndex (the persisted setting), not minLevelIndex/
  // maxLevelIndex (the per-day derived view) — otherwise every date switch that
  // happens to trim/restore the view would fire as if it were a new level-range
  // pick, drowning out the signal this is actually for: what range people are
  // deliberately choosing to browse with. Fires on mount too, not just when the
  // user drags the slider (unlike setSelectedDate's tracking above) — same
  // rationale as useTextSizePreference's trackEvent: a stored-from-last-visit
  // setting is just as useful a signal as an in-session change.
  useEffect(() => {
    trackEvent('dance_schedule_level_range', {
      min: slots[userMinLevelIndex]?.label,
      max: slots[userMaxLevelIndex]?.label,
    })
  }, [userMinLevelIndex, userMaxLevelIndex, slots])

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
