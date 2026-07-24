// The "m" is optional so bare "12:30p"/"9:00a" (no trailing "m" at all) parse the
// same as "12:30pm"/"9:00am" — a real format used in some source spreadsheets.
const TIME_PATTERN = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m?\.?)?$/i
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

// Infers the AM/PM for an ambiguous bare hour (1-12, no meridiem written) by copying
// the known reference time's meridiem, then flipping it if that would violate the
// required chronological relationship to the reference — e.g. inferring a bare start
// hour must land *before* the known end, and a bare end hour must land *after* the
// known start. Shared by both directions of inference in parseTimeRange below.
function inferAmbiguousHour24(
  ambiguous: { rawHour: number; minutes: number },
  reference: { hour24: number; minutes: number },
  requireAfterReference: boolean,
): number {
  const referenceIsPM = reference.hour24 >= 12
  const sameMeridiem = applyMeridiem(ambiguous.rawHour, referenceIsPM)
  const flipped = applyMeridiem(ambiguous.rawHour, !referenceIsPM)

  const referenceTotal = reference.hour24 * 60 + reference.minutes
  const sameMeridiemTotal = sameMeridiem * 60 + ambiguous.minutes
  const sameMeridiemSatisfies = requireAfterReference
    ? sameMeridiemTotal > referenceTotal
    : sameMeridiemTotal < referenceTotal

  return sameMeridiemSatisfies ? sameMeridiem : flipped
}

/**
 * Parses a combined "start time - end time" spreadsheet cell (e.g. "6:00 PM - 7:30 PM",
 * "18:00-19:30", or "6 - 7:30pm") into concrete start/end Date objects on the given
 * calendar date. Does not handle ranges that cross midnight — both times are assumed
 * to fall on the same day, and throws if the resulting start isn't strictly before
 * the end (whether that's from an unresolvable ambiguity or a genuine crossing-
 * midnight range, neither of which this function supports).
 *
 * If one side omits AM/PM and the other specifies it, the ambiguous side's meridiem
 * is inferred from the explicit side (see inferAmbiguousHour24), flipped if the naive
 * copy would violate start-before-end (e.g. "11 - 1pm" infers 11:00 AM, not 11:00 PM;
 * "11:00am - 9" infers 9:00 PM, not 9:00 AM). See parseTimeRange.test.ts for the full
 * set of supported formats and inference cases.
 */
export function parseTimeRange(raw: string, date: Date): { startTime: Date; endTime: Date } {
  const parts = raw.trim().split(RANGE_SEPARATOR)
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Unrecognized time range format: "${raw}"`)
  }

  const [startRaw, endRaw] = parts as [string, string]
  let start = parseTimeOfDay(startRaw)
  let end = parseTimeOfDay(endRaw)

  if (!start.hasMeridiem && end.hasMeridiem && start.rawHour >= 1 && start.rawHour <= 12) {
    const hour24 = inferAmbiguousHour24(start, end, false)
    start = { ...start, hour24, hasMeridiem: true }
  } else if (!end.hasMeridiem && start.hasMeridiem && end.rawHour >= 1 && end.rawHour <= 12) {
    const hour24 = inferAmbiguousHour24(end, start, true)
    end = { ...end, hour24, hasMeridiem: true }
  }

  const startTime = combine(date, start.hour24, start.minutes)
  const endTime = combine(date, end.hour24, end.minutes)

  if (startTime.getTime() >= endTime.getTime()) {
    throw new Error(`Time range's start is not before its end: "${raw}"`)
  }

  return { startTime, endTime }
}
