import { normalizeLevelCode, isLevelCode } from './levelCodes'
import { LEVEL_ORDER, isOrderedLevel } from './levelOrder'
import { parseEventDate } from './parseEventDate'
import { parseTimeRange } from './parseTimeRange'
import { DEFAULT_EVENT_TYPE } from './recognizedSessionKeywords'
import type { DanceSessionData, LevelCode } from '../types/danceSchedule'

// The `pdf-program-grid` format: a one-page PDF schedule exported from a
// spreadsheet, with programs (MS, Plus, Round Dance, ...) as column groups instead
// of rooms. First seen at the 2027 Oregon Mid-Winter Festival; see
// docs/design/midwinter-festival-2027.md for the real layout and every decision
// below. This module is the pure layout-to-sessions step: the page arrives as
// already-extracted geometry (gridlines + positioned text, top-down page
// coordinates), so it's testable with hand-built grids and has no PDF dependency.
// dance-schedule-parsers/pdfProgramGrid.ts does the PDF reading.

export interface PdfLineSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PdfTextItem {
  text: string
  // Left edge, and the vertical middle of the text — not its baseline — so an item
  // is placed by where it visually sits.
  x: number
  y: number
}

export interface ProgramGridPage {
  // The stroked gridlines only (not cell background fills). Merged cells show up
  // as gridlines that stop short of a column.
  lines: PdfLineSegment[]
  texts: PdfTextItem[]
}

export interface ParseProgramGridOptions {
  // Staff to credit on a session whose own cell names nobody, keyed by program
  // header — e.g. a clogging instructor the PDF never names
  // (config.yaml `danceSchedule.programStaff`).
  programStaff?: Readonly<Record<string, readonly string[]>>
  // One person printed under more than one name, mapped to the name to show
  // ("Mike Kious" → "Michael Kious"; config.yaml `danceSchedule.staffAliases`).
  staffAliases?: Readonly<Record<string, string>>
}

export interface ParseProgramGridResult {
  sessions: DanceSessionData[]
  // sources[i] locates sessions[i] in the PDF, for the shared validator's errors.
  sources: string[]
  errors: string[]
}

// Coordinates come from a PDF renderer's float math; anything within this many
// points is the same position.
const EPSILON = 1.5

const DAY_HEADER = 'day'
const TIMES_HEADER = 'times'

type ColumnRole = 'event' | 'caller' | 'cuer'
const SUB_HEADER_ROLES: Record<string, ColumnRole> = { event: 'event', caller: 'caller', cuer: 'cuer' }

type ProgramKind = { form: 'square'; level: LevelCode } | { form: 'round' } | { form: 'clogging' }

// Program headers spelled out in full, beyond what normalizeLevelCode already
// recognizes ("Plus", "Advanced", ...). Keys are normalizeHeader()ed.
const PROGRAM_HEADERS: Record<string, ProgramKind> = {
  'mainstream - extended application': { form: 'square', level: 'MSX' },
  'relaxed mainstream - standard application': { form: 'square', level: 'MS' },
  'round dance': { form: 'round' },
  'round dancing': { form: 'round' },
  rounds: { form: 'round' },
  clogging: { form: 'clogging' },
}

// Event cells that aren't dancing at all — a photo, a meeting, a showcase to watch.
// Lowercased. Everything else in a square or round column is a dance of some kind,
// its text kept as the event type.
const FREEFORM_EVENTS = new Set([
  'committee picture',
  'ceremonies & 1st tip',
  'education',
  'ordta mtg',
  'state meeting',
  'showcase of rounds',
  'showcase practice',
])

// Event cells that just mean "a dance", the column's own default.
const PLAIN_DANCE_EVENTS = new Set(['dance', 'featured'])

// The one session at a different level from its column: Challenge, scheduled once
// in the Advanced column. Labeled C1, still grouped with Advanced by the level
// slider (docs/design/midwinter-festival-2027.md).
const EVENT_LEVEL_OVERRIDES: Record<string, LevelCode> = { challenge: 'C1' }

