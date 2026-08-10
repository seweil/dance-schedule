import { parseEventDate } from './parseEventDate'
import { parseTimeRange } from './parseTimeRange'
import {
  LEVEL_CODES,
  DEFAULT_EVENT_TYPE,
  type LevelCode,
  type DanceSessionData,
  type SessionLocation,
} from '../types/danceSchedule'

const WEEKDAY_PREFIX = /^\w+day,?\s+/i
const LEVEL_SEPARATOR = /[&/]/
const GCA_PREFIX = /^GCA:\s*/i
const ROOMS_PREFIX = /^ROOMS:\s*/i
const ROOMS_NONE = 'NONE'
const FREEFORM_PREFIX = '* '
const DITTO_MARKER = '"'

// Any sheet name starting with this prefix is treated as non-schedule content —
// a general escape hatch for notes/utility/summary tabs living alongside the real
// per-day sheets in the same workbook (e.g. scripts/generate-dance-schedule-hour-tabs.ts's
// generated "- Hours by Level"/"- Hours by Caller" tabs), not tied to any specific
// tab name. Every OTHER sheet is still assumed to be a real schedule day and must
// parse as one — parseSheetDate below throws loudly on a genuine mismatch — so
// this prefix is the only way to opt a sheet out of that expectation; a real day
// sheet's own accidentally-unparseable name still fails the build exactly as
// before, since it would never legitimately start with "-".
export const NON_SCHEDULE_SHEET_PREFIX = '-'

export function isNonScheduleSheetName(sheetName: string): boolean {
  return sheetName.startsWith(NON_SCHEDULE_SHEET_PREFIX)
}

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

interface TrailingMetadata {
  mainText: string
  gca?: string
  roomsLine?: string
}

// Pops "GCA:"/"ROOMS:" lines off the end of the cell text, in either order, at most
// one of each — applies uniformly to structured and freeform cells alike (a roomless
// freeform entry like a lunch break is "* Lunch Break" plus a trailing "ROOMS:" line).
function extractTrailingMetadata(trimmed: string): TrailingMetadata {
  const lines = trimmed.split('\n')
  let gca: string | undefined
  let roomsLine: string | undefined

  while (lines.length > 1) {
    const lastLine = lines[lines.length - 1]!.trim()
    if (GCA_PREFIX.test(lastLine)) {
      if (gca !== undefined) {
        throw new Error(`More than one "GCA:" line in ${JSON.stringify(trimmed)}`)
      }
      gca = lastLine.replace(GCA_PREFIX, '').trim()
      lines.pop()
      continue
    }
    if (ROOMS_PREFIX.test(lastLine)) {
      if (roomsLine !== undefined) {
        throw new Error(`More than one "ROOMS:" line in ${JSON.stringify(trimmed)}`)
      }
      roomsLine = lastLine.replace(ROOMS_PREFIX, '').trim()
      lines.pop()
      continue
    }
    break
  }

  return { mainText: lines.join('\n').trim(), gca, roomsLine }
}

// Resolves an explicit "ROOMS:" line into a location — "NONE" means no room at all
// (e.g. a lunch break); otherwise a comma-separated list, validated against the
// sheet's actual rooms and required to include the cell's own room (the list must be
// complete, not "additional rooms besides this one").
function resolveExplicitRooms(
  roomsLine: string,
  ownRoom: string,
  allRooms: string[],
  cellText: string,
): SessionLocation {
  if (roomsLine.toUpperCase() === ROOMS_NONE) {
    return { kind: 'roomless' }
  }

  const rooms = roomsLine
    .split(',')
    .map((room) => room.trim())
    .filter(Boolean)

  if (rooms.length === 0) {
    throw new Error(`"ROOMS:" line has no rooms listed in ${JSON.stringify(cellText)}`)
  }

  for (const room of rooms) {
    if (!allRooms.includes(room)) {
      throw new Error(`"ROOMS:" names unrecognized room ${JSON.stringify(room)} in ${JSON.stringify(cellText)}`)
    }
  }

  if (!rooms.includes(ownRoom)) {
    throw new Error(
      `"ROOMS:" line must include this cell's own room ${JSON.stringify(ownRoom)} in ${JSON.stringify(cellText)}`,
    )
  }

  return { kind: 'located', rooms }
}

interface ParsedCell {
  room: string
  session: DanceSessionData
  hasExplicitRooms: boolean
}

