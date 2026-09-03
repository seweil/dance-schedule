import { describe, expect, it } from 'vitest'
import { isNonScheduleSheetName, parseDanceScheduleSheet } from './parseDanceScheduleSheet'

// Fixed so "July 2"-style sheet-name dates resolve deterministically via year inference.
const REFERENCE_DATE = new Date(Date.UTC(2026, 6, 1)) // July 1, 2026

function parseOneCell(cellText: string, header: string[] = ['Time', 'Ballroom Centre']) {
  const rows = [header, ['12:30p-1:30p', cellText]]
  return parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
}

describe('isNonScheduleSheetName', () => {
  it('treats a "-"-prefixed name as non-schedule content', () => {
    expect(isNonScheduleSheetName('- Notes')).toBe(true)
    expect(isNonScheduleSheetName('-Scratch')).toBe(true)
  })

  it('treats a real date-like sheet name as schedule content', () => {
    expect(isNonScheduleSheetName('Thursday July 2')).toBe(false)
  })

  it('treats a mistyped/bogus (but non-"-"-prefixed) name as schedule content too — still not exempt from parseSheetDate\'s own loud failure', () => {
    expect(isNonScheduleSheetName('Thusday Jly 2')).toBe(false)
    expect(isNonScheduleSheetName('Notes')).toBe(false)
  })
})