// "Intro to Plus" is for the dancers who don't dance Plus yet, so it's filtered at
// the level below the one it names (whatever column it's printed in).
const INTRO_EVENT = /^intro(?:duction)?\s+to\s+(.+)$/i
// Level names an intro might use beyond what normalizeLevelCode recognizes. Keys
// are normalizeHeader()ed. An intro to Advanced is an intro to A1, its first part.
const INTRO_LEVELS: Record<string, LevelCode> = { a: 'A1', advanced: 'A1' }

// A round-dance teach of phase N is for phase N-1 dancers learning it, so it's
// filtered a phase lower. Lowercased.
const TEACH_EVENT = 'teach'

// A slot nobody uses, printed in the grid rather than left blank.
const CLOSED_EVENT = 'closed'

const CO_STAFF_SEPARATOR = '/'
const PHASE_EVENT = /^(?:(.+?)\s+)?ph(?:ase)?\.?\s*([1-6])(?:\s*-\s*([1-6]))?$/i
// A time range written inside a cell, overriding its row's ("9:00-12:00",
// "1:30-4:30 PM"). Minutes are required on the start, so a phase range like
// "Ph 3-5" never matches.
const IN_CELL_TIME = /\b(\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*-\s*\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)(?=\s|$)/i
const HAS_MERIDIEM = /[ap]\.?m/i
const TITLE_DATES = /^([A-Za-z]+)\.?\s+(\d{1,2}(?:\s*,\s*\d{1,2})*)\s*,?\s+(\d{4})$/
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MS_PER_DAY = 24 * 60 * 60 * 1000
const HALF_DAY_MS = MS_PER_DAY / 2

interface Band {
  start: number
  end: number
}

interface ProgramColumn extends Band {
  role: ColumnRole
}

interface Program {
  name: string
  room: string
  kind: ProgramKind
  columns: ProgramColumn[]
}

interface Row extends Band {
  label: string
  // Undefined for an end-of-day marker row ("10:30", "2:00 PM"), which has a time
  // but no range, and so holds no sessions of its own.
  time?: { startTime: Date; endTime: Date }
  date: Date
}

interface Cell {
  role: ColumnRole
  firstRow: number
  lastRow: number
  text: string
}

function normalizeHeader(text: string): string {
  return text.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
}

function isVertical(line: PdfLineSegment): boolean {
  return Math.abs(line.x1 - line.x2) < EPSILON
}

function isHorizontal(line: PdfLineSegment): boolean {
  return Math.abs(line.y1 - line.y2) < EPSILON
}

// Sorted, with positions within EPSILON of each other collapsed into one.
function uniquePositions(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1]! >= EPSILON)
}

function bandsBetween(positions: number[]): Band[] {
  return positions.slice(1).map((end, index) => ({ start: positions[index]!, end }))
}

function contains(band: Band, value: number): boolean {
  return value >= band.start && value < band.end
}

// The y positions of horizontal gridlines that cross x — the row boundaries as
// seen from one column, which differ between columns wherever cells are merged.
function rowBoundariesAt(horizontals: PdfLineSegment[], x: number): number[] {
  return uniquePositions(
    horizontals
      .filter((line) => Math.min(line.x1, line.x2) - EPSILON <= x && x <= Math.max(line.x1, line.x2) + EPSILON)
      .map((line) => line.y1),
  )
}

