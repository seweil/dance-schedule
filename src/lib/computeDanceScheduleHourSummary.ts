import { groupDanceSessionsByDate } from './groupDanceSessionsByDate'
import { LEVEL_ORDER } from './levelOrder'
import { GCA_CALLER_SHOWCASE_EVENT_TYPE } from './recognizedSessionKeywords'
import type { DanceSession } from '../types/danceSchedule'

// LEVEL_CODES entries that aren't part of the linear LEVEL_ORDER progression (see
// levelOrder.ts's comment on why the two differ) — shown after it, in this fixed
// order, rather than LEVEL_CODES' own declared order. "Advanced" isn't in this list —
// it isn't a real LevelCode at all, normalized to A2 at parse time.
const UNORDERED_LEVELS = ['Intro', 'Various'] as const
const LEVEL_DISPLAY_ORDER: readonly string[] = [...LEVEL_ORDER, ...UNORDERED_LEVELS]

// A caller only appears in the caller table at all once their OWN total (summed
// across every day) exceeds this many hours — per direct product decision, a
// caller with only a couple hours isn't worth a whole column on this summary. The
// Dance by Caller page (computeDanceScheduleCallerLayout.ts) used to have its own,
// separate threshold of the same name and value, but that one was removed — every
// real caller gets a column there now regardless of hours (see that file's own
// comment for why); this one is unaffected, and still gates only this summary
// table.
const MIN_CALLER_HOURS = 3

// Label for the caller table's own rolled-up bucket for every caller filtered out
// by MIN_CALLER_HOURS — see buildTable's own comment for why this exists.
const OTHER_CALLERS_LABEL = 'Other'

export interface DanceScheduleHourSummaryColumn {
  label: string
  // One entry per DanceScheduleHourSummary.dates, in the same order.
  hoursByDate: number[]
  total: number
}

// Rendered as a cross-tab with days as rows: `columns` becomes one table column
// each, `totalByDate` is the row-total column at the right, and `grandTotal` is
// the single bottom-right cell. `totalByDate`/`grandTotal` are always summed
// across EVERY caller/level with any measured hours, not just the ones shown as
// their own column — see buildTable's own comment: the caller table's own
// "Other" column (below MIN_CALLER_HOURS) is what visibly accounts for the
// difference, so both tables' day totals always agree instead of the caller
// table's silently running lower.
export interface DanceScheduleHourSummaryTable {
  columns: DanceScheduleHourSummaryColumn[]
  totalByDate: number[]
  grandTotal: number
  // Index into `columns` separating a leading "headline" group (anyone with at
  // least one non-GCA-showcase session) from a trailing "GCA showcase only" group
  // (everyone left, whose entire credited total came from GCA_CALLER_SHOWCASE_EVENT_TYPE
  // sessions) — only set on the caller table, and only when both groups are
  // non-empty (nothing to separate otherwise).
  groupBoundary?: number
}

export interface DanceScheduleHourSummary {
  dates: Date[]
  // Columns in LEVEL_DISPLAY_ORDER, omitting any level with zero hours across the
  // whole event.
  levels: DanceScheduleHourSummaryTable
  // Columns grouped headline-first, each group sorted by descending total hours
  // (ties broken alphabetically) — see DanceScheduleHourSummaryTable's
  // `groupBoundary`. A caller at or under MIN_CALLER_HOURS doesn't get their own
  // column, but their hours still land in a trailing "Other" column (see
  // buildTable) rather than vanishing from the table's totals.
  callers: DanceScheduleHourSummaryTable
}

function sessionHours(session: DanceSession): number {
  return (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60)
}

// Rounds to at most 2 decimal places and drops trailing zeros (e.g. a 3-way split
// of one hour reads as "0.33", not "0.3333333333333333"; a whole number reads as
// "4", not "4.00") — shared by both places this summary renders (the raw debug
// page and the markdown dump) so the two can't drift on formatting.
export function formatHours(hours: number): string {
  return Number(hours.toFixed(2)).toString()
}

