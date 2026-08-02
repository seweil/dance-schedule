import { describe, expect, it } from 'vitest'
import {
  callerColumnWidthPx,
  CALLER_COLUMN_WIDTH_PX,
  computeDanceScheduleCallerLayout,
} from './computeDanceScheduleCallerLayout'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

function makeSession(
  startTime: string,
  endTime: string,
  callers: string[],
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
    callers,
    ...overrides,
  } as DanceSession
}

function makeFreeform(startTime: string, endTime: string, overrides: Partial<DanceSession> = {}): DanceSession {
  return {
    kind: 'freeform',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    location: located('Drummond Ballroom'),
    description: 'Country Western Dance',
    ...overrides,
  } as DanceSession
}

// A caller only gets a column once they have MORE THAN 3 dances that day — pad a
// caller of interest with this many extra, non-overlapping, early-morning sessions
// (disjoint from any test's own daytime scenario) so the specific behavior under
// test isn't entangled with the dance-count threshold itself.
function padDances(caller: string, count = 4): DanceSession[] {
  return Array.from({ length: count }, (_, i) =>
    makeSession(
      `2026-07-02T0${i}:00:00.000Z`,
      `2026-07-02T0${i}:30:00.000Z`,
      [caller],
      { location: located('Padding Room') },
    ),
  )
}

