import { describe, expect, it } from 'vitest'
import {
  computeDanceScheduleHourSummary,
  formatHours,
  GCA_CALLER_SHOWCASE_EVENT_TYPE,
} from './computeDanceScheduleHourSummary'
import type { DanceSession } from '../types/danceSchedule'

function makeSession(overrides: Partial<DanceSession> = {}): DanceSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date('2026-07-02T12:30:00.000Z'),
    endTime: new Date('2026-07-02T13:30:00.000Z'),
    location: { kind: 'located', rooms: ['Ballroom Centre'] },
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Vic Ceder'],
    ...overrides,
  } as DanceSession
}

// A single session long enough that its solo caller alone clears MIN_CALLER_HOURS
// (3) — used by tests that care about caller-table behavior but aren't testing the
// threshold itself.
function makeLongSession(overrides: Partial<DanceSession> = {}): DanceSession {
  return makeSession({
    startTime: new Date('2026-07-02T12:00:00.000Z'),
    endTime: new Date('2026-07-02T16:00:00.000Z'), // 4 hours
    ...overrides,
  })
}

describe('computeDanceScheduleHourSummary', () => {
  it('returns empty tables and no dates for an empty schedule', () => {
    expect(computeDanceScheduleHourSummary([])).toEqual({
      dates: [],
      levels: { columns: [], totalByDate: [], grandTotal: 0 },
      callers: { columns: [], totalByDate: [], grandTotal: 0 },
    })
  })

  it('tallies a single session under its own level and caller, with matching row/grand totals', () => {
    const summary = computeDanceScheduleHourSummary([makeLongSession()])

    expect(summary.dates).toEqual([new Date('2026-07-02T00:00:00.000Z')])
    expect(summary.levels).toEqual({
      columns: [{ label: 'SSD', hoursByDate: [4], total: 4 }],
      totalByDate: [4],
      grandTotal: 4,
    })
    expect(summary.callers).toEqual({
      columns: [{ label: 'Vic Ceder', hoursByDate: [4], total: 4 }],
      totalByDate: [4],
      grandTotal: 4,
    })
  })

  it('sums hours across multiple sessions for the same level/caller on the same day', () => {
    const sessions = [
      makeSession({ startTime: new Date('2026-07-02T12:00:00.000Z'), endTime: new Date('2026-07-02T14:00:00.000Z') }),
      makeSession({ startTime: new Date('2026-07-02T15:00:00.000Z'), endTime: new Date('2026-07-02T17:00:00.000Z') }),
    ]
    const summary = computeDanceScheduleHourSummary(sessions)

    expect(summary.levels.columns).toEqual([{ label: 'SSD', hoursByDate: [4], total: 4 }])
    expect(summary.callers.columns).toEqual([{ label: 'Vic Ceder', hoursByDate: [4], total: 4 }])
  })

  it('splits a multi-level session\'s hour evenly across its distinct levels', () => {
    const session = makeSession({ levels: ['C1', 'C2'] })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.levels.columns).toEqual([
      { label: 'C1', hoursByDate: [0.5], total: 0.5 },
      { label: 'C2', hoursByDate: [0.5], total: 0.5 },
    ])
    // The two 0.5-hour columns still sum to the one session's real 1-hour duration.
    expect(summary.levels.totalByDate).toEqual([1])
    expect(summary.levels.grandTotal).toBe(1)
  })

  it('splits a co-taught session\'s hours evenly across its distinct callers', () => {
    const session = makeSession({
      startTime: new Date('2026-07-02T12:00:00.000Z'),
      endTime: new Date('2026-07-02T20:00:00.000Z'), // 8 hours / 2 callers = 4 each
      callers: ['Michael Kellogg', 'Terri Sherrer'],
    })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.callers.columns).toEqual([
      { label: 'Michael Kellogg', hoursByDate: [4], total: 4 },
      { label: 'Terri Sherrer', hoursByDate: [4], total: 4 },
    ])
  })

  it('counts a session listing the same caller twice as a single, whole share', () => {
    const session = makeLongSession({ callers: ['Vic Ceder', 'Vic Ceder'] })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.callers.columns).toEqual([{ label: 'Vic Ceder', hoursByDate: [4], total: 4 }])
  })

  it('ignores freeform sessions entirely — no level or caller to attribute hours to', () => {
    const freeform: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T12:00:00.000Z'),
      endTime: new Date('2026-07-02T13:00:00.000Z'),
      location: { kind: 'roomless' },
      description: 'Lunch Break',
    }
    const summary = computeDanceScheduleHourSummary([freeform])

    expect(summary.dates).toEqual([new Date('2026-07-02T00:00:00.000Z')])
    expect(summary.levels).toEqual({ columns: [], totalByDate: [0], grandTotal: 0 })
    expect(summary.callers).toEqual({ columns: [], totalByDate: [0], grandTotal: 0 })
  })

  it('counts a "GCA Caller Showcase Dance" session like any other structured session', () => {
    const session = makeLongSession({ eventType: GCA_CALLER_SHOWCASE_EVENT_TYPE, callers: ['Janienne Alexander'] })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.callers.columns).toEqual([{ label: 'Janienne Alexander', hoursByDate: [4], total: 4 }])
  })

  it('excludes GCA credits from the caller summary entirely', () => {
    const session = makeLongSession({ callers: ['Vic Ceder'], gca: 'Tim Stephens' })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.callers.columns.map((column) => column.label)).toEqual(['Vic Ceder'])
  })

  describe('MIN_CALLER_HOURS filtering', () => {
    it('excludes a caller whose total is exactly 3 hours', () => {
      const session = makeSession({
        startTime: new Date('2026-07-02T12:00:00.000Z'),
        endTime: new Date('2026-07-02T15:00:00.000Z'), // exactly 3 hours
      })
      const summary = computeDanceScheduleHourSummary([session])

      expect(summary.callers.columns).toEqual([])
      // Their (excluded) hours still don't silently leak into the table's own totals.
      expect(summary.callers.totalByDate).toEqual([0])
      expect(summary.callers.grandTotal).toBe(0)
    })

    it('includes a caller at or under the default 3-hour floor when minCallerHours is overridden to 0', () => {
      const session = makeSession({
        startTime: new Date('2026-07-02T12:00:00.000Z'),
        endTime: new Date('2026-07-02T15:00:00.000Z'), // exactly 3 hours — excluded by default, per the test above
      })
      const summary = computeDanceScheduleHourSummary([session], { minCallerHours: 0 })

      expect(summary.callers.columns).toEqual([{ label: 'Vic Ceder', hoursByDate: [3], total: 3 }])
    })

    it('includes a caller whose total is more than 3 hours', () => {
      const session = makeSession({
        startTime: new Date('2026-07-02T12:00:00.000Z'),
        endTime: new Date('2026-07-02T15:30:00.000Z'), // 3.5 hours
      })
      const summary = computeDanceScheduleHourSummary([session])

      expect(summary.callers.columns).toEqual([{ label: 'Vic Ceder', hoursByDate: [3.5], total: 3.5 }])
    })

    it('does not apply the same threshold to levels', () => {
      // A level with only 1 hour still appears — MIN_CALLER_HOURS is caller-only.
      const summary = computeDanceScheduleHourSummary([makeSession()])
      expect(summary.levels.columns).toEqual([{ label: 'SSD', hoursByDate: [1], total: 1 }])
    })
  })

  it('orders level columns by the real skill progression, with Intro/Various trailing', () => {
    const sessions = [
      makeSession({ levels: ['Various'] }),
      makeSession({ levels: ['C1'] }),
      makeSession({ levels: ['Intro'] }),
      makeSession({ levels: ['SSD'] }),
    ]
    const summary = computeDanceScheduleHourSummary(sessions)

    expect(summary.levels.columns.map((column) => column.label)).toEqual(['SSD', 'C1', 'Intro', 'Various'])
  })

  it('orders caller columns by descending total hours, ties broken alphabetically', () => {
    const sessions = [
      makeLongSession({ callers: ['Vic Ceder'] }), // 4h
      makeSession({
        callers: ['Allan Hurst'],
        startTime: new Date('2026-07-02T12:00:00.000Z'),
        endTime: new Date('2026-07-02T18:00:00.000Z'), // 6h
      }),
      makeLongSession({ callers: ['Terri Sherrer'] }), // 4h — ties Vic Ceder
    ]
    const summary = computeDanceScheduleHourSummary(sessions)

    expect(summary.callers.columns.map((column) => column.label)).toEqual([
      'Allan Hurst',
      'Terri Sherrer',
      'Vic Ceder',
    ])
    expect(summary.callers.groupBoundary).toBeUndefined()
  })

  describe('headline vs. GCA-showcase-only grouping', () => {
    it('leaves groupBoundary unset when every included caller is showcase-only', () => {
      const session = makeLongSession({ eventType: GCA_CALLER_SHOWCASE_EVENT_TYPE, callers: ['Janienne Alexander'] })
      const summary = computeDanceScheduleHourSummary([session])

      expect(summary.callers.columns.map((column) => column.label)).toEqual(['Janienne Alexander'])
      expect(summary.callers.groupBoundary).toBeUndefined()
    })

    it('groups headline callers first (each group sorted by descending hours), with a boundary between them', () => {
      const sessions = [
        makeLongSession({ callers: ['Vic Ceder'] }), // headline, 4h
        makeSession({
          callers: ['Allan Hurst'],
          startTime: new Date('2026-07-02T12:00:00.000Z'),
          endTime: new Date('2026-07-02T18:00:00.000Z'), // headline, 6h
        }),
        makeLongSession({ eventType: GCA_CALLER_SHOWCASE_EVENT_TYPE, callers: ['Janienne Alexander'] }), // showcase-only, 4h
        makeSession({
          eventType: GCA_CALLER_SHOWCASE_EVENT_TYPE,
          callers: ['Bill van Melle'],
          startTime: new Date('2026-07-02T12:00:00.000Z'),
          endTime: new Date('2026-07-02T15:30:00.000Z'), // showcase-only, 3.5h
        }),
      ]
      const summary = computeDanceScheduleHourSummary(sessions)

      expect(summary.callers.columns.map((column) => column.label)).toEqual([
        'Allan Hurst',
        'Vic Ceder',
        'Janienne Alexander',
        'Bill van Melle',
      ])
      expect(summary.callers.groupBoundary).toBe(2)
    })

    it('treats a caller with both a headline session and a showcase session as headline', () => {
      const sessions = [
        makeLongSession({ callers: ['Vic Ceder'] }), // headline, 4h
        makeSession({
          eventType: GCA_CALLER_SHOWCASE_EVENT_TYPE,
          callers: ['Vic Ceder'],
          startTime: new Date('2026-07-02T12:00:00.000Z'),
          endTime: new Date('2026-07-02T13:30:00.000Z'), // +1.5h showcase, still headline overall
        }),
        makeLongSession({ eventType: GCA_CALLER_SHOWCASE_EVENT_TYPE, callers: ['Janienne Alexander'] }), // showcase-only, 4h
      ]
      const summary = computeDanceScheduleHourSummary(sessions)

      expect(summary.callers.columns).toEqual([
        { label: 'Vic Ceder', hoursByDate: [5.5], total: 5.5 },
        { label: 'Janienne Alexander', hoursByDate: [4], total: 4 },
      ])
      expect(summary.callers.groupBoundary).toBe(1)
    })
  })

  it('gives each date its own column position, in chronological order, with zero for days with no activity for that row', () => {
    const sessions = [
      makeSession({
        date: new Date('2026-07-02T00:00:00.000Z'),
        startTime: new Date('2026-07-02T12:00:00.000Z'),
        endTime: new Date('2026-07-02T13:00:00.000Z'),
        levels: ['SSD'],
      }),
      makeSession({
        date: new Date('2026-07-03T00:00:00.000Z'),
        startTime: new Date('2026-07-03T12:00:00.000Z'),
        endTime: new Date('2026-07-03T14:00:00.000Z'),
        levels: ['C1'],
      }),
    ]
    const summary = computeDanceScheduleHourSummary(sessions)

    expect(summary.dates).toEqual([
      new Date('2026-07-02T00:00:00.000Z'),
      new Date('2026-07-03T00:00:00.000Z'),
    ])
    expect(summary.levels.columns).toEqual([
      { label: 'SSD', hoursByDate: [1, 0], total: 1 },
      { label: 'C1', hoursByDate: [0, 2], total: 2 },
    ])
    expect(summary.levels.totalByDate).toEqual([1, 2])
    expect(summary.levels.grandTotal).toBe(3)
  })
})

describe('formatHours', () => {
  it('drops trailing zeros for a whole number', () => {
    expect(formatHours(4)).toBe('4')
  })

  it('keeps a clean half-hour value as-is', () => {
    expect(formatHours(4.5)).toBe('4.5')
  })

  it('rounds a repeating decimal (a 3-way split) to 2 places', () => {
    expect(formatHours(1 / 3)).toBe('0.33')
  })
})