// Joins a cell's text items into one string: items on the same line left to right,
// lines top to bottom. A line ending in "-" was a word wrapped mid-hyphen
// ("Ron Bell-" + "Roemer"), so the next line continues it with no space.
function joinCellText(items: PdfTextItem[]): string {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: PdfTextItem[][] = []
  for (const item of sorted) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(line[0]!.y - item.y) < EPSILON) {
      line.push(item)
    } else {
      lines.push([item])
    }
  }
  return lines
    .map((line) => line.sort((a, b) => a.x - b.x).map((item) => item.text.trim()).join(' '))
    .reduce((joined, line) => {
      if (joined === '') return line
      return joined.endsWith('-') ? joined + line : `${joined} ${line}`
    }, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitNames(text: string): string[] {
  return text
    .split(CO_STAFF_SEPARATOR)
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

function resolveProgramKind(name: string): ProgramKind | undefined {
  const known = PROGRAM_HEADERS[normalizeHeader(name)]
  if (known) return known
  const level = normalizeLevelCode(name.trim())
  return isLevelCode(level) ? { form: 'square', level } : undefined
}

// "January 29, 30, 31 2027" → those three dates.
function parseTitleDates(text: string): Date[] {
  const match = TITLE_DATES.exec(text.trim())
  if (!match) {
    throw new Error(`expected the event's dates, like "January 29, 30, 31 2027", got ${JSON.stringify(text)}`)
  }
  const [, month, days, year] = match
  return days!.split(',').map((day) => parseEventDate(`${month} ${day!.trim()} ${year}`))
}

// A weekday resolves to the listed date on that weekday, or else to one in the
// week leading up to the first listed date — a pre-event Thursday dance before a
// Friday–Sunday festival, say.
function resolveWeekday(dayText: string, dates: Date[]): Date | undefined {
  const weekday = WEEKDAYS.indexOf(dayText.trim().toLowerCase())
  if (weekday === -1) return undefined
  const listed = dates.find((date) => date.getUTCDay() === weekday)
  if (listed) return listed
  const first = dates[0]!
  for (let daysBefore = 1; daysBefore <= 6; daysBefore++) {
    const candidate = new Date(first.getTime() - daysBefore * MS_PER_DAY)
    if (candidate.getUTCDay() === weekday) return candidate
  }
  return undefined
}

// An in-cell time with no AM/PM written on either side ("7:30-9:30") takes
// whichever of the two readings starts nearest the cell's own row time.
function resolveInCellTime(raw: string, date: Date, near: Date): { startTime: Date; endTime: Date } {
  const parsed = parseTimeRange(raw, date)
  if (HAS_MERIDIEM.test(raw) || parsed.endTime.getTime() + HALF_DAY_MS > date.getTime() + MS_PER_DAY) {
    return parsed
  }
  const shifted = {
    startTime: new Date(parsed.startTime.getTime() + HALF_DAY_MS),
    endTime: new Date(parsed.endTime.getTime() + HALF_DAY_MS),
  }
  const distance = (time: { startTime: Date }) => Math.abs(time.startTime.getTime() - near.getTime())
  return distance(shifted) < distance(parsed) ? shifted : parsed
}

/**
 * Parses one page of a program-grid schedule into sessions. Layout, as the
 * gridlines define it:
 * - Full-height vertical lines bound column groups. The first group holds the row
 *   number, Day and Times columns; every other group is one program, with Event /
 *   Caller / Cuer sub-columns (or a single unlabeled one, e.g. Clogging).
 * - The Day/Times sub-header row is found by its text. Above it are the room row,
 *   then the program-name row; the first group's cells in those rows hold the
 *   event title and its dates ("January 29, 30, 31 2027").
 * - Below it, each band between horizontal lines in the Times column is one row.
 *   Within a program column, a cell spans every row up to the next gridline
 *   crossing that column, so a merged block covers several rows.
 * Format problems are collected in `errors`, never thrown, so one build reports
 * all of them.
 */
export function parseProgramGridPdf(
  page: ProgramGridPage,
  options: ParseProgramGridOptions = {},
): ParseProgramGridResult {
  const sessions: DanceSessionData[] = []
  const sources: string[] = []
  const errors: string[] = []
  const fail = (message: string): ParseProgramGridResult => ({ sessions, sources, errors: [...errors, message] })

  const verticals = page.lines.filter(isVertical)
  const horizontals = page.lines.filter(isHorizontal)
  if (verticals.length === 0 || horizontals.length === 0) {
    return fail('No grid found: the PDF has no table gridlines')
  }

  // Column groups: bounded by the vertical lines that reach the table's top edge.
  const tableTop = Math.min(...verticals.map((line) => Math.min(line.y1, line.y2)))
  const columnEdges = uniquePositions(verticals.map((line) => line.x1))
  const groupEdges = uniquePositions(
    verticals.filter((line) => Math.min(line.y1, line.y2) <= tableTop + EPSILON).map((line) => line.x1),
  )
  const groups = bandsBetween(groupEdges)
  const subColumns = bandsBetween(columnEdges)

  const findText = (label: string) => page.texts.find((item) => normalizeHeader(item.text) === label)
  const dayHeader = findText(DAY_HEADER)
  const timesHeader = findText(TIMES_HEADER)
  if (!dayHeader || !timesHeader) {
    return fail('Expected "Day" and "Times" column headers, but the PDF has no such text')
  }
  const columnAt = (x: number) => subColumns.find((column) => contains(column, x + EPSILON))
  const dayColumn = columnAt(dayHeader.x)
  const timesColumn = columnAt(timesHeader.x)
  const firstGroup = groups[0]
  if (!dayColumn || !timesColumn || !firstGroup || !contains(firstGroup, timesColumn.start + EPSILON)) {
    return fail('The "Day" and "Times" headers must sit in the grid\'s first column group')
  }

  const timesBands = bandsBetween(rowBoundariesAt(horizontals, (timesColumn.start + timesColumn.end) / 2))
  const subHeaderIndex = timesBands.findIndex((band) => contains(band, timesHeader.y))
  if (subHeaderIndex < 2) {
    return fail('Expected a program-name row and a room row above the "Day"/"Times" header row')
  }
  const programBand = timesBands[subHeaderIndex - 2]!
  const roomBand = timesBands[subHeaderIndex - 1]!
  const subHeaderBand = timesBands[subHeaderIndex]!
  const dataBands = timesBands.slice(subHeaderIndex + 1)
  const dataTop = subHeaderBand.end
  const dataBottom = dataBands[dataBands.length - 1]?.end ?? dataTop

  const textsIn = (x: Band, y: Band) =>
    page.texts.filter((item) => contains(x, item.x + EPSILON) && contains(y, item.y))

  let dates: Date[]
  try {
    dates = parseTitleDates(joinCellText(textsIn(firstGroup, roomBand)))
  } catch (error) {
    return fail(`Grid title: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Programs, from the header rows.
  const programs: Program[] = []
  for (const group of groups.slice(1)) {
    const name = joinCellText(textsIn(group, programBand))
    const room = joinCellText(textsIn(group, roomBand))
    const where = `Program header at x=${Math.round(group.start)}`
    if (name === '') {
      errors.push(`${where}: no program name`)
      continue
    }
    const kind = resolveProgramKind(name)
    if (!kind) {
      errors.push(`Program "${name}": unrecognized program — expected a level code or one of ${Object.keys(PROGRAM_HEADERS).join(', ')}`)
      continue
    }
    if (room === '') {
      errors.push(`Program "${name}": no room in the row below its name`)
      continue
    }
    const groupColumns = subColumns.filter((column) => contains(group, column.start + EPSILON))
    const columns: ProgramColumn[] = []
    for (const column of groupColumns) {
      const header = normalizeHeader(joinCellText(textsIn(column, subHeaderBand)))
      const role = header === '' && groupColumns.length === 1 ? 'event' : SUB_HEADER_ROLES[header]
      if (!role) {
        errors.push(`Program "${name}": unrecognized column header ${JSON.stringify(header)} — expected Event, Caller or Cuer`)
        continue
      }
      columns.push({ ...column, role })
    }
    if (!columns.some((column) => column.role === 'event')) {
      errors.push(`Program "${name}": no Event column`)
      continue
    }
    programs.push({ name, room, kind, columns })
  }

  // Rows, from the first group's Times/Day columns.
  const rows: Row[] = []
  for (const band of dataBands) {
    const rowNumber = joinCellText(textsIn({ start: firstGroup.start, end: dayColumn.start }, band))
    const dayText = joinCellText(textsIn(dayColumn, band))
    const timeText = joinCellText(textsIn(timesColumn, band))
    const label = `Row ${rowNumber || rows.length} (${dayText} ${timeText})`
    const date = resolveWeekday(dayText, dates)
    if (!date) {
      errors.push(`${label}: day ${JSON.stringify(dayText)} isn't one of the title's dates or the week before them`)
      continue
    }
    let time: Row['time']
    if (/-/.test(timeText)) {
      try {
        time = parseTimeRange(timeText, date)
      } catch (error) {
        errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
    }
    rows.push({ ...band, label, time, date })
  }

  // Every text item in the data area must land in some cell — a stray one means
  // the layout isn't what this parser understands.
  const claimed = new Set<PdfTextItem>()
  for (const item of page.texts) {
    if (item.y >= dataTop && item.y < dataBottom && contains(firstGroup, item.x + EPSILON)) {
      claimed.add(item)
    }
  }

  // Names that appear in a Cuer column anywhere are cuers, even when written into
  // a Caller cell alongside a caller ("Ted Lizotte/Pam & Jeff Johnson").
  const cellsByProgram = new Map<Program, Cell[]>()
  for (const program of programs) {
    const cells: Cell[] = []
    for (const column of program.columns) {
      const boundaries = rowBoundariesAt(horizontals, (column.start + column.end) / 2).filter(
        (y) => y >= dataTop - EPSILON && y <= dataBottom + EPSILON,
      )
      for (const band of bandsBetween(boundaries)) {
        const items = textsIn(column, band)
        if (items.length === 0) continue
        items.forEach((item) => claimed.add(item))
        const covered = rows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => contains(band, (row.start + row.end) / 2))
        if (covered.length === 0) {
          errors.push(`Program "${program.name}": text ${JSON.stringify(joinCellText(items))} isn't in any row`)
          continue
        }
        cells.push({
          role: column.role,
          firstRow: covered[0]!.index,
          lastRow: covered[covered.length - 1]!.index,
          text: joinCellText(items),
        })
      }
    }
    cellsByProgram.set(program, cells)
  }
  for (const item of page.texts) {
    if (!claimed.has(item) && item.y >= dataTop && item.y < dataBottom) {
      errors.push(`Text ${JSON.stringify(item.text)} at (${Math.round(item.x)}, ${Math.round(item.y)}) isn't in any program's column`)
    }
  }
  const namesIn = (text: string) => splitNames(text).map((name) => options.staffAliases?.[name] ?? name)
  const knownCuers = new Set(
    [...cellsByProgram.values()].flat().filter((cell) => cell.role === 'cuer').flatMap((cell) => namesIn(cell.text)),
  )

  for (const program of programs) {
    // A program's cells that start on the same row form one entry: its event, its
    // caller(s), its cuer(s).
    const entries = new Map<number, Cell[]>()
    for (const cell of cellsByProgram.get(program)!) {
      entries.set(cell.firstRow, [...(entries.get(cell.firstRow) ?? []), cell])
    }
    for (const [firstRow, cells] of [...entries].sort(([a], [b]) => a - b)) {
      const textOf = (role: ColumnRole) =>
        cells
          .filter((cell) => cell.role === role)
          .map((cell) => cell.text)
          .join(' ')
      const lastRow = Math.max(...cells.map((cell) => cell.lastRow))
      const source = `${rows[firstRow]!.label}, ${program.name} (${program.room})`
      const timedRows = rows.slice(firstRow, lastRow + 1).filter((row) => row.time)
      let eventText = textOf('event')
      const callerText = textOf('caller')
      const cuerText = textOf('cuer')

      if (normalizeHeader(eventText) === CLOSED_EVENT && callerText === '' && cuerText === '') {
        continue
      }
      if (timedRows.length === 0) {
        errors.push(`${source}: content in a row with no time range`)
        continue
      }
      const date = timedRows[0]!.date
      if (timedRows.some((row) => row.date.getTime() !== date.getTime())) {
        errors.push(`${source}: a merged cell spans more than one day`)
        continue
      }
      let { startTime } = timedRows[0]!.time!
      let { endTime } = timedRows[timedRows.length - 1]!.time!

      // An in-cell time overrides the rows' — in the Event cell, or in whichever
      // cell carries the text when the Event cell is blank ("State Meeting 9:00-12:00").
      let descriptionText = eventText === '' ? [callerText, cuerText].filter(Boolean).join(': ') : ''
      const timeMatch = IN_CELL_TIME.exec(eventText || descriptionText)
      if (timeMatch) {
        try {
          ;({ startTime, endTime } = resolveInCellTime(timeMatch[1]!, date, startTime))
        } catch (error) {
          errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        const strip = (text: string) => text.replace(timeMatch[0], ' ').replace(/\s+/g, ' ').trim()
        if (eventText) eventText = strip(eventText)
        else descriptionText = strip(descriptionText)
      }

      const base = {
        date: date.toISOString(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        location: { kind: 'located' as const, rooms: [program.room] },
      }
      const eventKey = normalizeHeader(eventText)
      const isFreeform = eventText === '' || FREEFORM_EVENTS.has(eventKey)
      const push = (session: DanceSessionData) => {
        sessions.push(session)
        sources.push(source)
      }

      if (isFreeform) {
        const description = eventText === '' ? descriptionText : [eventText, callerText, cuerText].filter(Boolean).join(': ')
        if (description === '') {
          errors.push(`${source}: cell has only a time range, no description`)
          continue
        }
        push({ kind: 'freeform', ...base, description })
        continue
      }

      const callers: string[] = []
      const cuers = namesIn(cuerText)
      for (const name of namesIn(callerText)) {
        if (knownCuers.has(name)) {
          if (!cuers.includes(name)) cuers.push(name)
        } else {
          callers.push(name)
        }
      }
      if (callers.length === 0) {
        callers.push(...(options.programStaff?.[program.name] ?? []))
      }
      const staff = { callers, ...(cuers.length > 0 ? { cuers } : {}) }

      const { kind } = program
      if (kind.form === 'round') {
        const phaseMatch = PHASE_EVENT.exec(eventText)
        const phases: number[] = []
        let eventType = eventText
        if (phaseMatch) {
          const low = Number(phaseMatch[2])
          const high = Number(phaseMatch[3] ?? phaseMatch[2])
          if (high < low) {
            errors.push(`${source}: phase range ${JSON.stringify(eventText)} runs backwards`)
            continue
          }
          const isTeach = phaseMatch[1]?.toLowerCase() === TEACH_EVENT
          // A phase 1 teach is for newcomers to rounds; there's no phase below it.
          const shift = isTeach && low > 1 ? 1 : 0
          for (let phase = low; phase <= high; phase++) phases.push(phase - shift)
          // A teach keeps the phase it teaches in its name, since its phases now
          // say who it's for.
          eventType = isTeach ? eventText : (phaseMatch[1] ?? DEFAULT_EVENT_TYPE)
        }
        push({ kind: 'structured', ...base, levels: [], eventType, ...staff, danceForm: 'round', phases })
      } else if (kind.form === 'clogging') {
        push({ kind: 'structured', ...base, levels: [], eventType: eventText, ...staff, danceForm: 'clogging' })
      } else {
        let level = EVENT_LEVEL_OVERRIDES[eventKey] ?? kind.level
        const introMatch = INTRO_EVENT.exec(eventText)
        if (introMatch) {
          const target = introMatch[1]!.trim()
          const introduced = INTRO_LEVELS[normalizeHeader(target)] ?? normalizeLevelCode(target)
          const index = isLevelCode(introduced) && isOrderedLevel(introduced) ? LEVEL_ORDER.indexOf(introduced) : -1
          if (index < 1) {
            errors.push(`${source}: ${JSON.stringify(eventText)} doesn't name a level with one below it`)
            continue
          }
          level = LEVEL_ORDER[index - 1]!
        }
        const isPlainDance = PLAIN_DANCE_EVENTS.has(eventKey) || eventKey === normalizeHeader(program.name)
        const eventType = isPlainDance || eventKey === '' ? DEFAULT_EVENT_TYPE : eventText
        push({ kind: 'structured', ...base, levels: [level], eventType, ...staff })
      }
    }
  }

  return { sessions, sources, errors }
}
