import { describe, expect, it } from 'vitest'
import { computeDanceScheduleTimeAxis, isContiguous } from './computeDanceScheduleTimeAxis'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

function makeSession(startTime: string, endTime: string, overrides: Partial<DanceSession> = {}): DanceSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    location: located('Ballroom Centre'),
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  } as DanceSession
}

describe('isContiguous', () => {
  it('is true for an empty array', () => {
    expect(isContiguous([])).toBe(true)
  })

  it('is true for a single index', () => {
    expect(isContiguous([2])).toBe(true)
  })

  it('is true for an unbroken ascending run', () => {
    expect(isContiguous([2, 3, 4])).toBe(true)
  })

  it('is false when a run skips an index', () => {
    expect(isContiguous([0, 2])).toBe(false)
  })
})

describe('computeDanceScheduleTimeAxis', () => {
  it('returns null when there are no sessions for the date at all', () => {
    expect(computeDanceScheduleTimeAxis([], [])).toBeNull()
  })

  it('floors dayStart and ceils dayEnd to the nearest hour', () => {
    const session = makeSession('2026-07-02T12:15:00.000Z', '2026-07-02T12:45:00.000Z')
    const axis = computeDanceScheduleTimeAxis([session], [session])

    expect(axis?.totalRowUnits).toBe(4)
    expect(axis?.hourMarks).toEqual([
      { rowStart: 1, label: '12:00 PM' },
      { rowStart: 5, label: '1:00 PM' },
    ])
  })

  it('places one half-hour tick between each pair of hour marks', () => {
    const session = makeSession('2026-07-02T12:15:00.000Z', '2026-07-02T14:45:00.000Z')
    const axis = computeDanceScheduleTimeAxis([session], [session])

    expect(axis?.hourMarks.map((mark) => mark.rowStart)).toEqual([1, 5, 9, 13])
    expect(axis?.halfHourMarks).toEqual([3, 7, 11])
  })

  it('computes rowStart/rowSpan for 30- and 45-minute sessions relative to dayStart', () => {
    const axis = computeDanceScheduleTimeAxis(
      [makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T13:15:00.000Z')],
      [makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T13:15:00.000Z')],
    )

    expect(axis?.rowStartFor(new Date('2026-07-02T12:00:00.000Z'))).toBe(1)
    expect(axis?.rowSpanFor(new Date('2026-07-02T12:00:00.000Z'), new Date('2026-07-02T12:30:00.000Z'))).toBe(2)
    expect(axis?.rowStartFor(new Date('2026-07-02T12:30:00.000Z'))).toBe(3)
    expect(axis?.rowSpanFor(new Date('2026-07-02T12:30:00.000Z'), new Date('2026-07-02T13:15:00.000Z'))).toBe(3)
  })

  it('trims leading/trailing hours entirely empty after filtering, but never past the full day', () => {
    const early = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T09:30:00.000Z')
    const late = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z')
    const axis = computeDanceScheduleTimeAxis([early, late], [late])

    expect(axis?.hourMarks).toEqual([
      { rowStart: 1, label: '1:00 PM' },
      { rowStart: 5, label: '2:00 PM' },
    ])
  })

  it('does not trim a gap between two visible sessions', () => {
    const morning = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T09:30:00.000Z')
    const afternoon = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T13:30:00.000Z')
    const axis = computeDanceScheduleTimeAxis([morning, afternoon], [morning, afternoon])

    expect(axis?.hourMarks[0]).toEqual({ rowStart: 1, label: '9:00 AM' })
    expect(axis?.hourMarks.at(-1)).toEqual({ rowStart: 21, label: '2:00 PM' })
  })
})
