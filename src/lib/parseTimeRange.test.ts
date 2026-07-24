import { describe, expect, it } from 'vitest'
import { parseTimeRange } from './parseTimeRange'

const DATE = new Date(Date.UTC(2026, 7, 15)) // August 15, 2026

function expectRange(result: { startTime: Date; endTime: Date }, start: string, end: string) {
  expect(result.startTime).toEqual(new Date(`2026-08-15T${start}:00.000Z`))
  expect(result.endTime).toEqual(new Date(`2026-08-15T${end}:00.000Z`))
}

describe('parseTimeRange', () => {
  it.each([
    ['spaced AM/PM', '6:00 PM - 7:30 PM'],
    ['unspaced AM/PM', '6:00pm-7:30pm'],
    ['periods in AM/PM', '6:00 p.m. - 7:30 p.m.'],
    ['24-hour', '18:00 - 19:30'],
    ['"to" separator', '6:00pm to 7:30pm'],
  ])('parses %s ("%s") as 18:00-19:30', (_label, input) => {
    expectRange(parseTimeRange(input, DATE), '18:00', '19:30')
  })

  describe('meridiem inference for a start time missing AM/PM', () => {
    it('infers PM when copying the end meridiem keeps start before end', () => {
      expectRange(parseTimeRange('6 - 7:30pm', DATE), '18:00', '19:30')
    })

    it('flips to AM when copying the end meridiem would put start at/after end', () => {
      expectRange(parseTimeRange('11 - 1pm', DATE), '11:00', '13:00')
    })

    it('infers AM when the naive copy already keeps start before end in the AM', () => {
      expectRange(parseTimeRange('9:00 - 10:00am', DATE), '09:00', '10:00')
    })

    it('does not apply inference when both times already specify AM/PM', () => {
      expectRange(parseTimeRange('6:00am - 7:30am', DATE), '06:00', '07:30')
    })

    it('does not apply inference when both times are 24-hour (neither specifies AM/PM)', () => {
      expectRange(parseTimeRange('6:00 - 7:30', DATE), '06:00', '07:30')
    })
  })

  it('throws for a range with no recognizable separator', () => {
    expect(() => parseTimeRange('not a range', DATE)).toThrow()
  })

  it('throws for an unrecognized time component', () => {
    expect(() => parseTimeRange('6:00 XM - 7:00pm', DATE)).toThrow()
  })

  it('throws for an out-of-range 12-hour value', () => {
    expect(() => parseTimeRange('13pm - 2pm', DATE)).toThrow()
  })

  it('throws for an invalid minutes value', () => {
    expect(() => parseTimeRange('6:75pm - 7:30pm', DATE)).toThrow()
  })
})
