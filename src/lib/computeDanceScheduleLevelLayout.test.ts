import { describe, expect, it } from 'vitest'
import { computeDanceScheduleLevelLayout } from './computeDanceScheduleLevelLayout'
import { getLevelSlots } from './levelOrder'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

const SLOTS = getLevelSlots(false) // SSD, MS, Plus, A1, A2, C1, C2, C3A, C3B, C4
const COMBINED_SLOTS = getLevelSlots(true) // SSD, MS, Plus, A1/A2, C1, C2, C3A, C3B, C4

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

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['Plus', 'A1', 'A2', 'C1'])
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

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['SSD', 'MS', 'Plus', 'A1'])
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

  it('floats a freeform roomless session across every visible slot column', () => {
    const lunch: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T12:00:00.000Z'),
      endTime: new Date('2026-07-02T13:00:00.000Z'),
      location: { kind: 'roomless' },
      description: 'Lunch Break',
    }
    const layout = computeDanceScheduleLevelLayout([lunch], [lunch], SLOTS, 2, 5, false)

    expect(layout.placements[0]).toMatchObject({ columnStart: 0, columnSpan: 4 })
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

  it('floats a structured session tagged only Advanced/Intro/Various across every visible slot column', () => {
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Salon A-C',
      {
        levels: ['Intro'],
      },
    )
    const layout = computeDanceScheduleLevelLayout([session], [session], SLOTS, 0, 2, false)

    expect(layout.placements[0]).toMatchObject({ columnStart: 0, columnSpan: 3 })
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
      // width for both. Same room/caller text that fits comfortably at full width
      // (see the "does not stretch" case above) overflows once lane-split.
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

      const placementA = layout.placements.find((p) => p.session === a)
      expect(placementA).toMatchObject({ laneCount: 2, rowSpan: 4 })
    })
  })
})
