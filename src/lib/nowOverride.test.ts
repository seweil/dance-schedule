import { describe, expect, it } from 'vitest'
import { nowForOverride, parseNowOverride } from './nowOverride'
import type { TimeMark } from './computeDanceScheduleTimeAxis'

function mark(rowStart: number, iso: string): TimeMark {
  return { rowStart, label: iso, time: new Date(iso) }
}

describe('parseNowOverride', () => {
  it.each([
    ['?now=10:43', { hour24: 10, minutes: 43 }],
    ['?now=14:30', { hour24: 14, minutes: 30 }],
    ['?now=2:30pm', { hour24: 14, minutes: 30 }],
    ['?now=2:30%20PM', { hour24: 14, minutes: 30 }],
    ['?foo=1&now=9', { hour24: 9, minutes: 0 }],
  ])('parses %s', (search, expected) => {
    expect(parseNowOverride(search)).toMatchObject(expected)
  })

  it.each([[''], ['?now='], ['?now=noon'], ['?now=25:00'], ['?now=10:75'], ['?other=10:43']])(
    'is null for %j',
    (search) => {
      expect(parseNowOverride(search)).toBeNull()
    },
  )
})

describe('nowForOverride', () => {
  const DAY = [mark(1, '2026-07-04T09:00:00.000Z'), mark(2, '2026-07-04T17:00:00.000Z')]

  it("places the override on the grid's own date", () => {
    expect(nowForOverride(DAY, { hour24: 10, minutes: 43, hasMeridiem: false, rawHour: 10 })?.toISOString()).toBe(
      '2026-07-04T10:43:00.000Z',
    )
  })

  it("is null outside the day's labelled range", () => {
    expect(nowForOverride(DAY, { hour24: 8, minutes: 0, hasMeridiem: false, rawHour: 8 })).toBeNull()
    expect(nowForOverride(DAY, { hour24: 18, minutes: 0, hasMeridiem: false, rawHour: 18 })).toBeNull()
  })

  it('lands on the after-midnight tail of a day that runs past midnight', () => {
    const lateDay = [mark(1, '2026-07-04T19:00:00.000Z'), mark(2, '2026-07-05T01:00:00.000Z')]
    expect(nowForOverride(lateDay, { hour24: 0, minutes: 30, hasMeridiem: false, rawHour: 0 })?.toISOString()).toBe(
      '2026-07-05T00:30:00.000Z',
    )
  })

  it('is null with no marks', () => {
    expect(nowForOverride([], { hour24: 10, minutes: 0, hasMeridiem: false, rawHour: 10 })).toBeNull()
  })
})