// One already-recorded booking of a caller's or a room's time, for the
// double-booking check below — cellRef/timeRangeRaw are carried along purely so a
// conflict error can point back at the earlier cell, not just state that a conflict
// exists.
interface Booking {
  startTime: Date
  endTime: Date
  cellRef: string
  timeRangeRaw: string
}

// Half-open interval overlap — a session ending exactly when another starts is not
// a conflict (same convention as the lane-assignment overlap check the rendering
// layer uses, see assignLanes.ts).
function overlapsBooking(booking: Booking, startTime: Date, endTime: Date): boolean {
  return booking.startTime < endTime && startTime < booking.endTime
}

// Records a new booking against `key` in `bookings`, returning the first existing
// booking it conflicts with (if any) — checked before the new booking is added, so
// a booking never "conflicts" with itself.
function checkAndRecordBooking(
  bookings: Map<string, Booking[]>,
  key: string,
  startTime: Date,
  endTime: Date,
  cellRef: string,
  timeRangeRaw: string,
): Booking | undefined {
  const existing = bookings.get(key)
  const conflict = existing?.find((booking) => overlapsBooking(booking, startTime, endTime))
  const booking: Booking = { startTime, endTime, cellRef, timeRangeRaw }
  if (existing) {
    existing.push(booking)
  } else {
    bookings.set(key, [booking])
  }
  return conflict
}

function parseCell(
  cellText: string,
  context: { date: Date; startTime: Date; endTime: Date; room: string; allRooms: string[] },
): ParsedCell {
  const trimmed = cellText.trim()
  const { mainText, gca, roomsLine } = extractTrailingMetadata(trimmed)

  const hasExplicitRooms = roomsLine !== undefined
  const location: SessionLocation = hasExplicitRooms
    ? resolveExplicitRooms(roomsLine!, context.room, context.allRooms, trimmed)
    : { kind: 'located', rooms: [context.room] }

  const base = {
    date: context.date.toISOString(),
    startTime: context.startTime.toISOString(),
    endTime: context.endTime.toISOString(),
    location,
  }

  if (mainText.startsWith(FREEFORM_PREFIX)) {
    if (gca !== undefined) {
      throw new Error(`Freeform cell can't have a "GCA:" line in ${JSON.stringify(trimmed)}`)
    }
    return {
      room: context.room,
      hasExplicitRooms,
      session: {
        kind: 'freeform',
        ...base,
        description: mainText.slice(FREEFORM_PREFIX.length).trim(),
      },
    }
  }

  if (mainText.includes('\n')) {
    throw new Error(`Unexpected extra line(s) in ${JSON.stringify(trimmed)}`)
  }

  const colonIndex = mainText.indexOf(':')
  if (colonIndex === -1) {
    throw new Error(
      `Cell doesn't match "Level : Type - Caller" and isn't prefixed with "${FREEFORM_PREFIX}": ${JSON.stringify(trimmed)}`,
    )
  }

  const levelPortion = mainText.slice(0, colonIndex).trim()
  const rest = mainText.slice(colonIndex + 1).trim()

  const levels = levelPortion.split(LEVEL_SEPARATOR).map((level) => level.trim())
  for (const level of levels) {
    if (!isValidLevel(level)) {
      throw new Error(`Unrecognized level code ${JSON.stringify(level)} in ${JSON.stringify(trimmed)}`)
    }
  }

  // A cell may omit the "Type - " portion entirely ("Level : Caller") when the
  // session is just ordinary dancing with nothing more specific to say — the type
  // then defaults to "Dancing", the same string the display layer already treats as
  // the no-op default (see formatSessionEventTypePrefix in formatDanceSession.ts).
  const dashIndex = rest.indexOf(' - ')
  const eventType = dashIndex === -1 ? DEFAULT_EVENT_TYPE : rest.slice(0, dashIndex).trim()
  const callerPortion = dashIndex === -1 ? rest : rest.slice(dashIndex + 3).trim()
  const callers = callerPortion
    .split('&')
    .map((caller) => caller.trim())
    .filter(Boolean)
  if (callers.length === 0) {
    throw new Error(`No caller found in ${JSON.stringify(trimmed)}`)
  }

  return {
    room: context.room,
    hasExplicitRooms,
    session: {
      kind: 'structured',
      ...base,
      levels: levels as LevelCode[],
      eventType,
      callers,
      gca,
    },
  }
}

