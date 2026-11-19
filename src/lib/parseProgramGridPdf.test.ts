import { describe, expect, it } from 'vitest'
import { parseProgramGridPdf, type PdfLineSegment, type PdfTextItem, type ProgramGridPage } from './parseProgramGridPdf'
import type { DanceSessionData } from '../types/danceSchedule'

// Builds a synthetic page with the real PDF's layout (see
// docs/design/midwinter-festival-2027.md): a first group of #/Day/Times columns,
// then one group per program; a program-name row, a room row and a sub-header row;
// then one data row per entry in `rows`. Gridlines are drawn the way the real
// export draws them — full-height lines between groups, sub-column lines from the
// sub-header row down, and per-column row lines omitted inside a merged cell.
interface GridSpec {
  dates?: string
  programs: { name: string; room: string; columns: string[] }[]
  rows: { day: string; time: string }[]
  // `column` is the sub-column's header ('Event', ...) or '' for an unlabeled one;
  // `text` lines are separated by "\n".
  cells: { program: string; column: string; row: number; text: string; rowSpan?: number }[]
  extraTexts?: PdfTextItem[]
}

const COLUMN_WIDTH = 100
const ROW_HEIGHT = 20
const HEADER_ROWS = 3

function buildPage(spec: GridSpec): ProgramGridPage {
  const lines: PdfLineSegment[] = []
  const texts: PdfTextItem[] = []
  const text = (value: string, x: number, y: number) => texts.push({ text: value, x, y })

  const firstGroup = ['#', 'Day', 'Times']
  const columnOwners: { program?: string; header: string }[] = [
    ...firstGroup.map((header) => ({ header })),
    ...spec.programs.flatMap((program) => program.columns.map((header) => ({ program: program.name, header }))),
  ]
  const bottom = (HEADER_ROWS + spec.rows.length) * ROW_HEIGHT
  const rowTop = (row: number) => (HEADER_ROWS + row) * ROW_HEIGHT

  // Vertical lines: a group edge runs the full height; any other runs from the
  // sub-header row down.
  const groupStarts = new Set<number>([0])
  let index = firstGroup.length
  for (const program of spec.programs) {
    groupStarts.add(index)
    index += program.columns.length
  }
  for (let column = 0; column <= columnOwners.length; column++) {
    const top = groupStarts.has(column) || column === columnOwners.length ? 0 : 2 * ROW_HEIGHT
    lines.push({ x1: column * COLUMN_WIDTH, y1: top, x2: column * COLUMN_WIDTH, y2: bottom })
  }

  // Horizontal lines, per column, skipping boundaries inside a merged cell.
  const mergedInside = (column: number, boundaryRow: number) =>
    spec.cells.some((cell) => {
      const owner = columnOwners[column]!
      return (
        owner.program === cell.program &&
        owner.header === cell.column &&
        boundaryRow > cell.row &&
        boundaryRow < cell.row + (cell.rowSpan ?? 1)
      )
    })
  for (let boundary = 0; boundary <= HEADER_ROWS + spec.rows.length; boundary++) {
    for (let column = 0; column < columnOwners.length; column++) {
      if (boundary > HEADER_ROWS && mergedInside(column, boundary - HEADER_ROWS)) continue
      const y = boundary * ROW_HEIGHT
      lines.push({ x1: column * COLUMN_WIDTH, y1: y, x2: (column + 1) * COLUMN_WIDTH, y2: y })
    }
  }

  // Header text.
  text('Festival Title', 5, ROW_HEIGHT / 2)
  text(spec.dates ?? 'January 29, 30, 31 2027', 5, ROW_HEIGHT * 1.5)
  firstGroup.forEach((header, column) => {
    if (header !== '#') text(header, column * COLUMN_WIDTH + 5, ROW_HEIGHT * 2.5)
  })
  columnOwners.forEach((owner, column) => {
    if (owner.program && owner.header) text(owner.header, column * COLUMN_WIDTH + 5, ROW_HEIGHT * 2.5)
  })
  let start = firstGroup.length
  for (const program of spec.programs) {
    text(program.name, start * COLUMN_WIDTH + 5, ROW_HEIGHT / 2)
    text(program.room, start * COLUMN_WIDTH + 5, ROW_HEIGHT * 1.5)
    start += program.columns.length
  }

  // Row and cell text.
  spec.rows.forEach((row, rowIndex) => {
    const y = rowTop(rowIndex) + ROW_HEIGHT / 2
    text(String(rowIndex), 5, y)
    text(row.day, COLUMN_WIDTH + 5, y)
    text(row.time, 2 * COLUMN_WIDTH + 5, y)
  })
  for (const cell of spec.cells) {
    const column = columnOwners.findIndex((owner) => owner.program === cell.program && owner.header === cell.column)
    if (column === -1) throw new Error(`No column ${cell.column} in ${cell.program}`)
    cell.text.split('\n').forEach((line, lineIndex) => {
      text(line, column * COLUMN_WIDTH + 5, rowTop(cell.row) + 4 + lineIndex * 6)
    })
  }
  texts.push(...(spec.extraTexts ?? []))
  return { lines, texts }
}