// A column filtered out by `minTotal` (the caller table's MIN_CALLER_HOURS floor
// — the level table passes 0, which every real level clears by construction, so
// it never has anything to roll up here) used to just vanish, taking its hours
// with it — leaving the caller table's own totalByDate/grandTotal lower than the
// level table's for the same day, even though both are meant to describe the
// same underlying schedule. Every excluded column's hours are now summed
// per-date into `excludedHoursByDate` instead, so the caller (this file's own
// computeDanceScheduleHourSummary) can roll them into one trailing "Other"
// column — keeping every filtered-out caller's hours visibly accounted for
// rather than silently dropped, while `totalByDate`/`grandTotal` here already
// include them regardless of whether the caller adds that column.
function buildTable(
  totals: Map<string, number[]>,
  dateCount: number,
  compare: (a: DanceScheduleHourSummaryColumn, b: DanceScheduleHourSummaryColumn) => number,
  minTotal: number,
): DanceScheduleHourSummaryTable & { excludedHoursByDate: number[] } {
  const allColumns = Array.from(totals.entries()).map(([label, hoursByDate]) => ({
    label,
    hoursByDate,
    total: hoursByDate.reduce((sum, hours) => sum + hours, 0),
  }))
  const columns = allColumns.filter((column) => column.total > minTotal).sort(compare)
  const excludedColumns = allColumns.filter((column) => column.total <= minTotal)

  const totalByDate = new Array<number>(dateCount).fill(0)
  for (const column of allColumns) {
    for (let dateIndex = 0; dateIndex < dateCount; dateIndex++) {
      totalByDate[dateIndex] = totalByDate[dateIndex]! + column.hoursByDate[dateIndex]!
    }
  }
  const grandTotal = totalByDate.reduce((sum, hours) => sum + hours, 0)

  const excludedHoursByDate = new Array<number>(dateCount).fill(0)
  for (const column of excludedColumns) {
    for (let dateIndex = 0; dateIndex < dateCount; dateIndex++) {
      excludedHoursByDate[dateIndex] = excludedHoursByDate[dateIndex]! + column.hoursByDate[dateIndex]!
    }
  }

  return { columns, totalByDate, grandTotal, excludedHoursByDate }
}

/**
 * Computes total scheduled hours per level and per headline caller, per day and
 * overall — shown on the raw debug page/dump, before the full session-by-session
 * listing, as a quick sanity-check summary (rendered as a cross-tab with days as
 * rows and levels/callers as columns — see DanceScheduleHourSummaryTable). Every
 * kind === 'structured' session counts, including a "GCA Caller Showcase Dance"
 * one and one tagged with an unordered level like Intro/Various — this is
 * meant to be a complete, honest accounting of the raw parsed data, not a mirror
 * of any page's own curated display rules (contrast the Caller Schedule page,
 * which deliberately omits showcase dances entirely — this file's own caller
 * table still counts them, just filtered by this file's own, independent
 * MIN_CALLER_HOURS floor). A freeform session contributes nothing to either
 * summary, having neither a level nor a caller.
 *
 * A session spanning more than one level, or co-taught by more than one caller,
 * splits its duration evenly across the distinct levels/callers it lists (a
 * literal duplicate, e.g. "Vic Ceder & Vic Ceder", counts as one share, not two) —
 * so each table's own grand total always equals the total structured-session
 * hours scheduled, never double- or under-counted (modulo whichever callers the
 * hour threshold excludes).
 */