type CellKind =
  | { type: 'empty' }
  | { type: 'content'; room: string; text: string }
  | { type: 'ditto'; room: string; targetRoomIdx: number }

/**
 * Parses one sheet of the dance-schedule grid: row 0 is room-name headers, each
 * following row is [timeRange, ...cells] with one cell per room (null/empty if that
 * room/time has nothing scheduled). A cell may occupy more than one room (an explicit
 * "ROOMS:" line, or a `"` ditto mark chaining to the content cell immediately to its
 * left) or no room at all ("ROOMS: NONE", e.g. a lunch break) — see
 * docs/design/dance-schedule.md for the full authoring conventions. Returns parsed
 * sessions and any errors — doesn't throw, so a caller can aggregate errors across
 * every sheet in the file before failing the build with the complete list. See
 * parseDanceScheduleSheet.test.ts for the exact cell formats supported (drawn from
 * real spreadsheet examples).
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

  // Rejected up front (rather than left as a literal "undefined"/"null" room name,
  // left untrimmed to silently mismatch a trimmed "ROOMS:" reference to the same
  // room, or left duplicated so `rooms.indexOf()` elsewhere always resolves to the
  // first occurrence) since every downstream pass trusts `rooms` as the sheet's real,
  // unambiguous room list.
  const headerErrors: string[] = []
  const seenRoomColumns = new Map<string, number>()
  const rawHeaderCells = headerRow.slice(1)
  const rooms = rawHeaderCells.map((cell, idx) => {
    const room = cell === null || cell === undefined ? '' : String(cell).trim()
    if (room === '') {
      headerErrors.push(`Sheet "${sheetName}", header cell ${columnLetter(idx + 1)}1: room name is blank`)
      return room
    }
    const firstIdx = seenRoomColumns.get(room)
    if (firstIdx !== undefined) {
      headerErrors.push(
        `Sheet "${sheetName}", header cell ${columnLetter(idx + 1)}1: room ${JSON.stringify(room)} duplicates header cell ${columnLetter(firstIdx + 1)}1`,
      )
      return room
    }
    seenRoomColumns.set(room, idx)
    return room
  })
  if (headerErrors.length > 0) {
    return { sessions, errors: headerErrors }
  }

  const date = parseSheetDate(sheetName, referenceDate)

  // Accumulated across every row of this sheet (a day), keyed by caller name / room
  // name — a real person or room can't be in two places on the same day at
  // overlapping times, whether the conflict is between two different rows or two
  // cells in the same row. Never checked across sheets (different days can't
  // conflict with each other). Scoped to headline callers (`session.callers`), not
  // `gca` — a GCA credit is a subordinate role, not a second place someone is
  // simultaneously calling from.
  const callerBookings = new Map<string, Booking[]>()
  const roomBookings = new Map<string, Booking[]>()

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

    const cellRef = (roomIdx: number) => `${columnLetter(roomIdx + 1)}${excelRow}`
    const rowError = (roomIdx: number, room: string, message: string) => {
      errors.push(
        `Sheet "${sheetName}", cell ${cellRef(roomIdx)} (time "${timeRangeRaw}", room "${room}"): ${message}`,
      )
    }

    // A data row with more filled cells than the header row is wide would otherwise
    // silently never be read (the loops below only ever iterate over `rooms`) — flag
    // it instead of dropping that content with no error.
    row.slice(rooms.length + 1).forEach((raw, extraIdx) => {
      if (raw === null || raw === undefined || raw === '') {
        return
      }
      const roomIdx = rooms.length + extraIdx
      errors.push(
        `Sheet "${sheetName}", cell ${cellRef(roomIdx)} (time "${timeRangeRaw}"): content in a column beyond the header row's ${rooms.length} room(s)`,
      )
    })

    // First pass: classify each room's cell as empty, real content, or a ditto mark
    // chained to the nearest content cell to its left (a blank cell breaks the chain).
    const cellKinds: CellKind[] = []
    let lastContent: { roomIdx: number; room: string } | null = null
    rooms.forEach((room, roomIdx) => {
      const raw = row[roomIdx + 1]
      if (raw === null || raw === undefined || raw === '') {
        cellKinds.push({ type: 'empty' })
        lastContent = null
        return
      }

      const text = String(raw).trim()
      if (text === DITTO_MARKER) {
        if (!lastContent) {
          rowError(roomIdx, room, `Ditto mark (${DITTO_MARKER}) has no content cell to its left`)
          cellKinds.push({ type: 'empty' })
          return
        }
        cellKinds.push({ type: 'ditto', room, targetRoomIdx: lastContent.roomIdx })
        return
      }

      cellKinds.push({ type: 'content', room, text })
      lastContent = { roomIdx, room }
    })

    // Second pass: parse every real content cell.
    const parsed = new Map<number, ParsedCell>()
    cellKinds.forEach((cellKind, roomIdx) => {
      if (cellKind.type !== 'content') {
        return
      }
      try {
        parsed.set(
          roomIdx,
          parseCell(cellKind.text, { date, startTime, endTime, room: cellKind.room, allRooms: rooms }),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        rowError(roomIdx, cellKind.room, message)
      }
    })

    // Third pass: attach ditto cells to their target's room list. A ditto pointing at
    // a cell that already has an explicit "ROOMS:" line is ambiguous (pick one
    // mechanism); a ditto pointing at a cell that itself failed to parse is silently
    // skipped (that cell's own error was already recorded).
    cellKinds.forEach((cellKind, roomIdx) => {
      if (cellKind.type !== 'ditto') {
        return
      }
      const target = parsed.get(cellKind.targetRoomIdx)
      if (!target) {
        return
      }
      if (target.hasExplicitRooms) {
        rowError(
          roomIdx,
          cellKind.room,
          `Ditto mark (${DITTO_MARKER}) points at ${cellRef(cellKind.targetRoomIdx)}, which already has an explicit "ROOMS:" line — use only one mechanism`,
        )
        return
      }
      if (target.session.location.kind !== 'located') {
        return
      }
      target.session.location.rooms.push(cellKind.room)
    })

    // Fourth pass: for an explicit multi-room "ROOMS:" list, every other named room's
    // cell in this row must be genuinely blank — not content, not a ditto. Tracked in
    // `conflictedRoomsThisRow` so the fifth pass's own (more general, cross-row)
    // conflict check doesn't also re-report the exact same same-row clash under a
    // second, redundant message.
    const conflictedRoomsThisRow = new Set<string>()
    parsed.forEach((result, roomIdx) => {
      if (!result.hasExplicitRooms || result.session.location.kind !== 'located') {
        return
      }
      for (const room of result.session.location.rooms) {
        if (room === result.room) {
          continue
        }
        const otherRoomIdx = rooms.indexOf(room)
        if (cellKinds[otherRoomIdx]?.type !== 'empty') {
          rowError(
            roomIdx,
            result.room,
            `"ROOMS:" claims room ${JSON.stringify(room)}, but its cell (${cellRef(otherRoomIdx)}) isn't blank`,
          )
          conflictedRoomsThisRow.add(room)
        }
      }
    })

    // Fifth pass: no caller or room may be booked twice at overlapping times, whether
    // the conflict is with an earlier cell in this same row (identical time, e.g. a
    // copy-paste duplicate) or a cell from an earlier row (an overlapping, not
    // necessarily identical, time range). A room already flagged by the fourth pass
    // is skipped here — same underlying same-row clash, already reported with a more
    // specific message there; everything else (including a cell that has some other,
    // unrelated error) still gets its own conflict check.
    parsed.forEach((result, roomIdx) => {
      const { session } = result
      if (session.kind === 'structured') {
        for (const caller of new Set(session.callers)) {
          const conflict = checkAndRecordBooking(
            callerBookings,
            caller,
            startTime,
            endTime,
            cellRef(roomIdx),
            timeRangeRaw,
          )
          if (conflict) {
            rowError(
              roomIdx,
              result.room,
              `caller ${JSON.stringify(caller)} is already booked in cell ${conflict.cellRef} (time "${conflict.timeRangeRaw}")`,
            )
          }
        }
      }

      if (session.location.kind === 'located') {
        for (const room of session.location.rooms) {
          const conflict = checkAndRecordBooking(
            roomBookings,
            room,
            startTime,
            endTime,
            cellRef(roomIdx),
            timeRangeRaw,
          )
          if (conflict && !conflictedRoomsThisRow.has(room)) {
            rowError(
              roomIdx,
              result.room,
              `room ${JSON.stringify(room)} is already booked in cell ${conflict.cellRef} (time "${conflict.timeRangeRaw}")`,
            )
          }
        }
      }
    })

    parsed.forEach((result) => {
      sessions.push(result.session)
    })
  })

  return { sessions, errors }
}
