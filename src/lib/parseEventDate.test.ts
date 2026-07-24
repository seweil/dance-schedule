import { describe, expect, it } from 'vitest'
import { parseEventDate } from './parseEventDate'

describe('parseEventDate', () => {
  it.each([
    ['ISO', '2026-08-15'],
    ['US slash, 4-digit year', '8/15/2026'],
    ['US slash, 2-digit year', '8/15/26'],
    ['long form', 'August 15, 2026'],
    ['abbreviated long form', 'Aug 15, 2026'],
    ['abbreviated long form with period', 'Aug. 15, 2026'],
    ['long form without comma', 'August 15 2026'],
  ])('parses %s ("%s") as 2026-08-15', (_label, input) => {
    expect(parseEventDate(input)).toEqual(new Date(Date.UTC(2026, 7, 15)))
  })

  it('passes through a native Date, normalized to UTC midnight', () => {
    const excelDate = new Date(Date.UTC(2026, 7, 15, 13, 30))
    expect(parseEventDate(excelDate)).toEqual(new Date(Date.UTC(2026, 7, 15)))
  })

  it('converts an Excel serial date number using the documented epoch', () => {
    const excelEpochUtcMs = Date.UTC(1899, 11, 30)
    const msPerDay = 24 * 60 * 60 * 1000
    const serial = (Date.UTC(2026, 7, 15) - excelEpochUtcMs) / msPerDay
    expect(parseEventDate(serial)).toEqual(new Date(Date.UTC(2026, 7, 15)))
  })

  describe('year inference for year-less dates', () => {
    const referenceDate = new Date(Date.UTC(2026, 6, 1)) // July 1, 2026

    it('assumes the current year when the resulting date is not far in the past', () => {
      expect(parseEventDate('8/15', referenceDate)).toEqual(new Date(Date.UTC(2026, 7, 15)))
      expect(parseEventDate('Aug 15', referenceDate)).toEqual(new Date(Date.UTC(2026, 7, 15)))
    })

    it('keeps a recently-past date in the current year rather than rolling forward', () => {
      expect(parseEventDate('5/1', referenceDate)).toEqual(new Date(Date.UTC(2026, 4, 1)))
    })

    it('rolls over to next year once the current-year candidate is more than ~6 months in the past', () => {
      const decemberReference = new Date(Date.UTC(2026, 11, 15)) // December 15, 2026
      expect(parseEventDate('1/5', decemberReference)).toEqual(new Date(Date.UTC(2027, 0, 5)))
    })
  })

  it('throws for an unrecognized date format', () => {
    expect(() => parseEventDate('not a date')).toThrow()
  })

  it('throws for an unrecognized month name', () => {
    expect(() => parseEventDate('Augtober 15, 2026')).toThrow()
  })

  it('throws for a non-string, non-Date, non-number value', () => {
    expect(() => parseEventDate(null)).toThrow()
    expect(() => parseEventDate(undefined)).toThrow()
  })
})
