const TIME_PATTERN = /^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i
const RANGE_SEPARATOR = /\s*(?:-|–|—|\bto\b)\s*/i

interface ParsedTimeOfDay {
  hour24: number
  minutes: number
  hasMeridiem: boolean
  // The literal hour digits as written, before AM/PM is resolved — used by the
  // meridiem-inference heuristic below, which needs the pre-resolution value.
  rawHour: number
}

function applyMeridiem(hour12: number, isPM: boolean): number {
  const base = hour12 % 12
  return isPM ? base + 12 : base
}

function parseTimeOfDay(raw: string): ParsedTimeOfDay {
  const trimmed = raw.trim()
  const match = TIME_PATTERN.exec(trimmed)
  if (!match) {
    throw new Error(`Unrecognized time format: "${raw}"`)
  }

  const [, hourStr, minuteStr, meridiem] = match
  const rawHour = Number(hourStr)
  const minutes = minuteStr ? Number(minuteStr) : 0
  if (minutes < 0 || minutes > 59) {
    throw new Error(`Invalid minutes value: "${raw}"`)
  }

  if (meridiem) {
    if (rawHour < 1 || rawHour > 12) {
      throw new Error(`Invalid 12-hour value: "${raw}"`)
    }
    const isPM = meridiem.toLowerCase().startsWith('p')
    return { hour24: applyMeridiem(rawHour, isPM), minutes, hasMeridiem: true, rawHour }
  }

  if (rawHour < 0 || rawHour > 23) {
    throw new Error(`Invalid time value: "${raw}"`)
  }
  return { hour24: rawHour, minutes, hasMeridiem: false, rawHour }
}

function combine(date: Date, hour24: number, minutes: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour24, minutes),
  )
}

/**
 * Parses a combined "start time - end time" spreadsheet cell (e.g. "6:00 PM - 7:30 PM",
 * "18:00-19:30", or "6 - 7:30pm") into concrete start/end Date objects on the given
 * calendar date. Does not handle ranges that cross midnight — both times are assumed
 * to fall on the same day.
 *
 * If the start time omits AM/PM and the end time specifies it, the start's meridiem
 * is inferred from the end's (see applyMeridiem), flipped if that would put the start
 * at or after the end (e.g. "11 - 1pm" infers 11:00 AM, not 11:00 PM). See
 * parseTimeRange.test.ts for the full set of supported formats and inference cases.
 */
export function parseTimeRange(raw: string, date: Date): { startTime: Date; endTime: Date } {
  const parts = raw.trim().split(RANGE_SEPARATOR)
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Unrecognized time range format: "${raw}"`)
  }

  const [startRaw, endRaw] = parts as [string, string]
  const end = parseTimeOfDay(endRaw)
  let start = parseTimeOfDay(startRaw)

  if (!start.hasMeridiem && end.hasMeridiem && start.rawHour >= 1 && start.rawHour <= 12) {
    const endIsPM = end.hour24 >= 12
    const sameMeridiem = applyMeridiem(start.rawHour, endIsPM)
    const flipped = applyMeridiem(start.rawHour, !endIsPM)
    const endMinutesSinceMidnight = end.hour24 * 60 + end.minutes
    const sameMeridiemMinutesSinceMidnight = sameMeridiem * 60 + start.minutes
    const inferredHour24 =
      sameMeridiemMinutesSinceMidnight >= endMinutesSinceMidnight ? flipped : sameMeridiem
    start = { ...start, hour24: inferredHour24, hasMeridiem: true }
  }

  return {
    startTime: combine(date, start.hour24, start.minutes),
    endTime: combine(date, end.hour24, end.minutes),
  }
}
