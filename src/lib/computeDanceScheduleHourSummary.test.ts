import { describe, expect, it } from 'vitest'
import { computeDanceScheduleHourSummary, formatHours } from './computeDanceScheduleHourSummary'
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

describe('computeDanceScheduleHourSummary', () => {
  it('returns no rows and no dates for an empty schedule', () => {
    expect(computeDanceScheduleHourSummary([])).toEqual({ dates: [], levelRows: [], callerRows: [] })
  })

  it('tallies a single 1-hour session under its own level and caller', () => {
    const summary = computeDanceScheduleHourSummary([makeSession()])

    expect(summary.dates).toEqual([new Date('2026-07-02T00:00:00.000Z')])
    expect(summary.levelRows).toEqual([{ label: 'SSD', hoursByDate: [1], total: 1 }])
    expect(summary.callerRows).toEqual([{ label: 'Vic Ceder', hoursByDate: [1], total: 1 }])
  })

  it('sums hours across multiple sessions for the same level/caller on the same day', () => {
    const sessions = [
      makeSession({ startTime: new Date('2026-07-02T12:30:00.000Z'), endTime: new Date('2026-07-02T13:30:00.000Z') }),
      makeSession({ startTime: new Date('2026-07-02T14:00:00.000Z'), endTime: new Date('2026-07-02T15:00:00.000Z') }),
    ]
    const summary = computeDanceScheduleHourSummary(sessions)

    expect(summary.levelRows).toEqual([{ label: 'SSD', hoursByDate: [2], total: 2 }])
    expect(summary.callerRows).toEqual([{ label: 'Vic Ceder', hoursByDate: [2], total: 2 }])
  })

  it('splits a multi-level session\'s hours evenly across its distinct levels', () => {
    const session = makeSession({ levels: ['C1', 'C2'] })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.levelRows).toEqual([
      { label: 'C1', hoursByDate: [0.5], total: 0.5 },
      { label: 'C2', hoursByDate: [0.5], total: 0.5 },
    ])
  })

  it('splits a co-taught session\'s hours evenly across its distinct callers', () => {
    const session = makeSession({ callers: ['Michael Kellogg', 'Terri Sherrer'] })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.callerRows).toEqual([
      { label: 'Michael Kellogg', hoursByDate: [0.5], total: 0.5 },
      { label: 'Terri Sherrer', hoursByDate: [0.5], total: 0.5 },
    ])
  })

  it('counts a session listing the same caller twice as a single, whole share', () => {
    const session = makeSession({ callers: ['Vic Ceder', 'Vic Ceder'] })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.callerRows).toEqual([{ label: 'Vic Ceder', hoursByDate: [1], total: 1 }])
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
    expect(summary.levelRows).toEqual([])
    expect(summary.callerRows).toEqual([])
  })

  it('counts a "GCA Caller Showcase Dance" session like any other structured session', () => {
    const session = makeSession({ eventType: 'GCA Caller Showcase Dance', callers: ['Janienne Alexander'] })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.callerRows).toEqual([{ label: 'Janienne Alexander', hoursByDate: [1], total: 1 }])
  })

  it('excludes GCA credits from the caller summary entirely', () => {
    const session = makeSession({ callers: ['Vic Ceder'], gca: 'Tim Stephens' })
    const summary = computeDanceScheduleHourSummary([session])

    expect(summary.callerRows.map((row) => row.label)).toEqual(['Vic Ceder'])
  })

  it('orders level rows by the real skill progression, with Advanced/Intro/Various trailing', () => {
    const sessions = [
      makeSession({ levels: ['Various'] }),
      makeSession({ levels: ['C1'] }),
      makeSession({ levels: ['Intro'] }),
      makeSession({ levels: ['SSD'] }),
      makeSession({ levels: ['Advanced'] }),
    ]
    const summary = computeDanceScheduleHourSummary(sessions)

    expect(summary.levelRows.map((row) => row.label)).toEqual([
      'SSD',
      'C1',
      'Advanced',
      'Intro',
      'Various',
    ])
  })

  it('orders caller rows alphabetically', () => {
    const sessions = [makeSession({ callers: ['Vic Ceder'] }), makeSession({ callers: ['Allan Hurst'] })]
    const summary = computeDanceScheduleHourSummary(sessions)

    expect(summary.callerRows.map((row) => row.label)).toEqual(['Allan Hurst', 'Vic Ceder'])
  })

  it('gives each date its own column, in chronological order, with zero for days with no activity for that row', () => {
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
    expect(summary.levelRows).toEqual([
      { label: 'SSD', hoursByDate: [1, 0], total: 1 },
      { label: 'C1', hoursByDate: [0, 2], total: 2 },
    ])
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
