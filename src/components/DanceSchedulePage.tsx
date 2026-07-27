import danceSessionsData from 'virtual:dance-schedule'
import contentConfig from 'virtual:content-config'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { useDanceScheduleFilters } from '../hooks/useDanceScheduleFilters'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { DanceScheduleGrid } from './DanceScheduleGrid'

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
    layout,
  } = useDanceScheduleFilters(sessions, contentConfig.features.combineA1A2)

  return (
    <>
      <h1>Dance Schedule</h1>
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
      <DanceScheduleGrid layout={layout} showGca={showGca} />
    </>
  )
}
