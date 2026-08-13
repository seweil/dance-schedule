import { describe, expect, it } from 'vitest'
import { formatDanceScheduleDateRange } from './formatDanceScheduleDateRange'

// Intl.DateTimeFormat.prototype.formatRange's own separator — confirmed live
// (Node, this project's own runtime, byte-checked via codePointAt) to be
// U+2009 THIN SPACE either side of a U+2013 EN DASH, NOT plain ASCII spaces
// around a hyphen — an easy mismatch to introduce by accident, since the two
// render visually identically in an editor. If this constant's own literal
// characters ever look "wrong" after a copy/paste or a reformat, re-verify
// with codePointAt before assuming the test itself is broken.
const RANGE_SEP = ' – '

describe('formatDanceScheduleDateRange', () => {
  it('returns null for an empty list', () => {
    expect(formatDanceScheduleDateRange([])).toBeNull()
  })

  it('formats a single date with no range at all', () => {
    expect(formatDanceScheduleDateRange([new Date('2026-10-09T00:00:00.000Z')])).toBe(
      'October 9, 2026',
    )
  })

  it('collapses duplicate dates to a single date, same as one date', () => {
    const date = new Date('2026-10-09T00:00:00.000Z')
    expect(formatDanceScheduleDateRange([date, new Date(date)])).toBe('October 9, 2026')
  })

  it('formats a same-month range without repeating the month', () => {
    const dates = [
      new Date('2026-10-09T00:00:00.000Z'),
      new Date('2026-10-10T00:00:00.000Z'),
      new Date('2026-10-11T00:00:00.000Z'),
    ]
    expect(formatDanceScheduleDateRange(dates)).toBe(`October 9${RANGE_SEP}11, 2026`)
  })

  it('formats a same-year, cross-month range with the year stated once', () => {
    const dates = [new Date('2026-06-30T00:00:00.000Z'), new Date('2026-07-02T00:00:00.000Z')]
    expect(formatDanceScheduleDateRange(dates)).toBe(`June 30${RANGE_SEP}July 2, 2026`)
  })

  it('formats a cross-year range with both years stated', () => {
    const dates = [new Date('2026-12-30T00:00:00.000Z'), new Date('2027-01-02T00:00:00.000Z')]
    expect(formatDanceScheduleDateRange(dates)).toBe(
      `December 30, 2026${RANGE_SEP}January 2, 2027`,
    )
  })

  it('is unaffected by input order — only the min/max matter', () => {
    const dates = [
      new Date('2026-10-11T00:00:00.000Z'),
      new Date('2026-10-09T00:00:00.000Z'),
      new Date('2026-10-10T00:00:00.000Z'),
    ]
    expect(formatDanceScheduleDateRange(dates)).toBe(`October 9${RANGE_SEP}11, 2026`)
  })
})
