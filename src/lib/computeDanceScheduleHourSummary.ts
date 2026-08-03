import { groupDanceSessionsByDate } from './groupDanceSessionsByDate'
import { LEVEL_ORDER } from './levelOrder'
import type { DanceSession } from '../types/danceSchedule'

// LEVEL_CODES entries that aren't part of the linear LEVEL_ORDER progression (see
// levelOrder.ts's comment on why the two differ) — shown after it, in this fixed
// order, rather than LEVEL_CODES' own declared order.
const UNORDERED_LEVELS = ['Advanced', 'Intro', 'Various'] as const
const LEVEL_DISPLAY_ORDER: readonly string[] = [...LEVEL_ORDER, ...UNORDERED_LEVELS]

// A caller only appears in the caller table at all once their OWN total (summed
// across every day) exceeds this many hours — per direct product decision, a
// caller with only a couple hours isn't worth a whole column on this summary. A
// separate, independent threshold of the same name and value exists on the Dance
// by Caller page (computeDanceScheduleCallerLayout.ts) — same unit (hours) and
// number, but the two are computed differently (this one is a global per-event
// total across every day; that one is a per-day total) and not meant to be
// unified into one shared constant.
const MIN_CALLER_HOURS = 3

export interface DanceScheduleHourSummaryColumn {
  label: string
  // One entry per DanceScheduleHourSummary.dates, in the same order.
  hoursByDate: number[]
  total: number
}

// Rendered as a cross-tab with days as rows: `columns` becomes one table column
// each, `totalByDate` is the row-total column at the right (summed across only
// THIS table's own, possibly-filtered columns — the caller table's per-day totals
// reflect just the callers who cleared MIN_CALLER_HOURS, not everyone), and
// `grandTotal` is the single bottom-right cell.
export interface DanceScheduleHourSummaryTable {
  columns: DanceScheduleHourSummaryColumn[]
  totalByDate: number[]
  grandTotal: number
}

export interface DanceScheduleHourSummary {
  dates: Date[]
  // Columns in LEVEL_DISPLAY_ORDER, omitting any level with zero hours across the
  // whole event.
  levels: DanceScheduleHourSummaryTable
  // Columns alphabetical by name, omitting anyone at or under MIN_CALLER_HOURS.
  callers: DanceScheduleHourSummaryTable
}

// Exported for computeDanceScheduleCallerLayout.ts's own, independent
// MIN_CALLER_HOURS threshold — shares this formula so the two can't drift on what
// "an hour of dancing" means, even though the two thresholds themselves are
// computed differently (see MIN_CALLER_HOURS above).
export function sessionHours(session: DanceSession): number {
  return (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60)
}

// Rounds to at most 2 decimal places and drops trailing zeros (e.g. a 3-way split
// of one hour reads as "0.33", not "0.3333333333333333"; a whole number reads as
// "4", not "4.00") — shared by both places this summary renders (the raw debug
// page and the markdown dump) so the two can't drift on formatting.
export function formatHours(hours: number): string {
  return Number(hours.toFixed(2)).toString()
}

function buildTable(
  totals: Map<string, number[]>,
  dateCount: number,
  compareLabels: (a: string, b: string) => number,
  minTotal: number,
): DanceScheduleHourSummaryTable {
  const columns = Array.from(totals.entries())
    .map(([label, hoursByDate]) => ({
      label,
      hoursByDate,
      total: hoursByDate.reduce((sum, hours) => sum + hours, 0),
    }))
    .filter((column) => column.total > minTotal)
    .sort((a, b) => compareLabels(a.label, b.label))

  const totalByDate = new Array<number>(dateCount).fill(0)
  for (const column of columns) {
    for (let dateIndex = 0; dateIndex < dateCount; dateIndex++) {
      totalByDate[dateIndex] = totalByDate[dateIndex]! + column.hoursByDate[dateIndex]!
    }
  }
  const grandTotal = totalByDate.reduce((sum, hours) => sum + hours, 0)

  return { columns, totalByDate, grandTotal }
}

/**
 * Computes total scheduled hours per level and per headline caller, per day and
 * overall — shown on the raw debug page/dump, before the full session-by-session
 * listing, as a quick sanity-check summary (rendered as a cross-tab with days as
 * rows and levels/callers as columns — see DanceScheduleHourSummaryTable). Every
 * kind === 'structured' session counts, including a "GCA Caller Showcase Dance"
 * one and one tagged with an unordered level like Intro/Various/Advanced — this is
 * meant to be a complete, honest accounting of the raw parsed data, not a mirror
 * of any page's own curated display rules (contrast the Dance by Caller page,
 * which deliberately omits showcase dances and callers under a dance-COUNT
 * threshold — this file's own caller table instead filters by total HOURS, a
 * different, unrelated threshold — see MIN_CALLER_HOURS). A freeform session
 * contributes nothing to either summary, having neither a level nor a caller.
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

      const callers = new Set(session.callers)
      const callerShare = hours / callers.size
      for (const caller of callers) {
        addShare(callerTotals, caller, dateIndex, callerShare)
      }
    }
  })

  const levelOrderIndex = new Map(LEVEL_DISPLAY_ORDER.map((level, index) => [level, index]))
  const levels = buildTable(
    levelTotals,
    dates.length,
    (a, b) => (levelOrderIndex.get(a) ?? Infinity) - (levelOrderIndex.get(b) ?? Infinity),
    0,
  )
  const callers = buildTable(callerTotals, dates.length, (a, b) => a.localeCompare(b), MIN_CALLER_HOURS)

  return { dates, levels, callers }
}