describe('computeDanceScheduleCallerLayout', () => {
  it('returns an empty layout for no sessions', () => {
    expect(computeDanceScheduleCallerLayout([], [])).toEqual({
      visibleCallers: [],
      columnWidthsPx: [],
      totalRows: 0,
      timeMarks: [],
      placements: [],
    })
  })

  it('places a single-caller session in its caller column', () => {
    const padding = padDances('Vic Ceder')
    const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const sessions = [...padding, session]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Vic Ceder'])
    const placement = layout.placements.find((p) => p.session === session)
    expect(placement).toMatchObject({
      session,
      rowSpan: 1,
      columnStart: 0,
      columnSpan: 1,
      lane: 0,
      laneCount: 1,
    })
  })

  it('fans a co-taught session out to one placement in each of its callers own columns', () => {
    const padding = [...padDances('Michael Kellogg'), ...padDances('Terri Sherrer')]
    const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', [
      'Michael Kellogg',
      'Terri Sherrer',
    ])
    const sessions = [...padding, session]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Michael Kellogg', 'Terri Sherrer'])
    const placements = layout.placements.filter((p) => p.session === session)
    expect(placements).toHaveLength(2)
    expect(placements.map((p) => p.columnStart).sort()).toEqual([0, 1])
    for (const placement of placements) {
      expect(placement).toMatchObject({ columnSpan: 1, lane: 0, laneCount: 1 })
    }
  })

  it('orders visible callers by first chronological occurrence, not alphabetically', () => {
    const padding = [...padDances('Vic Ceder'), ...padDances('Allan Hurst')]
    const first = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const second = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Allan Hurst'])
    const sessions = [...padding, first, second]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Vic Ceder', 'Allan Hurst'])
  })

  it('hides a caller column once nothing in it is visible, without reshuffling the rest', () => {
    const cederDances = padDances('Vic Ceder').map((s) => ({ ...s, levels: ['SSD'] }) as DanceSession)
    const jensenDances = padDances('Kris Jensen').map((s) => ({ ...s, levels: ['SSD'] }) as DanceSession)
    const hurstDances = padDances('Allan Hurst').map((s) => ({ ...s, levels: ['C4'] }) as DanceSession)
    const dateSessions = [...cederDances, ...hurstDances, ...jensenDances]
    // Hurst filtered out by level entirely (0 visible dances), but the remaining
    // callers' column-order positions are preserved.
    const visibleSessions = [...cederDances, ...jensenDances]

    const layout = computeDanceScheduleCallerLayout(dateSessions, visibleSessions)

    expect(layout.visibleCallers).toEqual(['Vic Ceder', 'Kris Jensen'])
  })

  it('keeps caller order fixed to the unfiltered session list, not just what is currently visible', () => {
    const cederDances = padDances('Vic Ceder').map((s) => ({ ...s, levels: ['C4'] }) as DanceSession)
    const hurstDances = padDances('Allan Hurst').map((s) => ({ ...s, levels: ['SSD'] }) as DanceSession)
    const dateSessions = [...cederDances, ...hurstDances] // Vic Ceder appears first
    const visibleSessions = hurstDances // Vic Ceder filtered out entirely by level

    const layout = computeDanceScheduleCallerLayout(dateSessions, visibleSessions)

    expect(layout.visibleCallers).toEqual(['Allan Hurst'])
  })

  it('skips a freeform session with no caller entirely — no column, no placement', () => {
    const lunch = makeFreeform('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z', {
      description: 'Lunch Break',
      location: { kind: 'roomless' },
    })
    const layout = computeDanceScheduleCallerLayout([lunch], [lunch])

    expect(layout).toEqual({
      visibleCallers: [],
      columnWidthsPx: [],
      totalRows: 0,
      timeMarks: [],
      placements: [],
    })
  })

  it('does not let a callerless session contribute a time-axis row alongside real sessions', () => {
    const padding = padDances('Vic Ceder')
    const countryWestern = makeFreeform('2026-07-02T21:00:00.000Z', '2026-07-02T22:00:00.000Z')
    const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const sessions = [...padding, countryWestern, session]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    // The freeform session's 9-10pm range contributes nothing to the axis, and its
    // own placement never exists — only the padding + real session's rows show up.
    expect(layout.timeMarks.some((mark) => mark.label === '9:00 PM')).toBe(false)
    expect(layout.placements.find((p) => p.session === countryWestern)).toBeUndefined()
    expect(layout.placements.find((p) => p.session === session)).toBeDefined()
  })

  it('omits "GCA Caller Showcase Dance" sessions entirely, even for an otherwise-qualifying caller', () => {
    // 4 showcase dances would clear MIN_CALLER_DANCES on a raw count, but none of
    // them should count at all — this caller should get no column.
    const showcase = Array.from({ length: 4 }, (_, i) =>
      makeSession(
        `2026-07-02T0${i}:00:00.000Z`,
        `2026-07-02T0${i}:30:00.000Z`,
        ['Janienne Alexander'],
        { eventType: 'GCA Caller Showcase Dance', location: located('Hemon') },
      ),
    )
    const layout = computeDanceScheduleCallerLayout(showcase, showcase)

    expect(layout.visibleCallers).toEqual([])
    expect(layout.placements).toEqual([])
  })

  it('excludes only the showcase dances, not a caller\'s other real sessions', () => {
    const padding = padDances('Vic Ceder') // 4 ordinary dances
    const showcase = makeSession('2026-07-02T20:00:00.000Z', '2026-07-02T20:30:00.000Z', ['Vic Ceder'], {
      eventType: 'GCA Caller Showcase Dance',
    })
    const sessions = [...padding, showcase]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Vic Ceder'])
    expect(layout.placements.find((p) => p.session === showcase)).toBeUndefined()
    expect(layout.placements).toHaveLength(4)
  })

  it('hides a caller with exactly 3 dances; shows one with 4', () => {
    const three = padDances('Barry Clasper', 3)
    const four = padDances('Justin Russell', 4)
    const sessions = [...three, ...four]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Justin Russell'])
  })

  it('counts a co-taught session once per caller toward each of their own dance counts', () => {
    // Michael Kellogg has 3 solo dances + 1 co-taught with Terri Sherrer = 4 (shown).
    // Terri Sherrer only has that 1 co-taught dance = 1 (hidden).
    const kellogSolo = padDances('Michael Kellogg', 3)
    const coTaught = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', [
      'Michael Kellogg',
      'Terri Sherrer',
    ])
    const sessions = [...kellogSolo, coTaught]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Michael Kellogg'])
    expect(layout.placements.filter((p) => p.session === coTaught)).toHaveLength(1)
  })

  it('sorts placements by rowStart then columnStart', () => {
    const padding = [...padDances('Allan Hurst'), ...padDances('Vic Ceder')]
    const later = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', ['Allan Hurst'])
    const earlier = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const sessions = [...padding, later, earlier]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    const daytime = layout.placements.filter((p) => p.session === later || p.session === earlier)
    expect(daytime.map((p) => p.session)).toEqual([earlier, later])
  })

  describe('overlap lanes (defensive — a real caller can only double-book via a data error)', () => {
    it('lane-splits two sessions that mistakenly list the same caller at overlapping times', () => {
      const padding = padDances('Vic Ceder')
      const a = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', ['Vic Ceder'])
      const b = makeSession('2026-07-02T09:30:00.000Z', '2026-07-02T10:30:00.000Z', ['Vic Ceder'])
      const sessions = [...padding, a, b]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const placementA = layout.placements.find((p) => p.session === a)
      const placementB = layout.placements.find((p) => p.session === b)
      expect(placementA).toMatchObject({ columnStart: 0, lane: 0, laneCount: 2 })
      expect(placementB).toMatchObject({ columnStart: 0, lane: 1, laneCount: 2 })
      expect(layout.columnWidthsPx[0]).toBe(CALLER_COLUMN_WIDTH_PX * 1.5)
    })

    it('does not narrow two sessions by the same caller at non-overlapping times', () => {
      const padding = padDances('Vic Ceder')
      const morning = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', ['Vic Ceder'])
      const afternoon = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
      const sessions = [...padding, morning, afternoon]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      for (const placement of layout.placements.filter(
        (p) => p.session === morning || p.session === afternoon,
      )) {
        expect(placement).toMatchObject({ lane: 0, laneCount: 1 })
      }
    })

    it('deduplicates a session that lists the same caller name twice', () => {
      const padding = padDances('Vic Ceder')
      const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', [
        'Vic Ceder',
        'Vic Ceder',
      ])
      const sessions = [...padding, session]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      expect(layout.visibleCallers).toEqual(['Vic Ceder'])
      expect(layout.placements.filter((p) => p.session === session)).toHaveLength(1)
    })
  })

  describe('column width growth', () => {
    it('grows a column by 50% per additional lane past the first', () => {
      expect(callerColumnWidthPx(1)).toBe(CALLER_COLUMN_WIDTH_PX)
      expect(callerColumnWidthPx(2)).toBe(CALLER_COLUMN_WIDTH_PX * 1.5)
      expect(callerColumnWidthPx(3)).toBe(CALLER_COLUMN_WIDTH_PX * 2)
    })

    it('keeps a column at its ordinary width when nothing in it ever overlaps', () => {
      const padding = padDances('Vic Ceder')
      const layout = computeDanceScheduleCallerLayout(padding, padding)

      expect(layout.columnWidthsPx[0]).toBe(CALLER_COLUMN_WIDTH_PX)
    })
  })
})