const MS_EXT = { name: 'MainStream - Extended Application', room: 'Hall A', columns: ['Event', 'Caller', 'Cuer'] }
const PLUS = { name: 'Plus', room: 'Hall C', columns: ['Event', 'Caller', 'Cuer'] }
const ROUNDS = { name: 'Round Dance', room: 'Room 3/4', columns: ['Event', 'Cuer'] }
const CLOGGING = { name: 'Clogging', room: 'Comfort Suites', columns: [''] }

function parse(spec: GridSpec, options = {}) {
  return parseProgramGridPdf(buildPage(spec), options)
}

function only(spec: GridSpec): DanceSessionData {
  const { sessions, errors } = parse(spec)
  expect(errors).toEqual([])
  expect(sessions).toHaveLength(1)
  return sessions[0]!
}

describe('parseProgramGridPdf', () => {
  it('parses a dance with its caller and cuer, its level from the program column', () => {
    const session = only({
      programs: [MS_EXT],
      rows: [{ day: 'Friday', time: '1:00-2:00 PM' }],
      cells: [
        { program: MS_EXT.name, column: 'Event', row: 0, text: 'Dance' },
        { program: MS_EXT.name, column: 'Caller', row: 0, text: 'Melissa James' },
        { program: MS_EXT.name, column: 'Cuer', row: 0, text: 'Judy Russell' },
      ],
    })
    expect(session).toEqual({
      kind: 'structured',
      date: '2027-01-29T00:00:00.000Z',
      startTime: '2027-01-29T13:00:00.000Z',
      endTime: '2027-01-29T14:00:00.000Z',
      location: { kind: 'located', rooms: ['Hall A'] },
      levels: ['MSX'],
      eventType: 'Dancing',
      callers: ['Melissa James'],
      cuers: ['Judy Russell'],
    })
  })

  it('labels each session with its row, day, time and program', () => {
    const { sources } = parse({
      programs: [PLUS],
      rows: [{ day: 'Saturday', time: '10:00-11:00 AM' }],
      cells: [{ program: PLUS.name, column: 'Event', row: 0, text: 'Dance' }],
    })
    expect(sources).toEqual(['Row 0 (Saturday 10:00-11:00 AM), Plus (Hall C)'])
  })

  it.each([
    ['"11:00-12:00 PM" as 11 AM to noon', '11:00-12:00 PM', '11:00', '12:00'],
    ['"12:00-1:00 PM" as noon to 1 PM', '12:00-1:00 PM', '12:00', '13:00'],
    ['a zero-padded evening range', '07:30-10:30 PM', '19:30', '22:30'],
  ])('reads %s', (_label, time, start, end) => {
    const session = only({
      programs: [PLUS],
      rows: [{ day: 'Friday', time }],
      cells: [{ program: PLUS.name, column: 'Event', row: 0, text: 'Dance' }],
    })
    expect(session.startTime).toBe(`2027-01-29T${start}:00.000Z`)
    expect(session.endTime).toBe(`2027-01-29T${end}:00.000Z`)
  })

  it('dates a weekday before the listed dates to the week leading up to them', () => {
    const session = only({
      programs: [MS_EXT],
      rows: [{ day: 'Thursday', time: '07:30-10:30 PM' }],
      cells: [{ program: MS_EXT.name, column: 'Event', row: 0, text: 'Trails In\nDance' }],
    })
    expect(session.date).toBe('2027-01-28T00:00:00.000Z')
    expect(session.kind === 'structured' && session.eventType).toBe('Trails In Dance')
  })

  it('splits co-callers on "/" but never splits a couple joined by "&"', () => {
    const session = only({
      programs: [MS_EXT],
      rows: [{ day: 'Friday', time: '8:30-9:30 PM' }],
      cells: [
        { program: MS_EXT.name, column: 'Event', row: 0, text: 'Dance' },
        { program: MS_EXT.name, column: 'Caller', row: 0, text: 'Roger Putzler/Cherie Cox' },
        { program: MS_EXT.name, column: 'Cuer', row: 0, text: 'Pam & Jeff Johnson' },
      ],
    })
    expect(session).toMatchObject({ callers: ['Roger Putzler', 'Cherie Cox'], cuers: ['Pam & Jeff Johnson'] })
  })

  it('joins a name wrapped mid-hyphen without a space, and other wrapped lines with one', () => {
    const session = only({
      programs: [MS_EXT],
      rows: [{ day: 'Saturday', time: '8:30-9:30 PM' }],
      cells: [
        { program: MS_EXT.name, column: 'Event', row: 0, text: 'Dance' },
        { program: MS_EXT.name, column: 'Caller', row: 0, text: 'Bruce Lowther/Ron Bell-\nRoemer' },
      ],
    })
    expect(session).toMatchObject({ callers: ['Bruce Lowther', 'Ron Bell-Roemer'] })
  })

  it('moves a known cuer named in a Caller cell into cuers', () => {
    const { sessions, errors } = parse({
      programs: [MS_EXT],
      rows: [
        { day: 'Friday', time: '7:30-8:30 PM' },
        { day: 'Sunday', time: '12:00-1:00 PM' },
      ],
      cells: [
        { program: MS_EXT.name, column: 'Event', row: 0, text: 'Featured' },
        { program: MS_EXT.name, column: 'Caller', row: 0, text: 'Ted Lizotte' },
        { program: MS_EXT.name, column: 'Cuer', row: 0, text: 'Pam & Jeff Johnson' },
        { program: MS_EXT.name, column: 'Event', row: 1, text: 'Trails Out' },
        { program: MS_EXT.name, column: 'Caller', row: 1, text: 'Ted Lizotte/Pam & Jeff Johnson' },
      ],
    })
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({ eventType: 'Dancing', callers: ['Ted Lizotte'] })
    expect(sessions[1]).toMatchObject({
      eventType: 'Trails Out',
      callers: ['Ted Lizotte'],
      cuers: ['Pam & Jeff Johnson'],
    })
  })

  it('labels Challenge C1 even in the Advanced column', () => {
    const advanced = { name: 'Advanced', room: 'Holiday Inn', columns: ['Event', 'Caller'] }
    const { sessions } = parse({
      programs: [advanced],
      rows: [
        { day: 'Saturday', time: '3:00-4:00 PM' },
        { day: 'Saturday', time: '4:00-5:00 PM' },
      ],
      cells: [
        { program: 'Advanced', column: 'Event', row: 0, text: 'Advanced' },
        { program: 'Advanced', column: 'Event', row: 1, text: 'Challenge' },
      ],
    })
    expect(sessions.map((session) => session.kind === 'structured' && [session.levels, session.eventType])).toEqual([
      [['A2'], 'Dancing'],
      [['C1'], 'Challenge'],
    ])
  })

  it.each([
    ['Intro to Plus', ['MS', 'MSX']],
    ['Intro to A', ['Plus']],
    ['Intro to Advanced', ['Plus']],
    ['Intro to A2', ['A1']],
  ])('files %j at the level(s) below the one it introduces, %j', (text, levels) => {
    const session = only({
      programs: [PLUS],
      rows: [{ day: 'Saturday', time: '10:00-11:00 AM' }],
      cells: [{ program: PLUS.name, column: 'Event', row: 0, text }],
    })
    expect(session).toMatchObject({ levels, eventType: text })
  })

  it('rejects an intro to something that isn\'t a level with one below it', () => {
    const { errors } = parse({
      programs: [PLUS],
      rows: [{ day: 'Saturday', time: '10:00-11:00 AM' }],
      cells: [{ program: PLUS.name, column: 'Event', row: 0, text: 'Intro to Clogging' }],
    })
    expect(errors).toEqual([expect.stringMatching(/"Intro to Clogging" doesn't name a level with one below it/)])
  })

  it('maps a configured alias to its one name, for callers and cuers alike', () => {
    const { sessions, errors } = parse(
      {
        programs: [PLUS],
        rows: [
          { day: 'Friday', time: '7:30-8:30 PM' },
          { day: 'Saturday', time: '7:30-8:30 PM' },
        ],
        cells: [
          { program: PLUS.name, column: 'Caller', row: 0, text: 'Mike Kious' },
          { program: PLUS.name, column: 'Event', row: 0, text: 'Dance' },
          { program: PLUS.name, column: 'Caller', row: 1, text: 'Michael Kious' },
          { program: PLUS.name, column: 'Event', row: 1, text: 'Dance' },
          { program: PLUS.name, column: 'Cuer', row: 1, text: 'Jeff J.' },
        ],
      },
      { staffAliases: { 'Mike Kious': 'Michael Kious', 'Jeff J.': 'Jeff Johnson' } },
    )
    expect(errors).toEqual([])
    expect(sessions).toEqual([
      expect.objectContaining({ callers: ['Michael Kious'] }),
      expect.objectContaining({ callers: ['Michael Kious'], cuers: ['Jeff Johnson'] }),
    ])
  })

  it('makes a non-dance event freeform, joined with its Caller cell text', () => {
    const relaxed = { name: 'Relaxed Mainstream - Standard Application', room: 'Room 1', columns: ['Event', 'Caller'] }
    const session = only({
      programs: [relaxed],
      rows: [{ day: 'Saturday', time: '9:00-10:00 AM' }],
      cells: [
        { program: relaxed.name, column: 'Event', row: 0, text: 'Education' },
        { program: relaxed.name, column: 'Caller', row: 0, text: 'Caller Clinic' },
      ],
    })
    expect(session).toMatchObject({ kind: 'freeform', description: 'Education: Caller Clinic' })
  })

  it('takes a merged cell\'s span from the gridlines, overridden by a time written in the cell', () => {
    const relaxed = { name: 'Relaxed Mainstream - Standard Application', room: 'Room 1', columns: ['Event', 'Caller'] }
    const session = only({
      programs: [relaxed],
      rows: [
        { day: 'Sunday', time: '10:00-11:00 AM' },
        { day: 'Sunday', time: '11:00-12:00 PM' },
        { day: 'Sunday', time: '12:00-1:00 PM' },
      ],
      cells: [{ program: relaxed.name, column: 'Caller', row: 0, rowSpan: 3, text: 'State Meeting 9:00-12:00' }],
    })
    expect(session).toMatchObject({
      kind: 'freeform',
      description: 'State Meeting',
      startTime: '2027-01-31T09:00:00.000Z',
      endTime: '2027-01-31T12:00:00.000Z',
    })
  })

  it('spans a merged cell with no in-cell time across all of its rows', () => {
    const session = only({
      programs: [ROUNDS],
      rows: [
        { day: 'Saturday', time: '10:00-11:00 AM' },
        { day: 'Saturday', time: '11:00-12:00 PM' },
      ],
      cells: [
        { program: ROUNDS.name, column: 'Event', row: 0, rowSpan: 2, text: 'Teach Ph 5' },
        { program: ROUNDS.name, column: 'Cuer', row: 0, rowSpan: 2, text: 'Pam & Jeff Johnson' },
      ],
    })
    expect(session).toMatchObject({ startTime: '2027-01-30T10:00:00.000Z', endTime: '2027-01-30T12:00:00.000Z' })
  })

  it.each([
    ['ph 3-4', 'Dancing', [3, 4]],
    ['Teach ph 3', 'Teach ph 3', [2]],
    ['Teach Ph 1', 'Teach Ph 1', [1]],
    ['Ph 4-6', 'Dancing', [4, 5, 6]],
    ['Intro to\nRounds', 'Intro to Rounds', []],
  ])('reads round-dance event %j as type %j, phases %j', (text, eventType, phases) => {
    const session = only({
      programs: [ROUNDS],
      rows: [{ day: 'Friday', time: '7:30-8:30 PM' }],
      cells: [
        { program: ROUNDS.name, column: 'Event', row: 0, text },
        { program: ROUNDS.name, column: 'Cuer', row: 0, text: 'Shawn Cavness' },
      ],
    })
    expect(session).toMatchObject({
      kind: 'structured',
      levels: [],
      danceForm: 'round',
      eventType,
      phases,
      callers: [],
      cuers: ['Shawn Cavness'],
    })
  })

  it('credits a clogging block to its configured program staff, reading an AM/PM-less time by its row', () => {
    const { sessions, errors } = parse(
      {
        programs: [CLOGGING],
        rows: [
          { day: 'Friday', time: '7:30-8:30 PM' },
          { day: 'Friday', time: '8:30-9:30 PM' },
        ],
        cells: [{ program: CLOGGING.name, column: '', row: 0, rowSpan: 2, text: '7:30-9:30\nProgrammed Dance' }],
      },
      { programStaff: { Clogging: ['Trevor DeWitt'] } },
    )
    expect(errors).toEqual([])
    expect(sessions).toEqual([
      expect.objectContaining({
        danceForm: 'clogging',
        levels: [],
        eventType: 'Programmed Dance',
        callers: ['Trevor DeWitt'],
        startTime: '2027-01-29T19:30:00.000Z',
        endTime: '2027-01-29T21:30:00.000Z',
      }),
    ])
  })

  it('skips Closed slots and end-of-day marker rows', () => {
    const { sessions, errors } = parse({
      programs: [ROUNDS],
      rows: [
        { day: 'Friday', time: '9:30-10:30 PM' },
        { day: 'Friday', time: '10:30' },
      ],
      cells: [{ program: ROUNDS.name, column: 'Event', row: 1, text: 'Closed' }],
    })
    expect(errors).toEqual([])
    expect(sessions).toEqual([])
  })

  describe('errors', () => {
    it('rejects content in a marker row', () => {
      const { errors } = parse({
        programs: [PLUS],
        rows: [{ day: 'Friday', time: '10:30' }],
        cells: [{ program: PLUS.name, column: 'Event', row: 0, text: 'Dance' }],
      })
      expect(errors).toEqual(['Row 0 (Friday 10:30), Plus (Hall C): content in a row with no time range'])
    })

    it('rejects an unrecognized program', () => {
      const { errors } = parse({
        programs: [{ name: 'Contra', room: 'Barn', columns: ['Event'] }],
        rows: [{ day: 'Friday', time: '1:00-2:00 PM' }],
        cells: [],
      })
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/^Program "Contra": unrecognized program/)
    })

    it('rejects a day that isn\'t one of the dates or the week before', () => {
      const { errors } = parse({
        dates: 'January 29, 30, 31 2027',
        programs: [PLUS],
        rows: [{ day: 'Funday', time: '1:00-2:00 PM' }],
        cells: [],
      })
      expect(errors).toEqual([
        'Row 0 (Funday 1:00-2:00 PM): day "Funday" isn\'t one of the title\'s dates or the week before them',
      ])
    })

    it('rejects text outside every program column', () => {
      const { errors } = parse({
        programs: [PLUS],
        rows: [{ day: 'Friday', time: '1:00-2:00 PM' }],
        cells: [],
        extraTexts: [{ text: 'Stray', x: 1000, y: 70 }],
      })
      expect(errors).toEqual(['Text "Stray" at (1000, 70) isn\'t in any program\'s column'])
    })

    it('rejects a page with no Day/Times headers', () => {
      const page = buildPage({ programs: [PLUS], rows: [], cells: [] })
      const { errors } = parseProgramGridPdf({ ...page, texts: page.texts.filter((item) => item.text !== 'Times') })
      expect(errors).toEqual(['Expected "Day" and "Times" column headers, but the PDF has no such text'])
    })

    it('rejects a title without dates', () => {
      const { errors } = parse({ dates: 'Sometime in winter', programs: [PLUS], rows: [], cells: [] })
      expect(errors).toEqual([
        'Grid title: expected the event\'s dates, like "January 29, 30, 31 2027", got "Sometime in winter"',
      ])
    })
  })
})
