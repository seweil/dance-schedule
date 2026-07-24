import { describe, expect, it } from 'vitest'
import { parseDetailedScheduleSheet } from './parseDetailedScheduleSheet'

// Fixed so "July 2"-style sheet-name dates resolve deterministically via year inference.
const REFERENCE_DATE = new Date(Date.UTC(2026, 6, 1)) // July 1, 2026

function parseOneCell(cellText: string, header: string[] = ['Time', 'Ballroom Centre']) {
  const rows = [header, ['12:30p-1:30p', cellText]]
  return parseDetailedScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
}

describe('parseDetailedScheduleSheet', () => {
  it('derives the date from the sheet name, stripping the weekday', () => {
    const { sessions, errors } = parseOneCell('SSD : Dancing - Ted Lizotte')
    expect(errors).toEqual([])
    expect(sessions[0]?.date).toBe('2026-07-02T00:00:00.000Z')
  })

  it('parses the time-slot row label into start/end times', () => {
    const { sessions, errors } = parseOneCell('SSD : Dancing - Ted Lizotte')
    expect(errors).toEqual([])
    expect(sessions[0]?.startTime).toBe('2026-07-02T12:30:00.000Z')
    expect(sessions[0]?.endTime).toBe('2026-07-02T13:30:00.000Z')
  })

  it('parses a simple session with no GCA line', () => {
    const { sessions, errors } = parseOneCell('SSD : Dancing - Ted Lizotte')
    expect(errors).toEqual([])
    expect(sessions).toEqual([
      expect.objectContaining({
        kind: 'structured',
        room: 'Ballroom Centre',
        levels: ['SSD'],
        eventType: 'Dancing',
        callers: ['Ted Lizotte'],
        gca: undefined,
      }),
    ])
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
        description: 'Intro to calling - Bill Eyler',
      }),
    ])
  })

  it('skips null/empty cells without producing a session or error', () => {
    const rows = [
      ['Time', 'Ballroom Centre', 'Ballroom East'],
      ['12:30p-1:30p', null, 'SSD : Dancing - Ted Lizotte'],
    ]
    const { sessions, errors } = parseDetailedScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
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

  it('aggregates an error for a second line that is not a GCA line', () => {
    const { sessions, errors } = parseOneCell('SSD : Dancing - Ted Lizotte\nSomething else')
    expect(sessions).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Expected a "GCA:" line/)
  })

  it('aggregates an error for an unparseable time-slot row', () => {
    const rows = [
      ['Time', 'Ballroom Centre'],
      ['not a time', 'SSD : Dancing - Ted Lizotte'],
    ]
    const { sessions, errors } = parseDetailedScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(sessions).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Sheet "Thursday July 2", row 2/)
  })

  it('collects multiple errors across a sheet rather than stopping at the first', () => {
    const rows = [
      ['Time', 'Ballroom Centre', 'Ballroom East'],
      ['12:30p-1:30p', 'C5 : Dancing - Vic Ceder', 'Country Western Dance - until 1am'],
    ]
    const { errors } = parseDetailedScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
    expect(errors).toHaveLength(2)
  })
})
