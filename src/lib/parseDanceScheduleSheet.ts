import { parseEventDate } from './parseEventDate'
import { parseTimeRange } from './parseTimeRange'
import { LEVEL_CODES, type LevelCode, type DanceSessionData } from '../types/danceSchedule'

const WEEKDAY_PREFIX = /^\w+day\s+/i
const LEVEL_SEPARATOR = /[&/]/
const GCA_PREFIX = /^GCA:\s*/i
const FREEFORM_PREFIX = '* '

export interface ParseDanceScheduleSheetResult {
  sessions: DanceSessionData[]
  errors: string[]
}

function isValidLevel(value: string): value is LevelCode {
  return (LEVEL_CODES as readonly string[]).includes(value)
}

// Sheet names are like "Thursday July 2" — weekday + month + day, no year. Strip the
// weekday and let parseEventDate's year-inference resolve the rest.
function parseSheetDate(sheetName: string, referenceDate?: Date): Date {
  const withoutWeekday = sheetName.replace(WEEKDAY_PREFIX, '')
  return parseEventDate(withoutWeekday, referenceDate)
}

// 0-based column index -> Excel column letter(s) (0 -> A, 1 -> B, ..., 26 -> AA).
function columnLetter(colIndex: number): string {
  let n = colIndex + 1
  let letters = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

function parseCell(
  cellText: string,
  context: { date: Date; startTime: Date; endTime: Date; room: string },
): DanceSessionData {
  const trimmed = cellText.trim()
  const base = {
    date: context.date.toISOString(),
    startTime: context.startTime.toISOString(),
    endTime: context.endTime.toISOString(),
    room: context.room,
  }

  if (trimmed.startsWith(FREEFORM_PREFIX)) {
    return {
      kind: 'freeform',
      ...base,
      description: trimmed.slice(FREEFORM_PREFIX.length).trim(),
    }
  }

  const colonIndex = trimmed.indexOf(':')
  if (colonIndex === -1) {
    throw new Error(
      `Cell doesn't match "Level : Type - Caller" and isn't prefixed with "${FREEFORM_PREFIX}": ${JSON.stringify(trimmed)}`,
    )
  }

  const levelPortion = trimmed.slice(0, colonIndex).trim()
  const rest = trimmed.slice(colonIndex + 1).trim()

  const levels = levelPortion.split(LEVEL_SEPARATOR).map((level) => level.trim())
  for (const level of levels) {
    if (!isValidLevel(level)) {
      throw new Error(`Unrecognized level code ${JSON.stringify(level)} in ${JSON.stringify(trimmed)}`)
    }
  }

  const lines = rest.split('\n')
  const mainLine = lines[0]?.trim() ?? ''
  const secondLine = lines[1]?.trim()

  if (lines.length > 2) {
    throw new Error(`Unexpected extra line(s) in ${JSON.stringify(trimmed)}`)
  }

  let gca: string | undefined
  if (secondLine !== undefined) {
    if (!GCA_PREFIX.test(secondLine)) {
      throw new Error(
        `Expected a "GCA:" line but found ${JSON.stringify(secondLine)} in ${JSON.stringify(trimmed)}`,
      )
    }
    gca = secondLine.replace(GCA_PREFIX, '').trim()
  }

  const dashIndex = mainLine.indexOf(' - ')
  if (dashIndex === -1) {
    throw new Error(`Cell doesn't match "Type - Caller": ${JSON.stringify(trimmed)}`)
  }
  const eventType = mainLine.slice(0, dashIndex).trim()
  const callerPortion = mainLine.slice(dashIndex + 3).trim()
  const callers = callerPortion
    .split('&')
    .map((caller) => caller.trim())
    .filter(Boolean)
  if (callers.length === 0) {
    throw new Error(`No caller found in ${JSON.stringify(trimmed)}`)
  }

  return {
    kind: 'structured',
    ...base,
    levels: levels as LevelCode[],
    eventType,
    callers,
    gca,
  }
}

/**
 * Parses one sheet of the dance-schedule grid: row 0 is room-name headers, each
 * following row is [timeRange, ...cells] with one cell per room (null/empty if that
 * room/time has nothing scheduled). Returns parsed sessions and any errors — doesn't
 * throw, so a caller can aggregate errors across every sheet in the file before
 * failing the build with the complete list. See parseDanceScheduleSheet.test.ts
 * for the exact cell formats supported (drawn from real spreadsheet examples).
 */
export function parseDanceScheduleSheet(
  sheetName: string,
  rows: unknown[][],
  referenceDate?: Date,
): ParseDanceScheduleSheetResult {
  const [headerRow, ...dataRows] = rows
  const sessions: DanceSessionData[] = []
  const errors: string[] = []

  if (!headerRow) {
    return { sessions, errors: [`Sheet "${sheetName}" has no header row`] }
  }

  const rooms = headerRow.slice(1).map((cell) => String(cell))
  const date = parseSheetDate(sheetName, referenceDate)

  dataRows.forEach((row, rowIdx) => {
    const excelRow = rowIdx + 2 // +1 for the header row, +1 for 1-based Excel rows
    const timeRangeRaw = row[0]
    if (typeof timeRangeRaw !== 'string') {
      errors.push(`Sheet "${sheetName}", row ${excelRow}: missing/invalid time range`)
      return
    }

    let startTime: Date
    let endTime: Date
    try {
      ;({ startTime, endTime } = parseTimeRange(timeRangeRaw, date))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`Sheet "${sheetName}", row ${excelRow}: ${message}`)
      return
    }

    rooms.forEach((room, roomIdx) => {
      const cell = row[roomIdx + 1]
      if (cell === null || cell === undefined || cell === '') {
        return
      }

      try {
        sessions.push(parseCell(String(cell), { date, startTime, endTime, room }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const cellRef = `${columnLetter(roomIdx + 1)}${excelRow}`
        errors.push(
          `Sheet "${sheetName}", cell ${cellRef} (time "${timeRangeRaw}", room "${room}"): ${message}`,
        )
      }
    })
  })

  return { sessions, errors }
}
