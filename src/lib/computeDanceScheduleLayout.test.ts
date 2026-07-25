import { describe, expect, it } from 'vitest'
import { computeDanceScheduleLayout } from './computeDanceScheduleLayout'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

function makeSession(
  startTime: string,
  endTime: string,
  location: SessionLocation,
  overrides: Partial<DanceSession> = {},
): DanceSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    location,
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  } as DanceSession
}

describe('computeDanceScheduleLayout', () => {
  it('returns an empty layout for no sessions', () => {
    expect(computeDanceScheduleLayout([], [])).toEqual({
      visibleRooms: [],
      totalRowUnits: 0,
      hourMarks: [],
      placements: [],
    })
  })

  it('floors dayStart and ceils dayEnd to the nearest hour', () => {
    const session = makeSession(
      '2026-07-02T12:15:00.000Z',
      '2026-07-02T12:45:00.000Z',
      located('Ballroom Centre'),
    )
    const layout = computeDanceScheduleLayout([session], [session])

    // dayStart floors to 12:00, dayEnd ceils to 13:00 -> 4 units of 15 minutes.
    expect(layout.totalRowUnits).toBe(4)
    expect(layout.hourMarks).toEqual([
      { rowStart: 1, label: '12:00 PM' },
      { rowStart: 5, label: '1:00 PM' },
    ])
  })

  it('computes rowStart/rowSpan for 30- and 45-minute sessions', () => {
    const thirtyMin = makeSession(
      '2026-07-02T12:00:00.000Z',
      '2026-07-02T12:30:00.000Z',
      located('Ballroom Centre'),
    )
    const fortyFiveMin = makeSession(
      '2026-07-02T12:30:00.000Z',
      '2026-07-02T13:15:00.000Z',
      located('Ballroom East'),
    )
    const layout = computeDanceScheduleLayout(
      [thirtyMin, fortyFiveMin],
      [thirtyMin, fortyFiveMin],
    )

    const first = layout.placements.find((p) => p.session === thirtyMin)
    const second = layout.placements.find((p) => p.session === fortyFiveMin)
    expect(first).toMatchObject({ rowStart: 1, rowSpan: 2 })
    expect(second).toMatchObject({ rowStart: 3, rowSpan: 3 })
  })

  it('orders visible rooms by first chronological occurrence, not alphabetically', () => {
    const first = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom West'))
    const second = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom Centre'))
    const layout = computeDanceScheduleLayout([first, second], [first, second])

    expect(layout.visibleRooms).toEqual(['Ballroom West', 'Ballroom Centre'])
  })

  it('hides a room column once nothing in it is visible, without reshuffling the rest', () => {
    const centre = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom Centre'), {
      levels: ['SSD'],
    })
    const east = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom East'), {
      levels: ['C4'],
    })
    const west = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom West'), {
      levels: ['SSD'],
    })
    const dateSessions = [centre, east, west]
    // East filtered out, but its column-order position among the others is preserved.
    const visibleSessions = [centre, west]

    const layout = computeDanceScheduleLayout(dateSessions, visibleSessions)

    expect(layout.visibleRooms).toEqual(['Ballroom Centre', 'Ballroom West'])
  })

  it('keeps day time bounds fixed to the unfiltered session list, not the filtered one', () => {
    const early = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T09:30:00.000Z', located('Ballroom Centre'), {
      levels: ['C4'],
    })
    const late = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom East'), {
      levels: ['SSD'],
    })
    const dateSessions = [early, late]
    const visibleSessions = [late] // early filtered out by level

    const layout = computeDanceScheduleLayout(dateSessions, visibleSessions)

    // Bounds still span 9:00-14:00 even though only the 13:00 session is visible.
    expect(layout.hourMarks[0]).toEqual({ rowStart: 1, label: '9:00 AM' })
    expect(layout.hourMarks.at(-1)).toEqual({ rowStart: 21, label: '2:00 PM' })
  })

  it('gives a contiguous multi-room session a single spanning placement', () => {
    const centre = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom Centre'))
    const combined = makeSession(
      '2026-07-02T10:15:00.000Z',
      '2026-07-02T11:00:00.000Z',
      located('Ballroom Centre', 'Ballroom East'),
    )
    const layout = computeDanceScheduleLayout([combined, centre], [combined, centre])

    const placements = layout.placements.filter((p) => p.session === combined)
    expect(placements).toHaveLength(1)
    expect(placements[0]).toMatchObject({ columnStart: 0, columnSpan: 2 })
  })

  it('falls back to one placement per room for a non-contiguous multi-room session', () => {
    const centre = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom Centre'))
    const east = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom East'))
    const west = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom West'))
    // Spans Centre (index 0) and West (index 2), skipping East (index 1) — non-contiguous.
    const spanning = makeSession(
      '2026-07-02T10:15:00.000Z',
      '2026-07-02T11:00:00.000Z',
      located('Ballroom Centre', 'Ballroom West'),
    )
    const dateSessions = [centre, east, west, spanning]

    const layout = computeDanceScheduleLayout(dateSessions, dateSessions)

    const placements = layout.placements.filter((p) => p.session === spanning)
    expect(placements).toHaveLength(2)
    expect(placements.map((p) => ({ columnStart: p.columnStart, columnSpan: p.columnSpan }))).toEqual([
      { columnStart: 0, columnSpan: 1 },
      { columnStart: 2, columnSpan: 1 },
    ])
  })

  it('spans every visible room column for a roomless session', () => {
    const centre = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom Centre'))
    const east = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom East'))
    const lunch = makeSession(
      '2026-07-02T12:00:00.000Z',
      '2026-07-02T13:00:00.000Z',
      { kind: 'roomless' },
      { kind: 'freeform', description: 'Lunch Break' },
    )
    const dateSessions = [lunch, centre, east]

    const layout = computeDanceScheduleLayout(dateSessions, dateSessions)

    const placement = layout.placements.find((p) => p.session === lunch)
    expect(placement).toMatchObject({ columnStart: 0, columnSpan: 2 })
  })

  it('gives a roomless session a span of at least 1 even when no room columns are visible', () => {
    const lunch = makeSession(
      '2026-07-02T12:00:00.000Z',
      '2026-07-02T13:00:00.000Z',
      { kind: 'roomless' },
      { kind: 'freeform', description: 'Lunch Break' },
    )
    const layout = computeDanceScheduleLayout([lunch], [lunch])

    expect(layout.visibleRooms).toEqual([])
    expect(layout.placements[0]).toMatchObject({ columnStart: 0, columnSpan: 1 })
  })

  it('sorts placements by rowStart then columnStart', () => {
    const later = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', located('Ballroom East'))
    const earlier = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', located('Ballroom Centre'))
    const layout = computeDanceScheduleLayout([later, earlier], [later, earlier])

    expect(layout.placements.map((p) => p.session)).toEqual([earlier, later])
  })
})
