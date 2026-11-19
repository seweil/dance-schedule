import { useMemo } from 'react'
import danceSessionsData from 'virtual:dance-schedule'
import danceScheduleMeta from 'virtual:dance-schedule-meta'
import contentConfig from 'virtual:content-config'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { computeDanceScheduleCallerLayout } from '../lib/computeDanceScheduleCallerLayout'
import { useDanceScheduleFilters } from '../hooks/useDanceScheduleFilters'
import { DanceScheduleCallerGrid } from './DanceScheduleCallerGrid'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { PageHeader } from './PageHeader'
import { RotateDeviceBanner } from './RotateDeviceBanner'

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
    phaseSlider,
    showAllLevels,
    showGca,
    setShowGca,
    hasGcaOnSelectedDate,
    dateSessions,
    visibleSessions,
  } = useDanceScheduleFilters(
    sessions,
    contentConfig.features.combineA1A2,
    contentConfig.features.combineC3BC4,
    contentConfig.features.combineAdvancedC1,
  )

  const layout = useMemo(
    () =>
      computeDanceScheduleCallerLayout(
        dateSessions,
        visibleSessions,
        contentConfig.danceSchedule?.featuredStaff,
      ),
    [dateSessions, visibleSessions],
  )
  const featuredStaff = contentConfig.danceSchedule?.featuredStaff
  const hasAnythingThisDay = useMemo(
    () =>
      computeDanceScheduleCallerLayout(dateSessions, dateSessions, featuredStaff).placements
        .length > 0,
    [dateSessions, featuredStaff],
  )
  const emptyDayMessage = hasAnythingThisDay
    ? undefined
    : featuredStaff
      ? 'None of the featured staff are scheduled this day.'
      : 'No caller sessions this day.'

  return (
    <>
      <PageHeader title={danceScheduleMeta.staffScheduleLabel} />
      <RotateDeviceBanner />
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
        phases={phaseSlider}
        showGca={showGca}
        onShowGcaChange={setShowGca}
        hasGcaOnSelectedDate={hasGcaOnSelectedDate}
      />
      <DanceScheduleCallerGrid
        layout={layout}
        showGca={showGca}
        onShowAllLevels={showAllLevels}
        emptyDayMessage={emptyDayMessage}
      />
    </>
  )
}
