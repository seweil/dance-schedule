import type { TimeMark } from './computeDanceScheduleTimeAxis'
import { parseTimeOfDay, type ParsedTimeOfDay } from './parseTimeRange'

// `?now=10:43` (or `2:30pm`, `14:30` — the same forgiving formats the spreadsheet
// accepts, via parseTimeOfDay; a bare hour with no am/pm is 24-hour) pins the
// current-time line to that clock time on whichever date the grid is showing, so
// its look and placement can be checked on any day without faking the device
// clock. Null when absent or unparseable — an invalid value just falls back to the
// real clock rather than breaking the page.
export function parseNowOverride(search: string): ParsedTimeOfDay | null {
  const raw = new URLSearchParams(search).get('now')
  if (!raw) return null
  try {
    return parseTimeOfDay(raw)
  } catch {
    return null
  }
}

/**
 * The override's clock time as a full wall-clock datetime on the grid's own date,
 * or null if it falls outside the grid's labelled range. Tries the first mark's
 * date, then the last mark's — so on a day running past midnight, `?now=0:30`
 * lands on the after-midnight tail rather than missing.
 */
export function nowForOverride(timeMarks: TimeMark[], override: ParsedTimeOfDay): Date | null {
  const first = timeMarks[0]?.time
  const last = timeMarks[timeMarks.length - 1]?.time
  if (!first || !last) return null
  for (const day of [first, last]) {
    const candidate = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), override.hour24, override.minutes),
    )
    if (candidate >= first && candidate <= last) return candidate
  }
  return null
}
