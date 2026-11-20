import { describe, expect, it } from 'vitest'
import {
  computeDanceScheduleLevelLayout,
  levelColumnWidthRem,
  LEVEL_COLUMN_WIDTH_REM,
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
    expect(computeDanceScheduleLevelLayout([], SLOTS, 0, SLOTS.length - 1)).toEqual({
      visibleSlots: [],
      columnWidthsRem: [],
      totalRows: 0,
      timeMarks: [],
      placements: [],
      groupStartColumns: [],
    })
  })

  it('marks where the phase columns and Other start, for the dividers between groups', () => {
    const square = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Hall A', {
      levels: ['MS'],
    })
    const round = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Room 3', {
      levels: [],
      danceForm: 'round',
      phases: [3, 4],
    })
    const clogging = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Suites', {
      levels: [],
      danceForm: 'clogging',
    })
    const sessions = [square, round, clogging]
    const msIndex = SLOTS.findIndex((slot) => slot.label === 'MS')
    const layout = computeDanceScheduleLevelLayout(sessions, SLOTS, msIndex, msIndex + 1, {
      minPhaseIndex: 2,
      maxPhaseIndex: 3,
    })
    // [MS] | [Ph 3, Ph 4] | [Other] — the empty level after MS gets no column.
    expect(layout.visibleSlots.map((slot) => slot.label)).toEqual(['MS', 'Ph 3', 'Ph 4', 'Other'])
    expect(layout.groupStartColumns).toEqual([1, 3])
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
    const ms = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', 'Ballroom East', {
      levels: ['MS'],
    })
    const layout = computeDanceScheduleLevelLayout([session, ms], SLOTS, 0, SLOTS.length - 1)

    expect(layout.placements.filter((p) => p.session === session)).toEqual([
      {
        session,
        rowStart: 1,
        rowSpan: 1,
        columnStart: 1, // after MS
        columnSpan: 1,
        lane: 0,
        laneCount: 1,
        floating: false,
      },
    ])
  })

  it('makes columnStart relative to the visible slot range, not the full slot list', () => {
    // Plus is absolute slot index 2, A2 is 4; as the only shown columns they're
    // relative indices 0 and 1 — the case that would silently break if columnStart
    // were left as an absolute index into the full slots array.
    const plus = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Ballroom Centre', {
      levels: ['Plus'],
    })
    const a2 = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Ballroom East', {
      levels: ['A2'],
    })
    const layout = computeDanceScheduleLevelLayout([plus, a2], SLOTS, 2, 5)

    // No "Other" column — nothing here needs it (see needsOtherColumn).
    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['Plus', 'A2'])
    expect(layout.placements.find((p) => p.session === a2)).toMatchObject({ columnStart: 1, columnSpan: 1 })
  })

  it('omits a level in the filter range with nothing scheduled that day', () => {
    const ssd = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Ballroom Centre', {
      levels: ['SSD'],
    })
    const a1 = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', 'Ballroom Centre', {
      levels: ['A1'],
    })
    const layout = computeDanceScheduleLevelLayout([ssd, a1], SLOTS, 0, 3)

    // MS and Plus are in range but empty.
    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['SSD', 'A1'])
  })

  it('omits the "Other" column entirely on a day with no no-ordered-level, real-room session', () => {
    const session = makeSession(
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      'Ballroom Centre',
      { levels: ['SSD'] },
    )
    const lunch: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T12:00:00.000Z'),
      endTime: new Date('2026-07-02T13:00:00.000Z'),
      location: { kind: 'roomless' }, // roomless floats instead — doesn't need Other
      description: 'Lunch Break',
    }
    const layout = computeDanceScheduleLevelLayout([session, lunch], SLOTS, 0, SLOTS.length - 1)

    expect(layout.visibleSlots.some((slot) => slot.label === 'Other')).toBe(false)
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
    const layout = computeDanceScheduleLevelLayout([session], SLOTS, 0, SLOTS.length - 1)

    expect(layout.placements).toHaveLength(1)
    expect(layout.placements[0]).toMatchObject({ columnStart: 0, columnSpan: 2 })
  })

  it('falls back to one placement per slot for a non-contiguous multi-level session', () => {
    // SSD/C1 with Plus shown between them (a later Plus session) skips a column,
    // mirroring computeDanceScheduleLayout.test.ts's "falls back to one placement
    // per room for a non-contiguous multi-room session" (the room-columns
    // algorithm's own analogous fallback). Without anything shown between them,
    // SSD and C1 would be neighboring columns and merge into one spanning card.
    const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Kafka', {
      levels: ['SSD', 'C1'],
    })
    const plus = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', 'Kafka', { levels: ['Plus'] })
    const layout = computeDanceScheduleLevelLayout([session, plus], SLOTS, 0, SLOTS.length - 1)

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['SSD', 'Plus', 'C1'])
    const placements = layout.placements.filter((p) => p.session === session)
    expect(placements).toHaveLength(2)
    expect(placements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ columnStart: 0, columnSpan: 1 }),
        expect.objectContaining({ columnStart: 2, columnSpan: 1 }),
      ]),
    )
  })

  it('merges a multi-level session into one card when the empty levels between its levels are omitted', () => {
    const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Kafka', {
      levels: ['SSD', 'C1'],
    })
    const layout = computeDanceScheduleLevelLayout([session], SLOTS, 0, SLOTS.length - 1)

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['SSD', 'C1'])
    expect(layout.placements).toEqual([expect.objectContaining({ columnStart: 0, columnSpan: 2 })])
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
      COMBINED_SLOTS,
      0,
      COMBINED_SLOTS.length - 1,
    )

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['A1/A2'])
    expect(layout.placements).toEqual([
      {
        session,
        rowStart: 1,
        rowSpan: 1,
        columnStart: 0,
        columnSpan: 1,
        lane: 0,
        laneCount: 1,
        floating: false,
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
      C3B_PLUS_SLOTS,
      0,
      C3B_PLUS_SLOTS.length - 1,
    )

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['C3B+'])
    expect(layout.placements).toEqual([
      {
        session,
        rowStart: 1,
        rowSpan: 1,
        columnStart: 0,
        columnSpan: 1,
        lane: 0,
        laneCount: 1,
        floating: false,
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
    const plus = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Hall C', { levels: ['Plus'] })
    const c1 = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Hall D', { levels: ['C1'] })
    const layout = computeDanceScheduleLevelLayout([lunch, plus, c1], SLOTS, 2, 5)

    // 2 shown slots (Plus, C1) — no Other, since a roomless session alone doesn't
    // need it (it floats instead — see needsOtherColumn).
    expect(layout.placements.find((p) => p.session === lunch)).toMatchObject({ columnStart: 0, columnSpan: 2 })
  })

  it('floats a roomless session across Other too, when something else that day needs it', () => {
    const lunch: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T12:00:00.000Z'),
      endTime: new Date('2026-07-02T13:00:00.000Z'),
      location: { kind: 'roomless' },
      description: 'Lunch Break',
    }
    const countryWestern: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      // Overlaps A1, so it goes to Other rather than floating itself.
      startTime: new Date('2026-07-02T15:30:00.000Z'),
      endTime: new Date('2026-07-02T16:30:00.000Z'),
      location: { kind: 'located', rooms: ['Drummond Ballroom'] },
      description: 'Country Western Dance',
    }
    const plus = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Hall C', { levels: ['Plus'] })
    const c1 = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Hall D', { levels: ['C1'] })
    const a2 = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', 'Hall D', { levels: ['A2'] })
    const a1 = makeSession('2026-07-02T15:00:00.000Z', '2026-07-02T16:00:00.000Z', 'Hall D', { levels: ['A1'] })
    const layout = computeDanceScheduleLevelLayout([lunch, plus, a1, a2, c1, countryWestern], SLOTS, 2, 5)

    // 4 shown slots (Plus, A1, A2, C1) + Other = 5, now that something else needs it.
    const lunchPlacement = layout.placements.find((p) => p.session === lunch)
    expect(lunchPlacement).toMatchObject({ columnStart: 0, columnSpan: 5 })
  })

  it('collapses a long floating roomless session with nothing else scheduled during it to rowSpan 1', () => {
    // No elision/compression pass needed to achieve this — it falls straight out of
    // the tick-based axis. See computeDanceScheduleTimeAxis.test.ts for the
    // underlying rule's own tests.
    const dinner: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T18:00:00.000Z'),
      endTime: new Date('2026-07-02T20:30:00.000Z'), // 2.5 hours
      location: { kind: 'roomless' },
      description: 'Dinner Break',
    }
    const layout = computeDanceScheduleLevelLayout([dinner], SLOTS, 0, SLOTS.length - 1)

    expect(layout.placements[0]).toMatchObject({ rowSpan: 1 })
  })

  it('gives a structured session tagged only Intro/Various its own Other column, not a float across everything', () => {
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
    // Overlaps it — with nothing beside it, it would float (next test).
    const plus = makeSession('2026-07-02T13:30:00.000Z', '2026-07-02T14:30:00.000Z', 'Hall B', { levels: ['Plus'] })
    const layout = computeDanceScheduleLevelLayout([session, plus], SLOTS, 0, 2)

    // Plus (0) + Other (1) — SSD and MS are empty.
    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['Plus', 'Other'])
    expect(layout.placements.find((p) => p.session === session)).toMatchObject({
      columnStart: 1,
      columnSpan: 1,
      floating: false,
    })
  })

  it('floats a no-level room session across every column when nothing overlaps it, with no Other column', () => {
    // MidWinter2027's "Committee Picture" between the afternoon and evening dances:
    // in Other, off-screen on a phone, its rows looked empty.
    const ms = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Room 1', { levels: ['MS'] })
    const plus = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Hall C', { levels: ['Plus'] })
    const picture = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T14:30:00.000Z', 'Hall A', { levels: [] })
    const layout = computeDanceScheduleLevelLayout([ms, plus, picture], SLOTS, 0, 2)

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['MS', 'Plus'])
    expect(layout.placements.find((p) => p.session === picture)).toMatchObject({
      columnStart: 0,
      columnSpan: 2,
      floating: true,
    })
    expect(layout.placements.find((p) => p.session === ms)).toMatchObject({ floating: false })
  })

  it('keeps Other for the overlapped no-level session while a non-overlapped one floats', () => {
    const plus = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Hall C', { levels: ['Plus'] })
    const clogging = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Suites', { levels: [] })
    const ceremony = makeSession('2026-07-02T15:00:00.000Z', '2026-07-02T15:30:00.000Z', 'Hall A', { levels: [] })
    const layout = computeDanceScheduleLevelLayout([plus, clogging, ceremony], SLOTS, 0, 2)

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['Plus', 'Other'])
    expect(layout.placements.find((p) => p.session === clogging)).toMatchObject({ columnStart: 1, floating: false })
    expect(layout.placements.find((p) => p.session === ceremony)).toMatchObject({ columnSpan: 2, floating: true })
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
    const layout = computeDanceScheduleLevelLayout([session], SLOTS, 0, 2)

    expect(layout.visibleSlots.map((s) => s.label)).toEqual(['Other'])
    expect(layout.placements[0]).toMatchObject({ columnStart: 0, columnSpan: 1 })
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
    const layout = computeDanceScheduleLevelLayout([a, b], SLOTS, 0, 2)

    const placementA = layout.placements.find((p) => p.session === a)
    const placementB = layout.placements.find((p) => p.session === b)
    // Other is the only column — no level in 0..2 has anything.
    expect(placementA).toMatchObject({ columnStart: 0, lane: 0, laneCount: 2 })
    expect(placementB).toMatchObject({ columnStart: 0, lane: 1, laneCount: 2 })
    expect(layout.columnWidthsRem[0]).toBe(LEVEL_COLUMN_WIDTH_REM * 1.5) // Other's own 2-lane peak
  })

  it('gives a long event a taller rowSpan than several shorter concurrent events in another column', () => {
    // The stress case this rework was designed around, at the level-columns layer —
    // see computeDanceScheduleTimeAxis.test.ts and computeDanceScheduleLayout.test.ts
    // for the same case at the axis/room-layout layers.
    const long = makeSession(
      '2026-07-02T09:00:00.000Z',
      '2026-07-02T12:00:00.000Z',
      'Test Room D',
      { levels: ['Plus'], eventType: 'Long Workshop', callers: ['Test Caller Eight'] },
    )
    const first = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', 'Test Room A', {
      levels: ['C1'],
    })
    const second = makeSession('2026-07-02T10:00:00.000Z', '2026-07-02T11:00:00.000Z', 'Test Room A', {
      levels: ['C2'],
    })
    const third = makeSession('2026-07-02T11:00:00.000Z', '2026-07-02T12:00:00.000Z', 'Test Room A', {
      levels: ['C3A'],
    })
    const sessions = [long, first, second, third]

    const layout = computeDanceScheduleLevelLayout(sessions, SLOTS, 0, SLOTS.length - 1)

    const longPlacement = layout.placements.find((p) => p.session === long)
    expect(longPlacement).toMatchObject({ rowStart: 1, rowSpan: 3 })
    for (const shortSession of [first, second, third]) {
      expect(layout.placements.find((p) => p.session === shortSession)).toMatchObject({ rowSpan: 1 })
    }
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
      const layout = computeDanceScheduleLevelLayout([a, b], SLOTS, 0, SLOTS.length - 1)

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
      const layout = computeDanceScheduleLevelLayout([a, b, c], SLOTS, 0, SLOTS.length - 1)

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
        SLOTS,
        0,
        SLOTS.length - 1,
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
      const layout = computeDanceScheduleLevelLayout([first, second], SLOTS, 0, SLOTS.length - 1)

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
        SLOTS,
        0,
        SLOTS.length - 1,
      )

      const combinedPlacements = layout.placements.filter((p) => p.session === combined)
      expect(combinedPlacements).toHaveLength(2)
      expect(combinedPlacements.map((p) => p.columnStart).sort()).toEqual([0, 1]) // C1, C2 (the only shown levels)
      const c1Placement = combinedPlacements.find((p) => p.columnStart === 0)
      expect(c1Placement).toMatchObject({ columnSpan: 1, laneCount: 2 })
      // C2 has no conflict of its own, but still renders as a separate single-column
      // placement (not merged with C1) once the session as a whole has decomposed.
      const c2Placement = combinedPlacements.find((p) => p.columnStart === 1)
      expect(c2Placement).toMatchObject({ columnSpan: 1, laneCount: 1, lane: 0 })
    })
  })

  describe('phase columns', () => {
    const PLUS_INDEX = SLOTS.findIndex((slot) => slot.label === 'Plus')
    const round = (phases: number[], start = '2026-07-02T13:00:00.000Z', end = '2026-07-02T14:00:00.000Z') =>
      makeSession(start, end, 'Room 3/4', { levels: [], danceForm: 'round', phases, callers: [] } as Partial<DanceSession>)

    it('adds one column per occupied phase in range after the level columns, and spans a contiguous phase range', () => {
      const plus = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Hall C', { levels: ['Plus'] })
      const phase3to5 = round([3, 4, 5])
      const layout = computeDanceScheduleLevelLayout([plus, phase3to5], SLOTS, PLUS_INDEX, PLUS_INDEX, {
        minPhaseIndex: 2,
        maxPhaseIndex: 5,
      })

      // Ph 6 is in range but empty, so it gets no column.
      expect(layout.visibleSlots.map((slot) => slot.label)).toEqual(['Plus', 'Ph 3', 'Ph 4', 'Ph 5'])
      expect(layout.placements.find((p) => p.session === phase3to5)).toMatchObject({ columnStart: 1, columnSpan: 3 })
    })

    it('omits an empty phase in the middle of the range, placing the phases either side next to each other', () => {
      // MidWinter2027's Saturday: teaches sit under the phase below, leaving Ph 2 empty.
      const phase1 = round([1])
      const phase3 = round([3], '2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z')
      const layout = computeDanceScheduleLevelLayout([phase1, phase3], SLOTS, PLUS_INDEX, PLUS_INDEX, {
        minPhaseIndex: 0,
        maxPhaseIndex: 2,
      })

      // No Plus column either: nothing is at Plus.
      expect(layout.visibleSlots.map((slot) => slot.label)).toEqual(['Ph 1', 'Ph 3'])
      expect(layout.placements.find((p) => p.session === phase1)).toMatchObject({ columnStart: 0 })
      expect(layout.placements.find((p) => p.session === phase3)).toMatchObject({ columnStart: 1 })
    })

    it('drops phases outside the range and sends a round session with no phase to Other', () => {
      const phase2to3 = round([2, 3])
      // Overlaps phase2to3, so it goes to Other rather than floating.
      const noPhase = round([], '2026-07-02T13:30:00.000Z', '2026-07-02T14:30:00.000Z')
      const layout = computeDanceScheduleLevelLayout([phase2to3, noPhase], SLOTS, PLUS_INDEX, PLUS_INDEX, {
        minPhaseIndex: 2,
        maxPhaseIndex: 3,
      })

      expect(layout.visibleSlots.map((slot) => slot.label)).toEqual(['Ph 3', 'Other'])
      expect(layout.placements.find((p) => p.session === phase2to3)).toMatchObject({ columnStart: 0, columnSpan: 1 })
      expect(layout.placements.find((p) => p.session === noPhase)).toMatchObject({ columnStart: 1 })
    })

    it('shows no phase columns without a phase range, the round session going to Other', () => {
      const layout = computeDanceScheduleLevelLayout([round([3])], SLOTS, PLUS_INDEX, PLUS_INDEX)
      expect(layout.visibleSlots.map((slot) => slot.label)).toEqual(['Other'])
    })
  })

  it('sorts placements by rowStart then columnStart', () => {
    const later = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', 'Room B', {
      levels: ['C2'],
    })
    const earlier = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', 'Room A', {
      levels: ['C1'],
    })
    const layout = computeDanceScheduleLevelLayout([later, earlier], SLOTS, 0, SLOTS.length - 1)

    expect(layout.placements.map((p) => p.session)).toEqual([earlier, later])
  })

  describe('column width growth for concurrent overlap lanes', () => {
    it('grows a column by 50% per additional lane past the first (1x/1.5x/2x/2.5x)', () => {
      expect(levelColumnWidthRem(1)).toBe(LEVEL_COLUMN_WIDTH_REM) // 150 * 1
      expect(levelColumnWidthRem(2)).toBe(LEVEL_COLUMN_WIDTH_REM * 1.5) // 225
      expect(levelColumnWidthRem(3)).toBe(LEVEL_COLUMN_WIDTH_REM * 2) // 300
      expect(levelColumnWidthRem(4)).toBe(LEVEL_COLUMN_WIDTH_REM * 2.5) // 375
    })

    it('keeps a column at its ordinary width when nothing in it ever overlaps', () => {
      const session = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z', 'Room A')
      const layout = computeDanceScheduleLevelLayout([session], SLOTS, 0, SLOTS.length - 1)

      expect(layout.columnWidthsRem[0]).toBe(LEVEL_COLUMN_WIDTH_REM)
    })

    it('sizes a column for its peak concurrency across the whole day, not just one moment', () => {
      // Two SSD sessions overlap at 12:00-12:30 (2 lanes); a third, later SSD
      // session at 1:00-1:30 doesn't overlap anything (back to 1 lane) — the
      // column's width is fixed for its entire height, so it's sized for the
      // 2-lane peak throughout, even during the later, non-overlapping row range.
      const a = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room A')
      const b = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room B')
      const c = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T13:30:00.000Z', 'Room A')
      const layout = computeDanceScheduleLevelLayout([a, b, c], SLOTS, 0, SLOTS.length - 1)

      expect(layout.columnWidthsRem[0]).toBe(LEVEL_COLUMN_WIDTH_REM * 1.5)
      const placementC = layout.placements.find((p) => p.session === c)
      expect(placementC).toMatchObject({ laneCount: 1 })
    })

    it('grows a 3-way overlap column by a full 2x, not just 1.5x', () => {
      const a = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room A')
      const b = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room B')
      const c = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T12:30:00.000Z', 'Room C')
      const layout = computeDanceScheduleLevelLayout([a, b, c], SLOTS, 0, SLOTS.length - 1)

      expect(layout.columnWidthsRem[0]).toBe(LEVEL_COLUMN_WIDTH_REM * 2)
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
        SLOTS,
        0,
        SLOTS.length - 1,
      )

      expect(layout.columnWidthsRem[0]).toBe(LEVEL_COLUMN_WIDTH_REM * 1.5) // SSD
      expect(layout.columnWidthsRem[1]).toBe(LEVEL_COLUMN_WIDTH_REM) // MS, unaffected
    })
  })
})
