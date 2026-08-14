import { afterEach, describe, expect, it } from 'vitest'
import { computeDanceScheduleTimeAxis, isContiguous } from './computeDanceScheduleTimeAxis'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

afterEach(() => {
  Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true })
})

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

function makeSession(
  startTime: string,
  endTime: string,
  overrides: Partial<DanceSession> = {},
): DanceSession {
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

function makeRoomless(startTime: string, endTime: string, description = 'Dinner Break'): DanceSession {
  return {
    kind: 'freeform',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    location: { kind: 'roomless' },
    description,
  }
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
  it('returns null when there are no visible sessions at all', () => {
    expect(computeDanceScheduleTimeAxis([])).toBeNull()
  })

  it('places one mark per distinct start/end time, with no unlabeled gaps', () => {
    const session = makeSession('2026-07-02T12:15:00.000Z', '2026-07-02T14:45:00.000Z')
    const axis = computeDanceScheduleTimeAxis([session])

    // Exactly 2 ticks (its own start and end) — a fixed clock grid would have
    // inserted marks at every hour/half-hour in between; this doesn't, because
    // nothing else happens at those in-between times.
    expect(axis?.timeMarks).toEqual([
      { rowStart: 1, label: '12:15 PM' },
      { rowStart: 2, label: '2:45 PM' },
    ])
    expect(axis?.totalRows).toBe(1)
  })

  it("formats time-mark labels in the viewer's own locale, still pinned to UTC", () => {
    Object.defineProperty(navigator, 'languages', { value: ['fr-FR'], configurable: true })
    const session = makeSession('2026-07-02T12:15:00.000Z', '2026-07-02T14:45:00.000Z')

    const axis = computeDanceScheduleTimeAxis([session])

    expect(axis?.timeMarks.map((mark) => mark.label)).toEqual(['12:15', '14:45'])
  })

  it('gives an isolated session rowSpan 1, regardless of its real duration', () => {
    // A 30-minute session and a session that's actually a fixed-clock "half hour"
    // both get the same rowSpan here — this axis has no concept of a half hour at
    // all, only "the next thing that happens."
    const thirtyMin = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z')
    const axis = computeDanceScheduleTimeAxis([thirtyMin])

    expect(axis?.rowStartFor(thirtyMin.startTime)).toBe(1)
    expect(axis?.rowSpanFor(thirtyMin.startTime, thirtyMin.endTime)).toBe(1)
    expect(axis?.totalRows).toBe(1)
  })

  it('collapses a long gap with nothing scheduled in it to a single row', () => {
    // A 3-hour gap between two sessions is just "the next thing that happens" —
    // one row, exactly like a 15-minute gap would be. No elision/compression
    // machinery needed to achieve this; it falls straight out of the tick-based
    // model.
    const morning = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z')
    const afternoon = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', {
      location: located('Ballroom East'),
    })
    const axis = computeDanceScheduleTimeAxis([morning, afternoon])

    expect(axis?.timeMarks.map((mark) => mark.label)).toEqual([
      '9:00 AM',
      '10:00 AM',
      '1:00 PM',
      '2:00 PM',
    ])
    // 3 rows total: 9-10 (morning), 10-1 (the gap, despite being 3 real hours), 1-2
    // (afternoon) — not 4+ rows like a proportional/clock-based axis would need.
    expect(axis?.totalRows).toBe(3)
    expect(axis?.rowSpanFor(morning.startTime, morning.endTime)).toBe(1)
    expect(axis?.rowSpanFor(afternoon.startTime, afternoon.endTime)).toBe(1)
  })

  it('collapses a very long roomless break with nothing else scheduled during it to a single row', () => {
    const dinner = makeRoomless('2026-07-02T18:00:00.000Z', '2026-07-02T20:30:00.000Z')
    const axis = computeDanceScheduleTimeAxis([dinner])

    expect(axis?.totalRows).toBe(1)
    expect(axis?.rowSpanFor(dinner.startTime, dinner.endTime)).toBe(1)
  })

  it('dedupes two sessions that share an exact boundary (one ends when another starts) to one row', () => {
    const first = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z')
    const second = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', {
      location: located('Ballroom East'),
    })
    const axis = computeDanceScheduleTimeAxis([first, second])

    expect(axis?.timeMarks.map((mark) => mark.label)).toEqual(['12:00 PM', '1:00 PM', '2:00 PM'])
    expect(axis?.rowStartFor(first.endTime)).toBe(axis?.rowStartFor(second.startTime))
  })

  it('shares rows with a concurrent session in another room', () => {
    const roomA = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z')
    const roomB = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z', {
      location: located('Ballroom East'),
    })
    const axis = computeDanceScheduleTimeAxis([roomA, roomB])

    expect(axis?.timeMarks).toHaveLength(2)
    expect(axis?.rowStartFor(roomA.startTime)).toBe(axis?.rowStartFor(roomB.startTime))
    expect(axis?.rowStartFor(roomA.endTime)).toBe(axis?.rowStartFor(roomB.endTime))
  })

  it('gives a long event a taller rowSpan than any one of several shorter concurrent events in another room', () => {
    // The stress case: one 3-hour session in Room D, while Room A runs three
    // separate back-to-back 1-hour sessions during that same span. Room A's own
    // boundaries (10:00, 11:00) are ticks shared across every column, so the long
    // session's rowSpan naturally comes out taller — no special-casing.
    const long = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T12:00:00.000Z', {
      location: located('Test Room D'),
    })
    const first = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', {
      location: located('Test Room A'),
    })
    const second = makeSession('2026-07-02T10:00:00.000Z', '2026-07-02T11:00:00.000Z', {
      location: located('Test Room A'),
    })
    const third = makeSession('2026-07-02T11:00:00.000Z', '2026-07-02T12:00:00.000Z', {
      location: located('Test Room A'),
    })
    const axis = computeDanceScheduleTimeAxis([long, first, second, third])

    expect(axis?.timeMarks.map((mark) => mark.label)).toEqual([
      '9:00 AM',
      '10:00 AM',
      '11:00 AM',
      '12:00 PM',
    ])
    expect(axis?.rowSpanFor(long.startTime, long.endTime)).toBe(3)
    expect(axis?.rowSpanFor(first.startTime, first.endTime)).toBe(1)
    expect(axis?.rowSpanFor(second.startTime, second.endTime)).toBe(1)
    expect(axis?.rowSpanFor(third.startTime, third.endTime)).toBe(1)
  })
})
