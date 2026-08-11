import { useMemo } from 'react'
import danceSessionsData from 'virtual:dance-schedule'
import contentConfig from 'virtual:content-config'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { computeDanceScheduleCallerLayout } from '../lib/computeDanceScheduleCallerLayout'
import { useDanceScheduleFilters } from '../hooks/useDanceScheduleFilters'
import { DanceScheduleCallerGrid } from './DanceScheduleCallerGrid'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { PageHeader } from './PageHeader'

// Computed once at module load — the virtual module's data is static, so there's no
// need to re-sort on every filter-driven re-render. A third call to
// buildDanceSchedule (alongside DanceSchedulePage.tsx's and
// DanceScheduleLevelsPage.tsx's own) is cheap and keeps the three pages independent
// modules; the array contents are identical either way.
const sessions = buildDanceSchedule(danceSessionsData)

// The caller-columns counterpart of DanceSchedulePage/DanceScheduleLevelsPage — same
// date/level-range/GCA selectors (useDanceScheduleFilters, shared state/localStorage
// key with the other two pages, so switching between views keeps the same
// selection), but headline callers become the grid's columns instead of rooms or
// levels — see docs/design/dance-schedule.md.
export function DanceScheduleCallersPage() {
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
    dateSessions,
    visibleSessions,
  } = useDanceScheduleFilters(
    sessions,
    contentConfig.features.combineA1A2,
    contentConfig.features.combineC3BC4,
  )

  const layout = useMemo(
    () => computeDanceScheduleCallerLayout(dateSessions, visibleSessions, sessions),
    [dateSessions, visibleSessions],
  )

  return (
    <>
      <PageHeader title="Caller Schedule" />
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
      <DanceScheduleCallerGrid
        layout={layout}
        showGca={showGca}
        onShowAllLevels={() => setLevelRange(minPresentLevelIndex, maxPresentLevelIndex)}
      />
    </>
  )
}
