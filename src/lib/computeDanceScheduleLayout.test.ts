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
    expect(computeDanceScheduleLayout([], [], false)).toEqual({
      visibleRooms: [],
      totalRowUnits: 0,
      hourMarks: [],
      halfHourMarks: [],
      elisionMarkers: [],
      expansionMarkers: [],
      placements: [],
    })
  })

  it('floors dayStart and ceils dayEnd to the nearest hour', () => {
    const session = makeSession(
      '2026-07-02T12:15:00.000Z',
      '2026-07-02T12:45:00.000Z',
      located('Ballroom Centre'),
    )
    const layout = computeDanceScheduleLayout([session], [session], false)

    // dayStart floors to 12:00, dayEnd ceils to 13:00 -> 4 units of 15 minutes.
    expect(layout.totalRowUnits).toBe(4)
    expect(layout.hourMarks).toEqual([
      { rowStart: 1, label: '12:00 PM' },
      { rowStart: 5, label: '1:00 PM' },
    ])
  })

  it('shows a half-hour label only where a session boundary needs one', () => {
    // dayStart 12:00, dayEnd 15:00 -> hour marks at rows 1/5/9/13. The session's
    // off-grid start (12:15) forces its ceil neighbor (12:30, row 3); its off-grid
    // end (2:45) forces its floor neighbor (2:30, row 11). The middle half hour
    // (1:30) gets nothing — no boundary is anywhere near it. See
    // computeDanceScheduleTimeAxis.test.ts for the underlying rule's own tests.
    const session = makeSession(
      '2026-07-02T12:15:00.000Z',
      '2026-07-02T14:45:00.000Z',
      located('Ballroom Centre'),
    )
    const layout = computeDanceScheduleLayout([session], [session], false)

    expect(layout.hourMarks.map((mark) => mark.rowStart)).toEqual([1, 5, 9, 13])
    expect(layout.halfHourMarks).toEqual([
      { rowStart: 3, label: '12:30 PM' },
      { rowStart: 11, label: '2:30 PM' },
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
      false,
    )

    const first = layout.placements.find((p) => p.session === thirtyMin)
    const second = layout.placements.find((p) => p.session === fortyFiveMin)
    expect(first).toMatchObject({ rowStart: 1, rowSpan: 2 })
    expect(second).toMatchObject({ rowStart: 3, rowSpan: 3 })
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
    const layout = computeDanceScheduleLayout([first, second], [first, second], false)

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

    const layout = computeDanceScheduleLayout(dateSessions, visibleSessions, false)

    expect(layout.visibleRooms).toEqual(['Ballroom Centre', 'Ballroom West'])
  })

  it('keeps room order fixed to the unfiltered session list even as time bounds trim', () => {
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

    const layout = computeDanceScheduleLayout(dateSessions, visibleSessions, false)

    // Ballroom Centre still reserves its column-order position even with nothing
    // visible in it — only Ballroom East (the one with a visible session) actually
    // renders as a column, per the existing "hides a room column" test above, but
    // the *order* a room would take if it did become visible again stays anchored
    // to the unfiltered list, not recomputed from just what's currently visible.
    expect(layout.visibleRooms).toEqual(['Ballroom East'])
  })

  describe('trimming leading/trailing empty time after filtering', () => {
    it('trims leading hours entirely empty after the level filter narrows the visible set', () => {
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
      const visibleSessions = [late] // early (9am) filtered out by level

      const layout = computeDanceScheduleLayout(dateSessions, visibleSessions, false)

      // Full day would span 9:00 AM-2:00 PM; trimmed to just 1:00-2:00 PM, the
      // visible session's own (hour-aligned) range.
      expect(layout.hourMarks).toEqual([
        { rowStart: 1, label: '1:00 PM' },
        { rowStart: 5, label: '2:00 PM' },
      ])
      expect(layout.totalRowUnits).toBe(4)
    })

    it('trims trailing hours entirely empty after the level filter narrows the visible set', () => {
      const early = makeSession(
        '2026-07-02T09:00:00.000Z',
        '2026-07-02T10:00:00.000Z',
        located('Ballroom Centre'),
        {
          levels: ['SSD'],
        },
      )
      const late = makeSession(
        '2026-07-02T13:00:00.000Z',
        '2026-07-02T13:30:00.000Z',
        located('Ballroom East'),
        {
          levels: ['C4'],
        },
      )
      const dateSessions = [early, late]
      const visibleSessions = [early] // late (1pm) filtered out by level

      const layout = computeDanceScheduleLayout(dateSessions, visibleSessions, false)

      // Full day would span 9:00 AM-2:00 PM; trimmed to just 9:00-10:00 AM.
      expect(layout.hourMarks).toEqual([
        { rowStart: 1, label: '9:00 AM' },
        { rowStart: 5, label: '10:00 AM' },
      ])
      expect(layout.totalRowUnits).toBe(4)
    })

    it('trims both ends when only a middle slice of the day is visible', () => {
      const early = makeSession(
        '2026-07-02T09:00:00.000Z',
        '2026-07-02T09:30:00.000Z',
        located('Ballroom Centre'),
        {
          levels: ['C4'],
        },
      )
      const middle = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T13:00:00.000Z',
        located('Ballroom East'),
        {
          levels: ['SSD'],
        },
      )
      const late = makeSession(
        '2026-07-02T16:00:00.000Z',
        '2026-07-02T16:30:00.000Z',
        located('Ballroom West'),
        {
          levels: ['C4'],
        },
      )
      const dateSessions = [early, middle, late]
      const visibleSessions = [middle]

      const layout = computeDanceScheduleLayout(dateSessions, visibleSessions, false)

      expect(layout.hourMarks).toEqual([
        { rowStart: 1, label: '12:00 PM' },
        { rowStart: 5, label: '1:00 PM' },
      ])
    })

    it('does not trim a gap between two visible sessions, only genuine leading/trailing dead time', () => {
      const morning = makeSession(
        '2026-07-02T09:00:00.000Z',
        '2026-07-02T09:30:00.000Z',
        located('Ballroom Centre'),
      )
      const afternoon = makeSession(
        '2026-07-02T13:00:00.000Z',
        '2026-07-02T13:30:00.000Z',
        located('Ballroom East'),
      )
      const dateSessions = [morning, afternoon]
      // Both visible — the empty 9:30-1:00 stretch between them is a mid-day gap,
      // not leading/trailing time, so it must NOT be trimmed away.
      const visibleSessions = [morning, afternoon]

      const layout = computeDanceScheduleLayout(dateSessions, visibleSessions, false)

      expect(layout.hourMarks[0]).toEqual({ rowStart: 1, label: '9:00 AM' })
      expect(layout.hourMarks.at(-1)).toEqual({ rowStart: 21, label: '2:00 PM' })
    })

    it('does not trim when the visible sessions already span the full unfiltered range', () => {
      const session = makeSession(
        '2026-07-02T09:00:00.000Z',
        '2026-07-02T10:00:00.000Z',
        located('Ballroom Centre'),
      )
      const layout = computeDanceScheduleLayout([session], [session], false)

      expect(layout.hourMarks).toEqual([
        { rowStart: 1, label: '9:00 AM' },
        { rowStart: 5, label: '10:00 AM' },
      ])
    })

    it('never trims past the full unfiltered day bounds', () => {
      // A degenerate/defensive case — visibleSessions is a subset of dateSessions in
      // real usage, so this can't happen via the real filtering path, but the
      // Math.max/min clamp in trimEmptyDayEdges should hold regardless.
      const dateSessions = [
        makeSession(
          '2026-07-02T12:00:00.000Z',
          '2026-07-02T13:00:00.000Z',
          located('Ballroom Centre'),
        ),
      ]
      const visibleSessions = [
        makeSession(
          '2026-07-02T08:00:00.000Z',
          '2026-07-02T16:00:00.000Z',
          located('Ballroom Centre'),
        ),
      ]

      const layout = computeDanceScheduleLayout(dateSessions, visibleSessions, false)

      expect(layout.hourMarks[0]).toEqual({ rowStart: 1, label: '12:00 PM' })
      expect(layout.hourMarks.at(-1)).toEqual({ rowStart: 5, label: '1:00 PM' })
    })

    it("includes a roomless session's time range when computing the trimmed bounds", () => {
      const early = makeSession(
        '2026-07-02T09:00:00.000Z',
        '2026-07-02T09:30:00.000Z',
        located('Ballroom Centre'),
        {
          levels: ['C4'],
        },
      )
      const lunch = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T13:00:00.000Z',
        { kind: 'roomless' },
        { kind: 'freeform', description: 'Lunch Break' },
      )
      const dateSessions = [early, lunch]
      const visibleSessions = [lunch] // early filtered out by level; lunch is freeform (always visible)

      const layout = computeDanceScheduleLayout(dateSessions, visibleSessions, false)

      expect(layout.hourMarks).toEqual([
        { rowStart: 1, label: '12:00 PM' },
        { rowStart: 5, label: '1:00 PM' },
      ])
    })
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
    const layout = computeDanceScheduleLayout([combined, centre], [combined, centre], false)

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

    const layout = computeDanceScheduleLayout(dateSessions, dateSessions, false)

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

    const layout = computeDanceScheduleLayout(dateSessions, dateSessions, false)

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
    const layout = computeDanceScheduleLayout([lunch], [lunch], false)

    expect(layout.visibleRooms).toEqual([])
    expect(layout.placements[0]).toMatchObject({ columnStart: 0, columnSpan: 1 })
  })

  it("elides a roomless session's excess duration beyond 1 hour, and surfaces the elision marker", () => {
    // See computeDanceScheduleTimeAxis.test.ts for the underlying axis-compression
    // math this relies on — this just confirms the layout actually propagates it.
    const dinner = makeSession(
      '2026-07-02T18:00:00.000Z',
      '2026-07-02T20:30:00.000Z', // 2.5 hours
      { kind: 'roomless' },
      { kind: 'freeform', description: 'Dinner Break' },
    )
    const layout = computeDanceScheduleLayout([dinner], [dinner], false)

    expect(layout.placements[0]).toMatchObject({ rowSpan: 4 })
    expect(layout.elisionMarkers).toEqual([3])
  })

  it('does not elide a roomless session of 1 hour or less', () => {
    const lunch = makeSession(
      '2026-07-02T12:00:00.000Z',
      '2026-07-02T13:00:00.000Z',
      { kind: 'roomless' },
      { kind: 'freeform', description: 'Lunch Break' },
    )
    const layout = computeDanceScheduleLayout([lunch], [lunch], false)

    expect(layout.placements[0]).toMatchObject({ rowSpan: 4 })
    expect(layout.elisionMarkers).toEqual([])
  })

  describe('stretching the axis to fit overflowing card content', () => {
    it("stretches a short session's row span when its text is estimated to overflow, and surfaces the expansion marker", () => {
      const session = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        located('Ballroom Centre'),
        { eventType: 'Skirt Work Hour', callers: ['Wendy VanderMeulen'] },
      )
      const layout = computeDanceScheduleLayout([session], [session], false)

      expect(layout.placements[0]).toMatchObject({ rowStart: 1, rowSpan: 4 })
      expect(layout.expansionMarkers).toEqual([3])
      expect(layout.totalRowUnits).toBe(6) // 4 (a 30-min session's own trimmed day) + 2
    })

    it('does not stretch the axis for a session whose text is estimated to fit comfortably', () => {
      const session = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        located('Ballroom Centre'),
      )
      const layout = computeDanceScheduleLayout([session], [session], false)

      expect(layout.placements[0]).toMatchObject({ rowStart: 1, rowSpan: 2 })
      expect(layout.expansionMarkers).toEqual([])
    })

    it('inflates a concurrent, non-overflowing placement in a different room by the same shared expansion', () => {
      const overflowing = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        located('Ballroom Centre'),
        { eventType: 'Skirt Work Hour', callers: ['Wendy VanderMeulen'] },
      )
      const comfortable = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        located('Ballroom East'),
      )
      const layout = computeDanceScheduleLayout(
        [overflowing, comfortable],
        [overflowing, comfortable],
        false,
      )

      // comfortable's own text fits fine in its natural 2-row span, but it shares the
      // grid's row heights with overflowing's column, so it absorbs the same stretch
      // as harmless visual slack, not a defect — see the design doc's accepted
      // shared-slack tradeoff.
      const comfortablePlacement = layout.placements.find((p) => p.session === comfortable)
      expect(comfortablePlacement).toMatchObject({ rowStart: 1, rowSpan: 4 })
    })

    it('changes the expansion outcome when toggling showGca, since the GCA line and unitHeightPx both feed the deficit', () => {
      const session = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        located('Ballroom Centre'),
        { gca: 'Tim Stephens' },
      )
      const withoutGca = computeDanceScheduleLayout([session], [session], false)
      const withGca = computeDanceScheduleLayout([session], [session], true)

      expect(withoutGca.placements[0]).toMatchObject({ rowSpan: 2 })
      expect(withGca.placements[0]?.rowSpan).toBeGreaterThan(2)
    })
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
    const layout = computeDanceScheduleLayout([later, earlier], [later, earlier], false)

    expect(layout.placements.map((p) => p.session)).toEqual([earlier, later])
  })
})
