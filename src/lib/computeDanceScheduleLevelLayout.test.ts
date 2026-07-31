import { describe, expect, it } from 'vitest'
import {
  computeDanceScheduleLevelLayout,
  levelColumnWidthPx,
  LEVEL_COLUMN_WIDTH_PX,
} from './computeDanceScheduleLevelLayout'
import { getLevelSlots } from './levelOrder'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

const SLOTS = getLevelSlots(false, false) // SSD, MS, Plus, A1, A2, C1, C2, C3A, C3B, C4
const COMBINED_SLOTS = getLevelSlots(true, false) // SSD, MS, Plus, A1/A2, C1, C2, C3A, C3B, C4
const C3B_PLUS_SLOTS = getLevelSlots(false, true) // SSD, MS, Plus, A1, A2, C1, C2, C3A, C3B+

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

function makeSession(
  startTime: string,
  endTime: string,
  room: string,
  overrides: Partial<DanceSession> = {},
): DanceSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    location: located(room),
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  } as DanceSession
}

describe('computeDanceScheduleLevelLayout', () => {
  it('returns an empty layout for no sessions', () => {
    expect(computeDanceScheduleLevelLayout([], [], SLOTS, 0, SLOTS.length - 1, false)).toEqual({
      visibleSlots: [],
      columnWidthsPx: [],
      totalRowUnits: 0,
      hourMarks: [],
      halfHourMarks: [],
      elisionMarkers: [],
      expansionMarkers: [],
      placements: [],
    })
  })

  it('places a single-level session in its slot column', () => {
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Ballroom Centre',
      {
        levels: ['Plus'],
      },
    )
    const layout = computeDanceScheduleLevelLayout(
      [session],
      [session],
      SLOTS,
      0,
      SLOTS.length - 1,
      false,
    )

    expect(layout.placements).toEqual([
      {
        session,
        rowStart: 1,
        rowSpan: 4,
        columnStart: 2,
        columnSpan: 1,
        lane: 0,
        laneCount: 1,
      },
    ])
  })

  it('makes columnStart relative to the visible slot range, not the full slot list', () => {
    // Plus is absolute slot index 2; with minLevelIndex 2 selected, it's the FIRST
    // visible column (relative index 0) — this is the case that would silently
    // break if columnStart were left as an absolute index into the full slots array.
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Ballroom Centre',
      {
        levels: ['Plus'],
      },
    )
    const layout = computeDanceScheduleLevelLayout([session], [session], SLOTS, 2, 5, false)

    // "Other" (for no-ordered-level, real-room sessions) is always appended after
    // the ordered-level slice — see OTHER_LEVEL_SLOT.
    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['Plus', 'A1', 'A2', 'C1', 'Other'])
    expect(layout.placements[0]).toMatchObject({ columnStart: 0, columnSpan: 1 })
  })

  it('shows the full filter-range column set even for a slot with nothing scheduled that day', () => {
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Ballroom Centre',
      {
        levels: ['SSD'],
      },
    )
    const layout = computeDanceScheduleLevelLayout([session], [session], SLOTS, 0, 3, false)

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['SSD', 'MS', 'Plus', 'A1', 'Other'])
  })

  it('gives a contiguous multi-level session a single spanning placement', () => {
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Kafka/Lamartine',
      {
        levels: ['C1', 'C2'],
      },
    )
    const layout = computeDanceScheduleLevelLayout(
      [session],
      [session],
      SLOTS,
      0,
      SLOTS.length - 1,
      false,
    )

    expect(layout.placements).toHaveLength(1)
    expect(layout.placements[0]).toMatchObject({ columnStart: 5, columnSpan: 2 })
  })

  it('collapses an A1/A2 session onto the merged slot when combineA1A2 is on', () => {
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Salon A-C',
      {
        levels: ['A1', 'A2'],
      },
    )
    const layout = computeDanceScheduleLevelLayout(
      [session],
      [session],
      COMBINED_SLOTS,
      0,
      COMBINED_SLOTS.length - 1,
      false,
    )

    expect(layout.visibleSlots[3]!.label).toBe('A1/A2')
    expect(layout.placements).toEqual([
      {
        session,
        rowStart: 1,
        rowSpan: 4,
        columnStart: 3,
        columnSpan: 1,
        lane: 0,
        laneCount: 1,
      },
    ])
  })

  it('collapses a C3B/C4 session onto the merged "C3B+" slot when combineC3BC4 is on', () => {
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Salon A-C',
      {
        levels: ['C3B', 'C4'],
      },
    )
    const layout = computeDanceScheduleLevelLayout(
      [session],
      [session],
      C3B_PLUS_SLOTS,
      0,
      C3B_PLUS_SLOTS.length - 1,
      false,
    )

    expect(layout.visibleSlots[8]!.label).toBe('C3B+')
    expect(layout.placements).toEqual([
      {
        session,
        rowStart: 1,
        rowSpan: 4,
        columnStart: 8,
        columnSpan: 1,
        lane: 0,
        laneCount: 1,
      },
    ])
  })

  it('floats a freeform roomless session across every visible slot column, including Other', () => {
    const lunch: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T12:00:00.000Z'),
      endTime: new Date('2026-07-02T13:00:00.000Z'),
      location: { kind: 'roomless' },
      description: 'Lunch Break',
    }
    const layout = computeDanceScheduleLevelLayout([lunch], [lunch], SLOTS, 2, 5, false)

    // 4 ordered slots (Plus, A1, A2, C1) + Other = 5.
    expect(layout.placements[0]).toMatchObject({ columnStart: 0, columnSpan: 5 })
  })

  it("elides a floating roomless session's excess duration beyond 1 hour, and surfaces the elision marker", () => {
    // See computeDanceScheduleTimeAxis.test.ts for the underlying axis-compression
    // math this relies on — this just confirms the level layout propagates it too.
    const dinner: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T18:00:00.000Z'),
      endTime: new Date('2026-07-02T20:30:00.000Z'), // 2.5 hours
      location: { kind: 'roomless' },
      description: 'Dinner Break',
    }
    const layout = computeDanceScheduleLevelLayout(
      [dinner],
      [dinner],
      SLOTS,
      0,
      SLOTS.length - 1,
      false,
    )

    expect(layout.placements[0]).toMatchObject({ rowSpan: 4 })
    expect(layout.elisionMarkers).toEqual([3])
  })

  it('gives a structured session tagged only Advanced/Intro/Various its own Other column, not a float across everything', () => {
    // Has a real room (Salon A-C), just no ordered level — this used to float across
    // every column like a roomless session, which silently rendered underneath
    // whichever single column's cards happened to occupy the same row range (CSS
    // Grid allows overlapping items with no collision detection). Now it gets the
    // same dedicated-column treatment as any other level.
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Salon A-C',
      {
        levels: ['Intro'],
      },
    )
    const layout = computeDanceScheduleLevelLayout([session], [session], SLOTS, 0, 2, false)

    // SSD, MS, Plus (0,1,2) + Other (3).
    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['SSD', 'MS', 'Plus', 'Other'])
    expect(layout.placements[0]).toMatchObject({ columnStart: 3, columnSpan: 1 })
  })

  it('gives a freeform session with a real room its own Other column too (not roomless, no ordered level)', () => {
    // The motivating real-world case: a freeform entry like "Country Western Dance"
    // scheduled in a real venue but with no square-dance skill level at all.
    const session: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T21:00:00.000Z'),
      endTime: new Date('2026-07-02T22:00:00.000Z'),
      location: { kind: 'located', rooms: ['Drummond Ballroom'] },
      description: 'Country Western Dance - until 1am',
    }
    const layout = computeDanceScheduleLevelLayout([session], [session], SLOTS, 0, 2, false)

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['SSD', 'MS', 'Plus', 'Other'])
    expect(layout.placements[0]).toMatchObject({ columnStart: 3, columnSpan: 1 })
  })

  it('lane-splits two overlapping Other-column sessions just like any real level column', () => {
    const a: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T21:00:00.000Z'),
      endTime: new Date('2026-07-02T22:00:00.000Z'),
      location: { kind: 'located', rooms: ['Drummond Ballroom'] },
      description: 'Country Western Dance',
    }
    const b = makeSession('2026-07-02T21:00:00.000Z', '2026-07-02T22:00:00.000Z', 'Salon A-C', {
      levels: ['Intro'],
    })
    const layout = computeDanceScheduleLevelLayout([a, b], [a, b], SLOTS, 0, 2, false)

    const placementA = layout.placements.find((p) => p.session === a)
    const placementB = layout.placements.find((p) => p.session === b)
    expect(placementA).toMatchObject({ columnStart: 3, lane: 0, laneCount: 2 })
    expect(placementB).toMatchObject({ columnStart: 3, lane: 1, laneCount: 2 })
    expect(layout.columnWidthsPx[3]).toBe(LEVEL_COLUMN_WIDTH_PX * 1.5) // Other's own 2-lane peak
  })

  describe('overlap lanes', () => {
    it('assigns two sessions sharing a level at overlapping times to separate lanes', () => {
      const a = makeSession(
        '2026-07-02T09:00:00.000Z',
        '2026-07-02T10:00:00.000Z',
        'Ballroom Centre',
        {
          levels: ['C1'],
        },
      )
      const b = makeSession(
        '2026-07-02T09:30:00.000Z',
        '2026-07-02T10:30:00.000Z',
        'Ballroom East',
        {
          levels: ['C1'],
        },
      )
      const layout = computeDanceScheduleLevelLayout(
        [a, b],
        [a, b],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      const placementA = layout.placements.find((p) => p.session === a)
      const placementB = layout.placements.find((p) => p.session === b)
      expect(placementA).toMatchObject({ lane: 0, laneCount: 2 })
      expect(placementB).toMatchObject({ lane: 1, laneCount: 2 })
    })

    it('assigns three mutually overlapping sessions three lanes', () => {
      const a = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', 'Room A', {
        levels: ['C1'],
      })
      const b = makeSession('2026-07-02T09:15:00.000Z', '2026-07-02T10:15:00.000Z', 'Room B', {
        levels: ['C1'],
      })
      const c = makeSession('2026-07-02T09:30:00.000Z', '2026-07-02T10:30:00.000Z', 'Room C', {
        levels: ['C1'],
      })
      const layout = computeDanceScheduleLevelLayout(
        [a, b, c],
        [a, b, c],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      const lanes = [a, b, c].map((s) => layout.placements.find((p) => p.session === s)?.lane)
      expect(new Set(lanes).size).toBe(3)
      for (const placement of layout.placements) {
        expect(placement.laneCount).toBe(3)
      }
    })

    it('does not narrow two sessions in the same column at non-overlapping times', () => {
      const morning = makeSession(
        '2026-07-02T09:00:00.000Z',
        '2026-07-02T10:00:00.000Z',
        'Room A',
        {
          levels: ['C1'],
        },
      )
      const afternoon = makeSession(
        '2026-07-02T13:00:00.000Z',
        '2026-07-02T14:00:00.000Z',
        'Room B',
        {
          levels: ['C1'],
        },
      )
      const layout = computeDanceScheduleLevelLayout(
        [morning, afternoon],
        [morning, afternoon],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      for (const placement of layout.placements) {
        expect(placement).toMatchObject({ lane: 0, laneCount: 1 })
      }
    })

    it('a session ending exactly when another starts does not count as overlapping', () => {
      const first = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', 'Room A', {
        levels: ['C1'],
      })
      const second = makeSession('2026-07-02T10:00:00.000Z', '2026-07-02T11:00:00.000Z', 'Room B', {
        levels: ['C1'],
      })
      const layout = computeDanceScheduleLevelLayout(
        [first, second],
        [first, second],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      for (const placement of layout.placements) {
        expect(placement).toMatchObject({ lane: 0, laneCount: 1 })
      }
    })

    it('decomposes a contiguous multi-level session into separate per-column placements when it also conflicts', () => {
      // The rare compound case: `combined` claims C1+C2 (contiguous), but `conflict`
      // also claims C1 at an overlapping time — combined can't keep its wide span
      // AND show the conflict in C1, so it falls back to one placement per column.
      const combined = makeSession(
        '2026-07-02T09:00:00.000Z',
        '2026-07-02T10:00:00.000Z',
        'Kafka/Lamartine',
        {
          levels: ['C1', 'C2'],
        },
      )
      const conflict = makeSession(
        '2026-07-02T09:15:00.000Z',
        '2026-07-02T09:45:00.000Z',
        'Salon 6/7',
        {
          levels: ['C1'],
        },
      )
      const layout = computeDanceScheduleLevelLayout(
        [combined, conflict],
        [combined, conflict],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      const combinedPlacements = layout.placements.filter((p) => p.session === combined)
      expect(combinedPlacements).toHaveLength(2)
      expect(combinedPlacements.map((p) => p.columnStart).sort()).toEqual([5, 6]) // C1, C2
      const c1Placement = combinedPlacements.find((p) => p.columnStart === 5)
      expect(c1Placement).toMatchObject({ columnSpan: 1, laneCount: 2 })
      // C2 has no conflict of its own, but still renders as a separate single-column
      // placement (not merged with C1) once the session as a whole has decomposed.
      const c2Placement = combinedPlacements.find((p) => p.columnStart === 6)
      expect(c2Placement).toMatchObject({ columnSpan: 1, laneCount: 1, lane: 0 })
    })
  })

  it('sorts placements by rowStart then columnStart', () => {
    const later = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', 'Room B', {
      levels: ['C2'],
    })
    const earlier = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Room A', {
      levels: ['C1'],
    })
    const layout = computeDanceScheduleLevelLayout(
      [later, earlier],
      [later, earlier],
      SLOTS,
      0,
      SLOTS.length - 1,
      false,
    )

    expect(layout.placements.map((p) => p.session)).toEqual([earlier, later])
  })

  describe('stretching the axis to fit overflowing card content', () => {
    it("stretches a short session's row span when its room + details text is estimated to overflow", () => {
      const session = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        'Ballroom West',
        { eventType: 'Skirt Work Hour', callers: ['Wendy VanderMeulen'] },
      )
      const layout = computeDanceScheduleLevelLayout(
        [session],
        [session],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      expect(layout.placements[0]).toMatchObject({ rowStart: 1, rowSpan: 4 })
      expect(layout.expansionMarkers).toEqual([3])
    })

    it('does not stretch the axis for a session whose text is estimated to fit comfortably', () => {
      const session = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room A')
      const layout = computeDanceScheduleLevelLayout(
        [session],
        [session],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      expect(layout.placements[0]).toMatchObject({ rowStart: 1, rowSpan: 2 })
      expect(layout.expansionMarkers).toEqual([])
    })

    it('inflates a concurrent, non-overflowing placement in a different slot by the same shared expansion', () => {
      const overflowing = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        'Ballroom West',
        { eventType: 'Skirt Work Hour', callers: ['Wendy VanderMeulen'] },
      )
      const comfortable = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        'Room A',
        {
          levels: ['C1'],
        },
      )
      const layout = computeDanceScheduleLevelLayout(
        [overflowing, comfortable],
        [overflowing, comfortable],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      const comfortablePlacement = layout.placements.find((p) => p.session === comfortable)
      expect(comfortablePlacement).toMatchObject({ rowStart: 1, rowSpan: 4 })
    })

    it('changes the expansion outcome when toggling showGca', () => {
      const session = makeSession(
        '2026-07-02T12:00:00.000Z',
        '2026-07-02T12:30:00.000Z',
        'Room A',
        {
          gca: 'Tim Stephens',
        },
      )
      const withoutGca = computeDanceScheduleLevelLayout(
        [session],
        [session],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )
      const withGca = computeDanceScheduleLevelLayout(
        [session],
        [session],
        SLOTS,
        0,
        SLOTS.length - 1,
        true,
      )

      expect(withoutGca.placements[0]).toMatchObject({ rowSpan: 2 })
      expect(withGca.placements[0]?.rowSpan).toBeGreaterThan(2)
    })

    it('triggers expansion at a lane-split (narrower) width where a full-width lane would not overflow', () => {
      // Two SSD sessions in different rooms, overlapping in time -> assigned
      // side-by-side overlap lanes (laneCount 2), roughly halving the usable text
      // width for both (partially clawed back by the SSD column itself growing 1.5x
      // for its 2-lane peak concurrency — see columnWidthsPx below — but not all the
      // way back to the full 150px a single, non-overlapping lane would get). Same
      // room/caller text that fits comfortably at full width (see the "does not
      // stretch" case above) still overflows once lane-split, just by less than it
      // would have at a fixed, non-growing column width.
      const a = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room A')
      const b = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room B')
      const layout = computeDanceScheduleLevelLayout(
        [a, b],
        [a, b],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      expect(layout.columnWidthsPx[0]).toBe(225) // SSD column: 150 * 1.5 for its 2-lane peak
      const placementA = layout.placements.find((p) => p.session === a)
      expect(placementA).toMatchObject({ laneCount: 2, rowSpan: 3 })
    })
  })

  describe('column width growth for concurrent overlap lanes', () => {
    it('grows a column by 50% per additional lane past the first (1x/1.5x/2x/2.5x)', () => {
      expect(levelColumnWidthPx(1)).toBe(LEVEL_COLUMN_WIDTH_PX) // 150 * 1
      expect(levelColumnWidthPx(2)).toBe(LEVEL_COLUMN_WIDTH_PX * 1.5) // 225
      expect(levelColumnWidthPx(3)).toBe(LEVEL_COLUMN_WIDTH_PX * 2) // 300
      expect(levelColumnWidthPx(4)).toBe(LEVEL_COLUMN_WIDTH_PX * 2.5) // 375
    })

    it('keeps a column at its ordinary width when nothing in it ever overlaps', () => {
      const session = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z', 'Room A')
      const layout = computeDanceScheduleLevelLayout(
        [session],
        [session],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      expect(layout.columnWidthsPx[0]).toBe(LEVEL_COLUMN_WIDTH_PX)
    })

    it('sizes a column for its peak concurrency across the whole day, not just one moment', () => {
      // Two SSD sessions overlap at 12:00-12:30 (2 lanes); a third, later SSD
      // session at 1:00-1:30 doesn't overlap anything (back to 1 lane) — the
      // column's width is fixed for its entire height, so it's sized for the
      // 2-lane peak throughout, even during the later, non-overlapping row range.
      const a = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room A')
      const b = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room B')
      const c = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T13:30:00.000Z', 'Room A')
      const layout = computeDanceScheduleLevelLayout(
        [a, b, c],
        [a, b, c],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      expect(layout.columnWidthsPx[0]).toBe(LEVEL_COLUMN_WIDTH_PX * 1.5)
      const placementC = layout.placements.find((p) => p.session === c)
      expect(placementC).toMatchObject({ laneCount: 1 })
    })

    it('grows a 3-way overlap column by a full 2x, not just 1.5x', () => {
      const a = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room A')
      const b = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room B')
      const c = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room C')
      const layout = computeDanceScheduleLevelLayout(
        [a, b, c],
        [a, b, c],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      expect(layout.columnWidthsPx[0]).toBe(LEVEL_COLUMN_WIDTH_PX * 2)
    })

    it('does not grow a different column that has no overlap of its own', () => {
      // SSD (index 0) has a 2-lane overlap; MS (index 1) has one ordinary session —
      // each column's width reflects only its own peak concurrency.
      const overlapA = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room A')
      const overlapB = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room B')
      const other = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room C', {
        levels: ['MS'],
      })
      const layout = computeDanceScheduleLevelLayout(
        [overlapA, overlapB, other],
        [overlapA, overlapB, other],
        SLOTS,
        0,
        SLOTS.length - 1,
        false,
      )

      expect(layout.columnWidthsPx[0]).toBe(LEVEL_COLUMN_WIDTH_PX * 1.5) // SSD
      expect(layout.columnWidthsPx[1]).toBe(LEVEL_COLUMN_WIDTH_PX) // MS, unaffected
    })
  })
})
