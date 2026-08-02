import { groupDanceSessionsByDate } from './groupDanceSessionsByDate'
import { LEVEL_ORDER } from './levelOrder'
import type { DanceSession } from '../types/danceSchedule'

// LEVEL_CODES entries that aren't part of the linear LEVEL_ORDER progression (see
// levelOrder.ts's comment on why the two differ) — shown after it, in this fixed
// order, rather than LEVEL_CODES' own declared order.
const UNORDERED_LEVELS = ['Advanced', 'Intro', 'Various'] as const
const LEVEL_DISPLAY_ORDER: readonly string[] = [...LEVEL_ORDER, ...UNORDERED_LEVELS]

export interface DanceScheduleHourSummaryRow {
  label: string
  // One entry per DanceScheduleHourSummary.dates, in the same order.
  hoursByDate: number[]
  total: number
}

export interface DanceScheduleHourSummary {
  dates: Date[]
  // In LEVEL_DISPLAY_ORDER, omitting any level with zero hours across the whole event.
  levelRows: DanceScheduleHourSummaryRow[]
  // Alphabetical by name, omitting anyone with zero hours (never happens in
  // practice, but keeps the two rows' shapes symmetrical).
  callerRows: DanceScheduleHourSummaryRow[]
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

function toRows(
  totals: Map<string, number[]>,
  compareLabels: (a: string, b: string) => number,
): DanceScheduleHourSummaryRow[] {
  return Array.from(totals.entries())
    .map(([label, hoursByDate]) => ({
      label,
      hoursByDate,
      total: hoursByDate.reduce((sum, hours) => sum + hours, 0),
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => compareLabels(a.label, b.label))
}

/**
 * Computes total scheduled hours per level and per headline caller, per day and
 * overall — shown on the raw debug page/dump, before the full session-by-session
 * listing, as a quick sanity-check summary. Every kind === 'structured' session
 * counts, including a "GCA Caller Showcase Dance" one and one tagged with an
 * unordered level like Intro/Various/Advanced — this is meant to be a complete,
 * honest accounting of the raw parsed data, not a mirror of any page's own curated
 * display rules (contrast the Dance by Caller page, which deliberately omits
 * showcase dances and callers under a dance-count threshold). A freeform session
 * contributes nothing to either summary, having neither a level nor a caller.
 *
 * A session spanning more than one level, or co-taught by more than one caller,
 * splits its duration evenly across the distinct levels/callers it lists (a
 * literal duplicate, e.g. "Vic Ceder & Vic Ceder", counts as one share, not two) —
 * so each summary's own total, across every row, always equals the total
 * structured-session hours scheduled that day, never double- or under-counted.
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
  const levelRows = toRows(
    levelTotals,
    (a, b) => (levelOrderIndex.get(a) ?? Infinity) - (levelOrderIndex.get(b) ?? Infinity),
  )
  const callerRows = toRows(callerTotals, (a, b) => a.localeCompare(b))

  return { dates, levelRows, callerRows }
}
