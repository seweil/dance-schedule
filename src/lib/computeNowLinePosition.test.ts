import { describe, expect, it } from 'vitest'
import { computeNowLinePosition, toWallClockUtc } from './computeNowLinePosition'
import type { TimeMark } from './computeDanceScheduleTimeAxis'

function mark(rowStart: number, hhmm: string): TimeMark {
  return { rowStart, label: hhmm, time: new Date(`2026-07-02T${hhmm}:00.000Z`) }
}

// A 15-minute segment followed by a 3-hour one — both one grid row each, which is
// exactly why interpolation has to be per segment rather than across the whole day.
const MARKS = [mark(1, '12:00'), mark(2, '12:15'), mark(3, '15:15')]

function at(iso: string) {
  return computeNowLinePosition(MARKS, new Date(iso))
}

describe('computeNowLinePosition', () => {
  it.each([
    ['before the first label', '2026-07-02T11:59:00.000Z'],
    ['after the last label', '2026-07-02T15:16:00.000Z'],
    ['on a different day at an in-range clock time', '2026-07-03T12:10:00.000Z'],
    ['on the previous day at an in-range clock time', '2026-07-01T13:00:00.000Z'],
  ])('is null %s', (_name, iso) => {
    expect(at(iso)).toBeNull()
  })

  it.each([
    ['exactly on the first label', '2026-07-02T12:00:00.000Z', { rowStart: 1, rowEnd: 2, fraction: 0 }],
    ['exactly on a middle label', '2026-07-02T12:15:00.000Z', { rowStart: 2, rowEnd: 3, fraction: 0 }],
    ['exactly on the last label', '2026-07-02T15:15:00.000Z', { rowStart: 2, rowEnd: 3, fraction: 1 }],
    ['midway through a short segment', '2026-07-02T12:07:30.000Z', { rowStart: 1, rowEnd: 2, fraction: 0.5 }],
    ['midway through a long segment', '2026-07-02T13:45:00.000Z', { rowStart: 2, rowEnd: 3, fraction: 0.5 }],
    ['a third of the way through a long segment', '2026-07-02T13:15:00.000Z', { rowStart: 2, rowEnd: 3, fraction: 1 / 3 }],
  ])('positions the line %s', (_name, iso, expected) => {
    const result = at(iso)
    expect(result?.rowStart).toBe(expected.rowStart)
    expect(result?.rowEnd).toBe(expected.rowEnd)
    expect(result?.fraction).toBeCloseTo(expected.fraction)
  })

  it('spans every grid row between two non-adjacent marks', () => {
    const result = computeNowLinePosition(
      [mark(1, '12:00'), mark(4, '13:00')],
      new Date('2026-07-02T12:45:00.000Z'),
    )
    expect(result).toEqual({ rowStart: 1, rowEnd: 4, fraction: 0.75 })
  })

  it('is null with fewer than two marks', () => {
    expect(computeNowLinePosition([], new Date('2026-07-02T12:00:00.000Z'))).toBeNull()
    expect(computeNowLinePosition([mark(1, '12:00')], new Date('2026-07-02T12:00:00.000Z'))).toBeNull()
  })
})

describe('toWallClockUtc', () => {
  it("re-encodes the device's local date and time as UTC fields", () => {
    // Built from local fields, so this holds whatever TZ the test runner uses.
    const local = new Date(2026, 6, 2, 21, 30, 15)
    expect(toWallClockUtc(local).toISOString()).toBe('2026-07-02T21:30:15.000Z')
  })
})
