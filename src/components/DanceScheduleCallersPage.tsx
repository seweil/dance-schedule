import { useId, useMemo } from 'react'
import danceSessionsData from 'virtual:dance-schedule'
import danceScheduleMeta from 'virtual:dance-schedule-meta'
import contentConfig from 'virtual:content-config'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { computeDanceScheduleCallerLayout, listPickableStaff } from '../lib/computeDanceScheduleCallerLayout'
import { useDanceScheduleFilters } from '../hooks/useDanceScheduleFilters'
import { useDismissableMenu } from '../hooks/useDismissableMenu'
import { useExtraStaff } from '../hooks/useExtraStaff'
import { DanceScheduleCallerGrid } from './DanceScheduleCallerGrid'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { PageHeader } from './PageHeader'
import { RotateDeviceBanner } from './RotateDeviceBanner'
import { StaffPickerPanel, StaffPickerToggle } from './StaffPicker'

// Computed once at module load — the virtual module's data is static, so there's no
// need to re-sort on every filter-driven re-render. A third call to
// buildDanceSchedule (alongside DanceSchedulePage.tsx's and
// DanceScheduleLevelsPage.tsx's own) is cheap and keeps the three pages independent
// modules; the array contents are identical either way.
const sessions = buildDanceSchedule(danceSessionsData)

const featuredStaff = contentConfig.danceSchedule?.featuredStaff

// The caller-columns counterpart of DanceSchedulePage/DanceScheduleLevelsPage — same
// date/level-range/GCA selectors (useDanceScheduleFilters, shared state/localStorage
// key with the other two pages, so switching between views keeps the same
// selection), but headline callers become the grid's columns instead of rooms or
// levels — see docs/design/dance-schedule.md.
//
// At an event with a featuredStaff list, the columns are the featured staff, then
// any callers and cuers the viewer added with "Show more staff" (StaffPicker.tsx),
// as three groups with a divider between each.
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
  const { extraStaff, setExtraStaff } = useExtraStaff()
  // The "Show more staff" button and its panel are placed apart (StaffPicker.tsx),
  // so their shared open state lives here.
  const {
    isOpen: staffPickerOpen,
    toggle: toggleStaffPicker,
    rootRef: staffPickerRootRef,
    toggleRef: staffPickerToggleRef,
    portalRef: staffPickerPanelRef,
  } = useDismissableMenu<HTMLSpanElement, HTMLButtonElement, HTMLDivElement>()
  const staffPickerPanelId = useId()

  const pickable = useMemo(
    () => (featuredStaff ? listPickableStaff(dateSessions, featuredStaff) : undefined),
    [dateSessions],
  )
  const staffGroups = useMemo(
    () =>
      featuredStaff && pickable
        ? [
            featuredStaff,
            pickable.callers.filter((name) => extraStaff.includes(name)),
            pickable.cuers.filter((name) => extraStaff.includes(name)),
          ]
        : undefined,
    [pickable, extraStaff],
  )

  const layout = useMemo(
    () => computeDanceScheduleCallerLayout(dateSessions, visibleSessions, staffGroups),
    [dateSessions, visibleSessions, staffGroups],
  )
  const hasAnythingThisDay = useMemo(
    () => computeDanceScheduleCallerLayout(dateSessions, dateSessions, staffGroups).placements.length > 0,
    [dateSessions, staffGroups],
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
        extraControl={
          pickable && (
            <StaffPickerToggle
              isOpen={staffPickerOpen}
              onToggle={toggleStaffPicker}
              panelId={staffPickerPanelId}
              rootRef={staffPickerRootRef}
              toggleRef={staffPickerToggleRef}
              callers={pickable.callers}
              cuers={pickable.cuers}
              selected={extraStaff}
            />
          )
        }
      />
      {pickable && (
        <StaffPickerPanel
          isOpen={staffPickerOpen}
          panelId={staffPickerPanelId}
          panelRef={staffPickerPanelRef}
          callers={pickable.callers}
          cuers={pickable.cuers}
          selected={extraStaff}
          onChange={setExtraStaff}
        />
      )}
      <DanceScheduleCallerGrid
        layout={layout}
        showGca={showGca}
        onShowAllLevels={showAllLevels}
        emptyDayMessage={emptyDayMessage}
      />
    </>
  )
}
