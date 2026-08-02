import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import danceSessionsData from 'virtual:dance-schedule'
import contentConfig from 'virtual:content-config'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { computeDanceScheduleLayout } from '../lib/computeDanceScheduleLayout'
import { useDanceScheduleFilters } from '../hooks/useDanceScheduleFilters'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { DanceScheduleGrid } from './DanceScheduleGrid'
import styles from './DanceSchedulePage.module.css'
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
    dateSessions,
    visibleSessions,
  } = useDanceScheduleFilters(
    sessions,
    contentConfig.features.combineA1A2,
    contentConfig.features.combineC3BC4,
  )

  const layout = useMemo(
    () => computeDanceScheduleLayout(dateSessions, visibleSessions),
    [dateSessions, visibleSessions],
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
      {/* This page's own data (virtual:dance-schedule) is exactly what the debug
          page renders raw — a react-router Link since /debug/dance-schedule is a
          route within this same build, resolves correctly under whichever
          content set's prefix is currently active. Right-aligned at the very
          bottom, out of the filters/grid's visual flow — a secondary discovery
          path, not a primary control. */}
      <p className={styles.debugLink}>
        <Link to="/debug/dance-schedule">Raw data</Link>
      </p>
    </>
  )
}
