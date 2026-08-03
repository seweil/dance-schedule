import { useMemo } from 'react'
import danceSessionsData from 'virtual:dance-schedule'
import contentConfig from 'virtual:content-config'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { computeDanceScheduleLayout } from '../lib/computeDanceScheduleLayout'
import { useDanceScheduleFilters } from '../hooks/useDanceScheduleFilters'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { DanceScheduleGrid } from './DanceScheduleGrid'
import { PageHeader } from './PageHeader'

// Computed once at module load — the virtual module's data is static, so there's no
// need to re-sort on every filter-driven re-render.
const sessions = buildDanceSchedule(danceSessionsData)

export function DanceSchedulePage() {
  const {
    dates,
    selectedDate,
    setSelectedDate,
    slots,
    minLevelIndex,
    maxLevelIndex,
    setLevelRange,
    showGca,
    setShowGca,
    visibleSessions,
  } = useDanceScheduleFilters(
    sessions,
    contentConfig.features.combineA1A2,
    contentConfig.features.combineC3BC4,
  )

  // `sessions` (every date), not the hook's per-date `dateSessions` — room order is
  // now computed globally, once, so it's identical across every date rather than
  // being derived fresh per date (see deriveRoomOrder.ts).
  const layout = useMemo(
    () => computeDanceScheduleLayout(sessions, visibleSessions, contentConfig.danceSchedule?.roomOrder),
    [visibleSessions],
  )

  return (
    <>
      <PageHeader title="Dance Schedule" />
      <DanceScheduleFilters
        dates={dates}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        slots={slots}
        minLevelIndex={minLevelIndex}
        maxLevelIndex={maxLevelIndex}
        onLevelRangeChange={setLevelRange}
        showGca={showGca}
        onShowGcaChange={setShowGca}
      />
      <DanceScheduleGrid
        layout={layout}
        showGca={showGca}
        onShowAllLevels={() => setLevelRange(0, slots.length - 1)}
      />
    </>
  )
}
