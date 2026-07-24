const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/
const SLASH_DATE_NO_YEAR = /^(\d{1,2})\/(\d{1,2})$/
const LONG_DATE = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/
const LONG_DATE_NO_YEAR = /^([A-Za-z]+)\.?\s+(\d{1,2})$/

// Windows Excel's epoch, accounting for its (deliberate, historical) 1900 leap-year bug.
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 24 * 60 * 60 * 1000
const SIX_MONTHS_MS = MS_PER_DAY * 30 * 6

function resolveMonthName(name: string): number {
  const month = MONTH_NAMES[name.toLowerCase()]
  if (month === undefined) {
    throw new Error(`Unrecognized month name: "${name}"`)
  }
  return month
}

function normalizeYear(rawYear: string): number {
  if (rawYear.length === 4) {
    return Number(rawYear)
  }
  return 2000 + Number(rawYear)
}

// Assumes the current year (relative to referenceDate); if that produces a date more
// than ~6 months in the past, assumes next year instead — handles the year-boundary
// case (e.g. building in December for a January event) without rolling forward
// recently-past events, which we still want to show.
function inferYear(month: number, day: number, referenceDate: Date): Date {
  const currentYear = referenceDate.getUTCFullYear()
  const candidate = new Date(Date.UTC(currentYear, month, day))
  if (referenceDate.getTime() - candidate.getTime() > SIX_MONTHS_MS) {
    return new Date(Date.UTC(currentYear + 1, month, day))
  }
  return candidate
}

/**
 * Normalizes a spreadsheet "Date" cell value into a calendar date (UTC midnight).
 * Accepts a native Date (already Excel-date-formatted), an Excel serial number, or
 * a string in any of several supported formats — see parseEventDate.test.ts for the
 * full list of examples. Throws if the value doesn't match any recognized format.
 */
export function parseEventDate(value: unknown, referenceDate: Date = new Date()): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  }

  if (typeof value === 'number') {
    return new Date(EXCEL_EPOCH_UTC_MS + value * MS_PER_DAY)
  }

  if (typeof value !== 'string') {
    throw new Error(`Unrecognized date value: ${JSON.stringify(value)}`)
  }

  const trimmed = value.trim()

  const isoMatch = ISO_DATE.exec(trimmed)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  }

  const slashMatch = SLASH_DATE.exec(trimmed)
  if (slashMatch) {
    const [, month, day, year] = slashMatch
    return new Date(Date.UTC(normalizeYear(year!), Number(month) - 1, Number(day)))
  }

  const longMatch = LONG_DATE.exec(trimmed)
  if (longMatch) {
    const [, monthName, day, year] = longMatch
    return new Date(Date.UTC(Number(year), resolveMonthName(monthName!), Number(day)))
  }

  const slashNoYearMatch = SLASH_DATE_NO_YEAR.exec(trimmed)
  if (slashNoYearMatch) {
    const [, month, day] = slashNoYearMatch
    return inferYear(Number(month) - 1, Number(day), referenceDate)
  }

  const longNoYearMatch = LONG_DATE_NO_YEAR.exec(trimmed)
  if (longNoYearMatch) {
    const [, monthName, day] = longNoYearMatch
    return inferYear(resolveMonthName(monthName!), Number(day), referenceDate)
  }

  throw new Error(`Unrecognized date format: "${value}"`)
}