describe('parseDanceScheduleSheet', () => {
  it('derives the date from the sheet name, stripping the weekday', () => {
    const { sessions, errors } = parseOneCell('SSD : Dancing - Ted Lizotte')
    expect(errors).toEqual([])
    expect(sessions[0]?.date).toBe('2026-07-02T00:00:00.000Z')
  })

  it('derives the date from the sheet name when the weekday is followed by a comma', () => {
    const rows = [
      ['Time', 'Ballroom Centre'],
      ['12:30p-1:30p', 'SSD : Dancing - Ted Lizotte'],
    ]
    const { sessions, errors } = parseDanceScheduleSheet('Thursday, July 2', rows, REFERENCE_DATE)
    expect(errors).toEqual([])
    expect(sessions[0]?.date).toBe('2026-07-02T00:00:00.000Z')
  })

  it('parses the time-slot row label into start/end times', () => {
    const { sessions, errors } = parseOneCell('SSD : Dancing - Ted Lizotte')
    expect(errors).toEqual([])
    expect(sessions[0]?.startTime).toBe('2026-07-02T12:30:00.000Z')
    expect(sessions[0]?.endTime).toBe('2026-07-02T13:30:00.000Z')
  })

  it('parses a simple session with no GCA line, defaulting to its own room', () => {
    const { sessions, errors } = parseOneCell('SSD : Dancing - Ted Lizotte')
    expect(errors).toEqual([])
    expect(sessions).toEqual([
      expect.objectContaining({
        kind: 'structured',
        location: { kind: 'located', rooms: ['Ballroom Centre'] },
        levels: ['SSD'],
        eventType: 'Dancing',
        callers: ['Ted Lizotte'],
        gca: undefined,
      }),
    ])
  })

  it('parses a cell with no "Type - " portion, defaulting eventType to "Dancing"', () => {
    const { sessions, errors } = parseOneCell('SSD : Ted Lizotte')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({
      levels: ['SSD'],
      eventType: 'Dancing',
      callers: ['Ted Lizotte'],
      gca: undefined,
    })
  })

  it('parses co-primary callers joined by "&" with no "Type - " portion', () => {
    const { sessions, errors } = parseOneCell('SSD : Michael Kellogg & Terri Sherrer')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({
      eventType: 'Dancing',
      callers: ['Michael Kellogg', 'Terri Sherrer'],
      gca: undefined,
    })
  })

  it('parses a GCA line on a cell with no "Type - " portion', () => {
    const { sessions, errors } = parseOneCell('Plus : Kris Jensen\nGCA: Tim Stephens')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({
      levels: ['Plus'],
      eventType: 'Dancing',
      callers: ['Kris Jensen'],
      gca: 'Tim Stephens',
    })
  })

  it('parses an explicit GCA line', () => {
    const { sessions, errors } = parseOneCell('Plus : Dancing - Kris Jensen\nGCA: Tim Stephens')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({
      levels: ['Plus'],
      eventType: 'Dancing',
      callers: ['Kris Jensen'],
      gca: 'Tim Stephens',
    })
  })

  it('parses multi-level sessions joined by "&"', () => {
    const { sessions, errors } = parseOneCell('C1 & C2 : Dancing - Vic Ceder')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({ levels: ['C1', 'C2'], callers: ['Vic Ceder'] })
  })

  it('parses multi-level sessions joined by "/"', () => {
    const { sessions, errors } = parseOneCell('A1/A2 : Advanced Hothash - Justin Russell')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({
      levels: ['A1', 'A2'],
      eventType: 'Advanced Hothash',
      callers: ['Justin Russell'],
    })
  })

  it('normalizes a bare "Advanced" level to A2, not a distinct level of its own', () => {
    const { sessions, errors } = parseOneCell('Advanced : Dancing - Vic Ceder')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({ levels: ['A2'] })
  })

  it('leaves an explicit "A1" level as A1, not normalized to A2', () => {
    const { sessions, errors } = parseOneCell('A1 : Dancing - Vic Ceder')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({ levels: ['A1'] })
  })

  it('normalizes "Advanced" within a multi-level cell too', () => {
    const { sessions, errors } = parseOneCell('Advanced & C1 : Dancing - Vic Ceder')
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({ levels: ['A2', 'C1'] })
  })

  it('parses co-primary callers joined by "&" (not a GCA)', () => {
    const { sessions, errors } = parseOneCell(
      'SSD : Leather Tip - Michael Kellogg & Terri Sherrer',
    )
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({
      eventType: 'Leather Tip',
      callers: ['Michael Kellogg', 'Terri Sherrer'],
      gca: undefined,
    })
  })

  it('treats a "* "-prefixed cell as a literal freeform description', () => {
    const { sessions, errors } = parseOneCell('* Intro to calling - Bill Eyler')
    expect(errors).toEqual([])
    expect(sessions).toEqual([
      expect.objectContaining({
        kind: 'freeform',
        location: { kind: 'located', rooms: ['Ballroom Centre'] },
        description: 'Intro to calling - Bill Eyler',
      }),
    ])
  })

  it('aggregates an error for a blank/undefined header cell instead of naming a room "undefined"', () => {
    const rows = [
      ['Time', 'Ballroom Centre', null, 'Ballroom East'],
      ['12:30p-1:30p', 'SSD : Dancing - Ted Lizotte', null, 'Plus : Dancing - Kris Jensen'],
    ]
    const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(sessions).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/header cell C1: room name is blank/)
  })

  it('aggregates an error for duplicate header room names', () => {
    const rows = [
      ['Time', 'Overflow', 'Overflow'],
      ['12:30p-1:30p', 'SSD : Dancing - Ted Lizotte', null],
    ]
    const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(sessions).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/header cell C1: room "Overflow" duplicates header cell B1/)
  })

  it('trims header room names so a trailing space does not break "ROOMS:" validation', () => {
    const rows = [
      ['Time', 'Ballroom Centre ', 'Ballroom West'],
      ['12:30p-1:30p', 'SSD : Combined Dance - Vic Ceder\nROOMS: Ballroom Centre, Ballroom West', null],
    ]
    const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(errors).toEqual([])
    expect(sessions[0]).toMatchObject({
      location: { kind: 'located', rooms: ['Ballroom Centre', 'Ballroom West'] },
    })
  })

  it('skips null/empty cells without producing a session or error', () => {
    const rows = [
      ['Time', 'Ballroom Centre', 'Ballroom East'],
      ['12:30p-1:30p', null, 'SSD : Dancing - Ted Lizotte'],
    ]
    const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(errors).toEqual([])
    expect(sessions).toHaveLength(1)
  })

  it('aggregates an error for an unprefixed cell that does not match the pattern', () => {
    const { sessions, errors } = parseOneCell('Country Western Dance - until 1am')
    expect(sessions).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Sheet "Thursday July 2"/)
    expect(errors[0]).toMatch(/cell B2/)
    expect(errors[0]).toMatch(/time "12:30p-1:30p"/)
    expect(errors[0]).toMatch(/room "Ballroom Centre"/)
    expect(errors[0]).toMatch(/isn't prefixed with "\* "/)
  })

  it('aggregates an error for an unrecognized level code', () => {
    const { sessions, errors } = parseOneCell('C5 : Dancing - Vic Ceder')
    expect(sessions).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Unrecognized level code "C5"/)
  })

  it('aggregates an error for an unrecognized trailing line', () => {
    const { sessions, errors } = parseOneCell('SSD : Dancing - Ted Lizotte\nSomething else')
    expect(sessions).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Unexpected extra line/)
  })

  it('aggregates an error for content in a column beyond the header row width', () => {
    const rows = [
      ['Time', 'Ballroom Centre'],
      [
        '12:30p-1:30p',
        'SSD : Dancing - Vic Ceder',
        'Plus : Dancing - Kris Jensen',
      ],
    ]
    const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(sessions).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/cell C2/)
    expect(errors[0]).toMatch(/beyond the header row's 1 room\(s\)/)
  })

  it('aggregates an error for an unparseable time-slot row', () => {
    const rows = [
      ['Time', 'Ballroom Centre'],
      ['not a time', 'SSD : Dancing - Ted Lizotte'],
    ]
    const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(sessions).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Sheet "Thursday July 2", row 2/)
  })

  it('collects multiple errors across a sheet rather than stopping at the first', () => {
    const rows = [
      ['Time', 'Ballroom Centre', 'Ballroom East'],
      ['12:30p-1:30p', 'C5 : Dancing - Vic Ceder', 'Country Western Dance - until 1am'],
    ]
    const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(errors).toHaveLength(2)
  })

  describe('double-booking', () => {
    it('aggregates an error when the same caller is booked in two rooms at the identical time', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        ['12:30p-1:30p', 'SSD : Dancing - Vic Ceder', 'Plus : Dancing - Vic Ceder'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/Sheet "Thursday July 2", cell C2/)
      expect(errors[0]).toMatch(/caller "Vic Ceder" is already booked in cell B2 \(time "12:30p-1:30p"\)/)
    })

    it('aggregates an error when the same caller is booked at overlapping (not identical) times across rows', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        ['12:30p-1:30p', 'SSD : Dancing - Vic Ceder', null],
        ['1:00p-2:00p', null, 'Plus : Dancing - Vic Ceder'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/cell C3/)
      expect(errors[0]).toMatch(/caller "Vic Ceder" is already booked in cell B2 \(time "12:30p-1:30p"\)/)
    })

    it('does not flag the same caller back-to-back at non-overlapping times', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        ['12:30p-1:30p', 'SSD : Dancing - Vic Ceder', null],
        ['1:30p-2:30p', null, 'Plus : Dancing - Vic Ceder'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
    })

    it('does not flag different callers in different rooms at the same time', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        ['12:30p-1:30p', 'SSD : Dancing - Vic Ceder', 'Plus : Dancing - Ted Lizotte'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
    })

    it('does not falsely flag a session that lists the same co-caller name twice', () => {
      const { errors } = parseOneCell('SSD : Dancing - Vic Ceder & Vic Ceder')
      expect(errors).toEqual([])
    })

    it('does not check GCA credits for double-booking, only headline callers', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        ['12:30p-1:30p', 'SSD : Dancing - Kris Jensen\nGCA: Tim Stephens', 'Plus : Dancing - Ted Lizotte\nGCA: Tim Stephens'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
    })

    it('aggregates an error when the same room is double-booked across two rows', () => {
      const rows = [
        ['Time', 'Ballroom Centre'],
        ['12:30p-1:30p', 'SSD : Dancing - Vic Ceder'],
        ['1:00p-2:00p', 'Plus : Dancing - Ted Lizotte'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/cell B3/)
      expect(errors[0]).toMatch(/room "Ballroom Centre" is already booked in cell B2 \(time "12:30p-1:30p"\)/)
    })

    it('aggregates an error when a ditto-spanned room conflicts with a later row using it directly', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        ['12:30p-1:30p', 'SSD : Combined Dance - Vic Ceder', '"'],
        ['1:00p-2:00p', null, 'Plus : Dancing - Ted Lizotte'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/room "Ballroom East" is already booked in cell B2/)
    })

    it('does not double-report a same-row "ROOMS:" cell-not-blank conflict as a second, redundant booking error', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom West'],
        [
          '12:30p-1:30p',
          'SSD : Combined Dance - Vic Ceder\nROOMS: Ballroom Centre, Ballroom West',
          'Plus : Dancing - Ted Lizotte',
        ],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/claims room "Ballroom West", but its cell \(C2\) isn't blank/)
    })
  })

  describe('"ROOMS:" line', () => {
    it('parses "ROOMS: NONE" as a roomless session, even on a freeform cell', () => {
      const { sessions, errors } = parseOneCell('* Lunch Break\nROOMS: NONE')
      expect(errors).toEqual([])
      expect(sessions).toEqual([
        expect.objectContaining({
          kind: 'freeform',
          location: { kind: 'roomless' },
          description: 'Lunch Break',
        }),
      ])
    })

    it('parses an explicit multi-room list on a structured cell', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom West'],
        ['12:30p-1:30p', 'SSD : Combined Dance - Vic Ceder\nROOMS: Ballroom Centre, Ballroom West', null],
      ]
      const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
      expect(sessions).toEqual([
        expect.objectContaining({
          location: { kind: 'located', rooms: ['Ballroom Centre', 'Ballroom West'] },
        }),
      ])
    })

    it('parses "ROOMS:" together with a "GCA:" line, in either order', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom West'],
        [
          '12:30p-1:30p',
          'SSD : Combined Dance - Vic Ceder\nGCA: Tim Stephens\nROOMS: Ballroom Centre, Ballroom West',
          null,
        ],
      ]
      const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
      expect(sessions).toEqual([
        expect.objectContaining({
          gca: 'Tim Stephens',
          location: { kind: 'located', rooms: ['Ballroom Centre', 'Ballroom West'] },
        }),
      ])
    })

    it('aggregates an error for an unrecognized room name', () => {
      const { errors } = parseOneCell('SSD : Dancing - Ted Lizotte\nROOMS: Ballroom Centre, Nonexistent Room')
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/unrecognized room "Nonexistent Room"/)
    })

    it('aggregates an error when the list omits the cell\'s own room', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom West'],
        ['12:30p-1:30p', 'SSD : Combined Dance - Vic Ceder\nROOMS: Ballroom West', null],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/must include this cell's own room "Ballroom Centre"/)
    })

    it('aggregates an error when a claimed room\'s cell is not actually blank', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom West'],
        [
          '12:30p-1:30p',
          'SSD : Combined Dance - Vic Ceder\nROOMS: Ballroom Centre, Ballroom West',
          'Plus : Dancing - Ted Lizotte',
        ],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/claims room "Ballroom West", but its cell \(C2\) isn't blank/)
    })

    it('does not enforce adjacency for an explicit room list', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Middle Room', 'Ballroom West'],
        [
          '12:30p-1:30p',
          'SSD : Combined Dance - Vic Ceder\nROOMS: Ballroom Centre, Ballroom West',
          null,
          null,
        ],
      ]
      const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
      expect(sessions[0]).toMatchObject({
        location: { kind: 'located', rooms: ['Ballroom Centre', 'Ballroom West'] },
      })
    })
  })

  describe('ditto mark (")', () => {
    it('chains a 2-cell ditto onto the content cell to its left', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        ['12:30p-1:30p', 'SSD : Combined Dance - Vic Ceder', '"'],
      ]
      const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
      expect(sessions).toEqual([
        expect.objectContaining({
          location: { kind: 'located', rooms: ['Ballroom Centre', 'Ballroom East'] },
        }),
      ])
    })

    it('chains a 3-cell ditto run onto the content cell', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East', 'Ballroom West'],
        ['12:30p-1:30p', 'SSD : Combined Dance - Vic Ceder', '"', '"'],
      ]
      const { sessions, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
      expect(sessions).toEqual([
        expect.objectContaining({
          location: {
            kind: 'located',
            rooms: ['Ballroom Centre', 'Ballroom East', 'Ballroom West'],
          },
        }),
      ])
    })

    it('aggregates an error for a dangling ditto with nothing to its left', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        ['12:30p-1:30p', '"', 'SSD : Dancing - Ted Lizotte'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/Ditto mark \("\) has no content cell to its left/)
    })

    it('aggregates an error for a ditto chain broken by a blank cell', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East', 'Ballroom West'],
        ['12:30p-1:30p', 'SSD : Combined Dance - Vic Ceder', null, '"'],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/Ditto mark \("\) has no content cell to its left/)
    })

    it('aggregates an error when a cell has both an explicit "ROOMS:" line and a ditto pointing at it', () => {
      const rows = [
        ['Time', 'Ballroom Centre', 'Ballroom East'],
        [
          '12:30p-1:30p',
          'SSD : Combined Dance - Vic Ceder\nROOMS: Ballroom Centre',
          '"',
        ],
      ]
      const { errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/already has an explicit "ROOMS:" line/)
    })
  })
})
