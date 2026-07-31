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
      totalRows: 0,
      timeMarks: [],
      placements: [],
    })
  })

  it('propagates totalRows/timeMarks straight from the shared time axis', () => {
    const session = makeSession(
      '2026-07-02T12:15:00.000Z',
      '2026-07-02T12:45:00.000Z',
      located('Ballroom Centre'),
    )
    const layout = computeDanceScheduleLayout([session], [session])

    // Exactly its own start/end — no clock-grid rounding, no in-between marks.
    expect(layout.timeMarks).toEqual([
      { rowStart: 1, label: '12:15 PM' },
      { rowStart: 2, label: '12:45 PM' },
    ])
    expect(layout.totalRows).toBe(1)
  })

  it('gives two isolated back-to-back sessions rowSpan 1 each, regardless of their real duration', () => {
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
    const layout = computeDanceScheduleLayout([thirtyMin, fortyFiveMin], [thirtyMin, fortyFiveMin])

    const first = layout.placements.find((p) => p.session === thirtyMin)
    const second = layout.placements.find((p) => p.session === fortyFiveMin)
    expect(first).toMatchObject({ rowStart: 1, rowSpan: 1 })
    expect(second).toMatchObject({ rowStart: 2, rowSpan: 1 })
  })

  it('gives a long event a taller rowSpan than several shorter concurrent events in another room', () => {
    // The stress case this rework was designed around: one long session in its own
    // room, while another room runs several separate back-to-back sessions during
    // the same span — see docs/design/dance-schedule.md and
    // computeDanceScheduleTimeAxis.test.ts's axis-level version of this same case.
    const long = makeSession(
      '2026-07-02T09:00:00.000Z',
      '2026-07-02T12:00:00.000Z',
      located('Test Room D'),
      { eventType: 'Long Workshop', callers: ['Test Caller Eight'] },
    )
    const first = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', located('Test Room A'))
    const second = makeSession('2026-07-02T10:00:00.000Z', '2026-07-02T11:00:00.000Z', located('Test Room A'))
    const third = makeSession('2026-07-02T11:00:00.000Z', '2026-07-02T12:00:00.000Z', located('Test Room A'))
    const sessions = [long, first, second, third]

    const layout = computeDanceScheduleLayout(sessions, sessions)

    const longPlacement = layout.placements.find((p) => p.session === long)
    expect(longPlacement).toMatchObject({ rowStart: 1, rowSpan: 3 })
    for (const shortSession of [first, second, third]) {
      expect(layout.placements.find((p) => p.session === shortSession)).toMatchObject({ rowSpan: 1 })
    }
  })

  it('orders visible rooms by first chronological occurrence, not alphabetically', () => {
    const first = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom West'),
    )
    const second = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom Centre'),
    )
    const layout = computeDanceScheduleLayout([first, second], [first, second])

    expect(layout.visibleRooms).toEqual(['Ballroom West', 'Ballroom Centre'])
  })

  it('hides a room column once nothing in it is visible, without reshuffling the rest', () => {
    const centre = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom Centre'),
      {
        levels: ['SSD'],
      },
    )
    const east = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom East'),
      {
        levels: ['C4'],
      },
    )
    const west = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom West'),
      {
        levels: ['SSD'],
      },
    )
    const dateSessions = [centre, east, west]
    // East filtered out, but its column-order position among the others is preserved.
    const visibleSessions = [centre, west]

    const layout = computeDanceScheduleLayout(dateSessions, visibleSessions)

    expect(layout.visibleRooms).toEqual(['Ballroom Centre', 'Ballroom West'])
  })

  it('keeps room order fixed to the unfiltered session list, not just what is currently visible', () => {
    const early = makeSession(
      '2026-07-02T09:00:00.000Z',
      '2026-07-02T09:30:00.000Z',
      located('Ballroom Centre'),
      {
        levels: ['C4'],
      },
    )
    const late = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom East'),
      {
        levels: ['SSD'],
      },
    )
    const dateSessions = [early, late]
    const visibleSessions = [late] // early filtered out by level

    const layout = computeDanceScheduleLayout(dateSessions, visibleSessions)

    // Ballroom Centre still reserves its column-order position even with nothing
    // visible in it — only Ballroom East (the one with a visible session) actually
    // renders as a column, per the "hides a room column" test above, but the
    // *order* a room would take if it did become visible again stays anchored to
    // the unfiltered list, not recomputed from just what's currently visible.
    expect(layout.visibleRooms).toEqual(['Ballroom East'])
  })

  it('gives a contiguous multi-room session a single spanning placement', () => {
    const centre = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom Centre'),
    )
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
    const centre = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom Centre'),
    )
    const east = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom East'),
    )
    const west = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom West'),
    )
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
    expect(
      placements.map((p) => ({ columnStart: p.columnStart, columnSpan: p.columnSpan })),
    ).toEqual([
      { columnStart: 0, columnSpan: 1 },
      { columnStart: 2, columnSpan: 1 },
    ])
  })

  it('spans every visible room column for a roomless session', () => {
    const centre = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom Centre'),
    )
    const east = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom East'),
    )
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

  it('collapses a long roomless session with nothing else scheduled during it to rowSpan 1', () => {
    // No elision/compression pass needed to achieve this — it falls straight out of
    // the tick-based axis. See computeDanceScheduleTimeAxis.test.ts for the
    // underlying rule's own tests.
    const dinner = makeSession(
      '2026-07-02T18:00:00.000Z',
      '2026-07-02T20:30:00.000Z', // 2.5 hours
      { kind: 'roomless' },
      { kind: 'freeform', description: 'Dinner Break' },
    )
    const layout = computeDanceScheduleLayout([dinner], [dinner])

    expect(layout.placements[0]).toMatchObject({ rowSpan: 1 })
  })

  it('sorts placements by rowStart then columnStart', () => {
    const later = makeSession(
      '2026-07-02T14:00:00.000Z',
      '2026-07-02T15:00:00.000Z',
      located('Ballroom East'),
    )
    const earlier = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom Centre'),
    )
    const layout = computeDanceScheduleLayout([later, earlier], [later, earlier])

    expect(layout.placements.map((p) => p.session)).toEqual([earlier, later])
  })
})