export function computeDanceScheduleHourSummary(sessions: DanceSession[]): DanceScheduleHourSummary {
  const groups = groupDanceSessionsByDate(sessions)
  const dates = groups.map((group) => group.date)

  const levelTotals = new Map<string, number[]>()
  const callerTotals = new Map<string, number[]>()
  // Per caller name, whether at least one of their credited sessions is NOT a GCA
  // showcase slot — see GCA_CALLER_SHOWCASE_EVENT_TYPE and `groupBoundary`. A
  // caller who both headlines and does a showcase slot still counts as headline;
  // their showcase hours aren't excluded from their total, just from this flag.
  const callerHasHeadlineHours = new Map<string, boolean>()

  const addShare = (totals: Map<string, number[]>, label: string, dateIndex: number, hours: number) => {
    const perDate = totals.get(label) ?? new Array<number>(dates.length).fill(0)
    perDate[dateIndex] = perDate[dateIndex]! + hours
    totals.set(label, perDate)
  }

  groups.forEach((group, dateIndex) => {
    for (const session of group.sessions) {
      if (session.kind !== 'structured') {
        continue
      }
      const hours = sessionHours(session)

      const levels = new Set(session.levels)
      const levelShare = hours / levels.size
      for (const level of levels) {
        addShare(levelTotals, level, dateIndex, levelShare)
      }

      const isShowcase = session.eventType === GCA_CALLER_SHOWCASE_EVENT_TYPE
      const callers = new Set(session.callers)
      const callerShare = hours / callers.size
      for (const caller of callers) {
        addShare(callerTotals, caller, dateIndex, callerShare)
        callerHasHeadlineHours.set(caller, (callerHasHeadlineHours.get(caller) ?? false) || !isShowcase)
      }
    }
  })

  const levelOrderIndex = new Map(LEVEL_DISPLAY_ORDER.map((level, index) => [level, index]))
  const levelsResult = buildTable(
    levelTotals,
    dates.length,
    (a, b) => (levelOrderIndex.get(a.label) ?? Infinity) - (levelOrderIndex.get(b.label) ?? Infinity),
    0,
  )
  // Rebuilt without buildTable's internal-only `excludedHoursByDate` — the level
  // table has no floor to roll anyone up from (minTotal 0 above), so it's always
  // all-zero anyway, but this field is never meant to be part of the public
  // DanceScheduleHourSummaryTable shape (contrast `callers` below, which uses its
  // own excludedHoursByDate to build the "Other" column before being rebuilt the
  // same way).
  const levels: DanceScheduleHourSummaryTable = {
    columns: levelsResult.columns,
    totalByDate: levelsResult.totalByDate,
    grandTotal: levelsResult.grandTotal,
  }
  const callers = buildTable(
    callerTotals,
    dates.length,
    (a, b) => {
      const aHeadline = callerHasHeadlineHours.get(a.label) ?? false
      const bHeadline = callerHasHeadlineHours.get(b.label) ?? false
      if (aHeadline !== bHeadline) {
        return aHeadline ? -1 : 1
      }
      return b.total - a.total || a.label.localeCompare(b.label)
    },
    MIN_CALLER_HOURS,
  )
  // Computed against callers.columns BEFORE the "Other" column (below) is
  // appended — "Other" is never a real headline/showcase caller, so it must
  // never be mistaken for (or shift) the showcase-only group's own boundary.
  const groupBoundary = callers.columns.findIndex((column) => !(callerHasHeadlineHours.get(column.label) ?? false))

  // Every caller filtered out of `callers.columns` by MIN_CALLER_HOURS still has
  // their hours counted in `callers.excludedHoursByDate` (see buildTable) —
  // rolled up into one trailing "Other" column here, rather than just leaving
  // them absorbed into totalByDate/grandTotal with no column to show for it.
  // Omitted entirely when there's nothing to roll up (every caller cleared the
  // floor), same as a level with zero hours is omitted entirely above.
  const otherTotal = callers.excludedHoursByDate.reduce((sum, hours) => sum + hours, 0)
  const callerColumns =
    otherTotal > 0
      ? [
          ...callers.columns,
          { label: OTHER_CALLERS_LABEL, hoursByDate: callers.excludedHoursByDate, total: otherTotal },
        ]
      : callers.columns

  return {
    dates,
    levels,
    callers: {
      columns: callerColumns,
      totalByDate: callers.totalByDate,
      grandTotal: callers.grandTotal,
      ...(groupBoundary > 0 && groupBoundary < callers.columns.length ? { groupBoundary } : {}),
    },
  }
}
