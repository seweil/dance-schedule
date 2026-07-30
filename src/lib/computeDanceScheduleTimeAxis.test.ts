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

describe('eliding a long roomless session (e.g. a meal break)', () => {
  it('does not elide a roomless session of 1 hour or less', () => {
    const lunch = makeRoomless('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z', 'Lunch Break')
    const later = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z')
    const axis = computeDanceScheduleTimeAxis([lunch, later], [lunch, later])

    expect(axis?.rowSpanFor(lunch.startTime, lunch.endTime)).toBe(4)
    expect(axis?.rowStartFor(later.startTime)).toBe(5) // unaffected — no elision
    expect(axis?.elisionMarkers).toEqual([])
  })

  it("elides a roomless session's excess duration beyond 1 hour from its middle, shifting everything after it up", () => {
    // 6:00-8:30 PM (2.5 hours) — the visible 1-hour budget splits evenly: the
    // first 30 min (6:00-6:30) and last 30 min (8:00-8:30) stay visible; the
    // middle 1.5 hours (6:30-8:00) is elided.
    const dinner = makeRoomless('2026-07-02T18:00:00.000Z', '2026-07-02T20:30:00.000Z')
    // A real, un-elided 30-minute gap between the break's actual end (8:30) and
    // this session (9:00) must still show up as a genuine 30-minute gap after
    // compression, not be swallowed into the elision too.
    const later = makeSession('2026-07-02T21:00:00.000Z', '2026-07-02T22:00:00.000Z')
    const axis = computeDanceScheduleTimeAxis([dinner, later], [dinner, later])

    // Dinner's own card: capped to 1 hour's worth of rows (4 units), same as
    // before — but now because the axis compressed, not because the card itself
    // was clipped.
    expect(axis?.rowSpanFor(dinner.startTime, dinner.endTime)).toBe(4)
    // 9:00 PM would be row 13 (3 hours * 4 units + 1) with no compression;
    // compressed, it's only 1 hour (dinner's visible portion) + 30 real minutes
    // (the genuine gap) after dayStart (6:00 PM) = 1.5 hours = row 7. The total
    // elided amount is the same regardless of where in the break it sits, so
    // this doesn't change from a tail-elision approach.
    expect(axis?.rowStartFor(later.startTime)).toBe(7)
  })

  it("reduces totalRowUnits by the elided amount, and marks the elision's row in elisionMarkers", () => {
    const dinner = makeRoomless('2026-07-02T18:00:00.000Z', '2026-07-02T20:30:00.000Z')
    const axis = computeDanceScheduleTimeAxis([dinner], [dinner])

    // dayEnd ceils 8:30 PM up to 9:00 PM (12 raw units from 6:00 PM) — the 6
    // elided units (1.5 hours: 6:30-8:00 PM) are gone, but the genuine trailing
    // 8:30-9:00 half hour is real time, not elided, and still counts: 12 - 6 = 6.
    expect(axis?.totalRowUnits).toBe(6)
    // The break's first 30 minutes occupy rows 1-2 — the elision marker sits
    // right after that, at row 3, marking where the middle of the break was cut.
    expect(axis?.elisionMarkers).toEqual([3])
  })

  it('does not elide when another session overlaps the excess portion', () => {
    const dinner = makeRoomless('2026-07-02T18:00:00.000Z', '2026-07-02T20:30:00.000Z')
    // Overlaps 7:30-8:00 PM, squarely inside dinner's would-be-elided excess
    // (6:30-8:00 PM) — eliding that stretch would corrupt this session's own
    // position, so neither should be compressed.
    const conflicting = makeSession('2026-07-02T19:30:00.000Z', '2026-07-02T20:00:00.000Z')
    const axis = computeDanceScheduleTimeAxis([dinner, conflicting], [dinner, conflicting])

    expect(axis?.rowSpanFor(dinner.startTime, dinner.endTime)).toBe(10) // full, uncompressed span
    expect(axis?.elisionMarkers).toEqual([])
  })

  it('drops an hour mark that falls inside the elided middle stretch entirely, rather than just deduping it against a neighbor', () => {
    const dinner = makeRoomless('2026-07-02T18:00:00.000Z', '2026-07-02T20:30:00.000Z')
    const axis = computeDanceScheduleTimeAxis([dinner], [dinner])

    // 7:00 PM falls strictly inside the elided 6:30-8:00 PM stretch and is
    // dropped outright — it never even reaches simple adjacent-row dedup, since
    // it wouldn't collide with the previous kept mark (6:00 PM) at all.
    expect(axis?.hourMarks.map((mark) => mark.label)).not.toContain('7:00 PM')
    const rowStarts = axis?.hourMarks.map((mark) => mark.rowStart)
    expect(rowStarts).toEqual([...new Set(rowStarts)])
  })

  it('drops the label that falls inside the elided middle, not the one after it — so the mark right after a break matches when the next event actually starts', () => {
    // A 2-hour lunch (exactly 1 hour of excess): budget splits into 30 min
    // visible at noon, 30 min visible at 1:30, with the 12:30-1:30 middle
    // elided. 1:00 PM falls inside that elided middle; 2:00 PM — the real time
    // the next event starts — does not, and must still be shown.
    const lunch = makeRoomless('2026-07-02T12:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Lunch Break')
    const axis = computeDanceScheduleTimeAxis([lunch], [lunch])

    expect(axis?.hourMarks).toEqual([
      { rowStart: 1, label: '12:00 PM' },
      { rowStart: 5, label: '2:00 PM' },
    ])
    expect(axis?.elisionMarkers).toEqual([3])
  })

  it('drops an hour mark that lands exactly on the elision boundary too, not just strictly inside it', () => {
    // A 90-minute lunch: budget splits into 30 min visible at noon, 30 min
    // visible at 1:00-1:30, with the middle 12:30-1:00 elided. 1:00 PM is
    // exactly the elision's trailing edge (not strictly "inside" it) — but it
    // still compresses to the identical row as the marker itself (every point
    // in an elided interval collapses to one row), so showing it would stack a
    // text label directly onto the marker. Dropping it avoids that crowding.
    const lunch = makeRoomless('2026-07-02T12:00:00.000Z', '2026-07-02T13:30:00.000Z', 'Lunch Break')
    const axis = computeDanceScheduleTimeAxis([lunch], [lunch])

    expect(axis?.hourMarks.map((mark) => mark.label)).toEqual(['12:00 PM', '2:00 PM'])
    expect(axis?.elisionMarkers).toEqual([3])
    // The marker's row and every kept mark's row are all distinct — nothing
    // shares a row with the marker.
    const markerRows = new Set(axis?.elisionMarkers)
    for (const mark of axis?.hourMarks ?? []) {
      expect(markerRows.has(mark.rowStart)).toBe(false)
    }
  })
})
