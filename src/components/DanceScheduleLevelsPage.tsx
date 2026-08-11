import { useMemo } from 'react'
import danceSessionsData from 'virtual:dance-schedule'
import contentConfig from 'virtual:content-config'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { computeDanceScheduleLevelLayout } from '../lib/computeDanceScheduleLevelLayout'
import { useDanceScheduleFilters } from '../hooks/useDanceScheduleFilters'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { DanceScheduleLevelGrid } from './DanceScheduleLevelGrid'
import { PageHeader } from './PageHeader'

// Computed once at module load — the virtual module's data is static, so there's no
// need to re-sort on every filter-driven re-render. A second call to
// buildDanceSchedule (DanceSchedulePage.tsx makes its own) is cheap and keeps the two
// pages independent modules; the array contents are identical either way.
const sessions = buildDanceSchedule(danceSessionsData)

// The level-columns counterpart of DanceSchedulePage — same date/level-range/GCA
// selectors (useDanceScheduleFilters, shared state/localStorage key with the room-
// columns page, so switching between the two views keeps the same selection), but
// level slots become the grid's columns instead of rooms — see
// docs/design/dance-schedule.md.
export function DanceScheduleLevelsPage() {
  const {
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
    visibleSessions,
  } = useDanceScheduleFilters(
    sessions,
    contentConfig.features.combineA1A2,
    contentConfig.features.combineC3BC4,
  )

  const layout = useMemo(
    () => computeDanceScheduleLevelLayout(visibleSessions, slots, minLevelIndex, maxLevelIndex),
    [visibleSessions, slots, minLevelIndex, maxLevelIndex],
  )

  return (
    <>
      <PageHeader title="Dancing by Level" />
      <DanceScheduleFilters
        dates={dates}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        slots={slots}
        minLevelIndex={minLevelIndex}
        maxLevelIndex={maxLevelIndex}
        onLevelRangeChange={setLevelRange}
        minPresentLevelIndex={minPresentLevelIndex}
        maxPresentLevelIndex={maxPresentLevelIndex}
        showGca={showGca}
        onShowGcaChange={setShowGca}
        hasGcaOnSelectedDate={hasGcaOnSelectedDate}
      />
      <DanceScheduleLevelGrid
        layout={layout}
        showGca={showGca}
        onShowAllLevels={() => setLevelRange(minPresentLevelIndex, maxPresentLevelIndex)}
      />
    </>
  )
}
