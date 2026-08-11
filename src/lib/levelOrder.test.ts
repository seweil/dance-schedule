import { describe, expect, it } from 'vitest'
import {
  LEVEL_ORDER,
  getLevelSlots,
  getPresentLevelIndexRange,
  isSessionInLevelRange,
  labelSlotsByPresence,
} from './levelOrder'
import type { DanceSession, LevelCode, StructuredSession } from '../types/danceSchedule'

function makeStructured(levels: LevelCode[], overrides: Partial<StructuredSession> = {}): StructuredSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date('2026-07-02T12:30:00.000Z'),
    endTime: new Date('2026-07-02T13:30:00.000Z'),
    location: { kind: 'located', rooms: ['Ballroom Centre'] },
    levels,
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  }
}

const BASE_SLOTS = getLevelSlots(false, false)
const COMBINED_SLOTS = getLevelSlots(true, false)
const C3B_PLUS_SLOTS = getLevelSlots(false, true)
const FULL_RANGE: [number, number] = [0, BASE_SLOTS.length - 1]

describe('LEVEL_ORDER', () => {
  it('reflects the real skill progression, not LEVEL_CODES\'s declared order', () => {
    expect(LEVEL_ORDER).toEqual(['SSD', 'MS', 'Plus', 'A1', 'A2', 'C1', 'C2', 'C3A', 'C3B', 'C4'])
  })
})

describe('getLevelSlots', () => {
  it('returns one slot per level, unchanged, when combining nothing', () => {
    expect(BASE_SLOTS).toEqual(LEVEL_ORDER.map((level) => ({ label: level, levels: [level] })))
  })

  it('merges A1 and A2 into a single slot in their place when combining', () => {
    expect(COMBINED_SLOTS).toEqual([
      { label: 'SSD', levels: ['SSD'] },
      { label: 'MS', levels: ['MS'] },
      { label: 'Plus', levels: ['Plus'] },
      { label: 'A1/A2', levels: ['A1', 'A2'] },
      { label: 'C1', levels: ['C1'] },
      { label: 'C2', levels: ['C2'] },
      { label: 'C3A', levels: ['C3A'] },
      { label: 'C3B', levels: ['C3B'] },
      { label: 'C4', levels: ['C4'] },
    ])
    expect(COMBINED_SLOTS).toHaveLength(LEVEL_ORDER.length - 1)
  })

  it('merges C3B and C4 into a single "C3B+" slot in their place when combining', () => {
    expect(C3B_PLUS_SLOTS).toEqual([
      { label: 'SSD', levels: ['SSD'] },
      { label: 'MS', levels: ['MS'] },
      { label: 'Plus', levels: ['Plus'] },
      { label: 'A1', levels: ['A1'] },
      { label: 'A2', levels: ['A2'] },
      { label: 'C1', levels: ['C1'] },
      { label: 'C2', levels: ['C2'] },
      { label: 'C3A', levels: ['C3A'] },
      { label: 'C3B+', levels: ['C3B', 'C4'] },
    ])
    expect(C3B_PLUS_SLOTS).toHaveLength(LEVEL_ORDER.length - 1)
  })

  it('applies both merges together when both flags are on', () => {
    expect(getLevelSlots(true, true)).toEqual([
      { label: 'SSD', levels: ['SSD'] },
      { label: 'MS', levels: ['MS'] },
      { label: 'Plus', levels: ['Plus'] },
      { label: 'A1/A2', levels: ['A1', 'A2'] },
      { label: 'C1', levels: ['C1'] },
      { label: 'C2', levels: ['C2'] },
      { label: 'C3A', levels: ['C3A'] },
      { label: 'C3B+', levels: ['C3B', 'C4'] },
    ])
  })
})

describe('isSessionInLevelRange', () => {
  it('is visible when its single level is inside the range', () => {
    const session = makeStructured(['Plus'])
    const minIndex = LEVEL_ORDER.indexOf('MS')
    const maxIndex = LEVEL_ORDER.indexOf('A1')
    expect(isSessionInLevelRange(session, minIndex, maxIndex, BASE_SLOTS)).toBe(true)
  })

  it('is hidden when its single level is outside the range', () => {
    const session = makeStructured(['C4'])
    const minIndex = LEVEL_ORDER.indexOf('SSD')
    const maxIndex = LEVEL_ORDER.indexOf('Plus')
    expect(isSessionInLevelRange(session, minIndex, maxIndex, BASE_SLOTS)).toBe(false)
  })

  it('treats range boundaries as inclusive', () => {
    const session = makeStructured(['Plus'])
    const index = LEVEL_ORDER.indexOf('Plus')
    expect(isSessionInLevelRange(session, index, index, BASE_SLOTS)).toBe(true)
  })

  it('is visible if ANY of its multiple levels is in range', () => {
    const session = makeStructured(['SSD', 'C4'])
    const minIndex = LEVEL_ORDER.indexOf('SSD')
    const maxIndex = LEVEL_ORDER.indexOf('MS')
    expect(isSessionInLevelRange(session, minIndex, maxIndex, BASE_SLOTS)).toBe(true)
  })

  it('is hidden only if ALL of its multiple levels are outside range', () => {
    const session = makeStructured(['C3A', 'C4'])
    const minIndex = LEVEL_ORDER.indexOf('SSD')
    const maxIndex = LEVEL_ORDER.indexOf('Plus')
    expect(isSessionInLevelRange(session, minIndex, maxIndex, BASE_SLOTS)).toBe(false)
  })

  it('is always visible for levels not on the ordered scale (Intro/Various)', () => {
    expect(isSessionInLevelRange(makeStructured(['Intro']), 0, 0, BASE_SLOTS)).toBe(true)
    expect(isSessionInLevelRange(makeStructured(['Various']), 0, 0, BASE_SLOTS)).toBe(true)
  })

  it('is always visible for a freeform session regardless of range', () => {
    const freeform: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-04T00:00:00.000Z'),
      startTime: new Date('2026-07-04T21:00:00.000Z'),
      endTime: new Date('2026-07-04T21:30:00.000Z'),
      location: { kind: 'roomless' },
      description: 'Lunch Break',
    }
    expect(isSessionInLevelRange(freeform, 0, 0, BASE_SLOTS)).toBe(true)
  })

  it('is visible for any level when the range spans the full scale', () => {
    for (const level of LEVEL_ORDER) {
      expect(isSessionInLevelRange(makeStructured([level]), ...FULL_RANGE, BASE_SLOTS)).toBe(true)
    }
  })

  describe('with A1/A2 combined', () => {
    const a1a2Index = COMBINED_SLOTS.findIndex((slot) => slot.label === 'A1/A2')

    it('matches a session tagged only A1', () => {
      expect(isSessionInLevelRange(makeStructured(['A1']), a1a2Index, a1a2Index, COMBINED_SLOTS)).toBe(true)
    })

    it('matches a session tagged only A2', () => {
      expect(isSessionInLevelRange(makeStructured(['A2']), a1a2Index, a1a2Index, COMBINED_SLOTS)).toBe(true)
    })

    it('matches a session already tagged with both A1 and A2', () => {
      expect(
        isSessionInLevelRange(makeStructured(['A1', 'A2']), a1a2Index, a1a2Index, COMBINED_SLOTS),
      ).toBe(true)
    })

    it('is hidden when the combined range excludes the A1/A2 slot', () => {
      const ssdIndex = COMBINED_SLOTS.findIndex((slot) => slot.label === 'SSD')
      expect(isSessionInLevelRange(makeStructured(['A1']), ssdIndex, ssdIndex, COMBINED_SLOTS)).toBe(false)
    })
  })

  describe('with C3B/C4 combined', () => {
    const c3bPlusIndex = C3B_PLUS_SLOTS.findIndex((slot) => slot.label === 'C3B+')

    it('matches a session tagged only C3B', () => {
      expect(
        isSessionInLevelRange(makeStructured(['C3B']), c3bPlusIndex, c3bPlusIndex, C3B_PLUS_SLOTS),
      ).toBe(true)
    })

    it('matches a session tagged only C4', () => {
      expect(
        isSessionInLevelRange(makeStructured(['C4']), c3bPlusIndex, c3bPlusIndex, C3B_PLUS_SLOTS),
      ).toBe(true)
    })

    it('is hidden when the combined range excludes the C3B+ slot', () => {
      const ssdIndex = C3B_PLUS_SLOTS.findIndex((slot) => slot.label === 'SSD')
      expect(isSessionInLevelRange(makeStructured(['C4']), ssdIndex, ssdIndex, C3B_PLUS_SLOTS)).toBe(false)
    })
  })
})

const FREEFORM_SESSION: DanceSession = {
  kind: 'freeform',
  date: new Date('2026-07-02T00:00:00.000Z'),
  startTime: new Date('2026-07-02T21:00:00.000Z'),
  endTime: new Date('2026-07-02T21:30:00.000Z'),
  location: { kind: 'roomless' },
  description: 'Lunch Break',
}

describe('getPresentLevelIndexRange', () => {
  it('returns a single-index range for one ordered level', () => {
    const plusIndex = LEVEL_ORDER.indexOf('Plus')
    expect(getPresentLevelIndexRange([makeStructured(['Plus'])], BASE_SLOTS)).toEqual({
      minIndex: plusIndex,
      maxIndex: plusIndex,
    })
  })

  it('spans the min and max slot index across multiple sessions', () => {
    const sessions = [makeStructured(['C1']), makeStructured(['A2']), makeStructured(['C3A'])]
    expect(getPresentLevelIndexRange(sessions, BASE_SLOTS)).toEqual({
      minIndex: LEVEL_ORDER.indexOf('A2'),
      maxIndex: LEVEL_ORDER.indexOf('C3A'),
    })
  })

  it('ignores unordered levels (Intro/Various) and freeform sessions when computing the span', () => {
    const sessions = [makeStructured(['C1']), makeStructured(['Various']), FREEFORM_SESSION]
    const c1Index = LEVEL_ORDER.indexOf('C1')
    expect(getPresentLevelIndexRange(sessions, BASE_SLOTS)).toEqual({ minIndex: c1Index, maxIndex: c1Index })
  })

  it('falls back to the full range when there are no ordered-level sessions at all', () => {
    const sessions = [makeStructured(['Various']), FREEFORM_SESSION]
    expect(getPresentLevelIndexRange(sessions, BASE_SLOTS)).toEqual({ minIndex: 0, maxIndex: BASE_SLOTS.length - 1 })
  })

  it('falls back to the full range for an empty sessions array', () => {
    expect(getPresentLevelIndexRange([], BASE_SLOTS)).toEqual({ minIndex: 0, maxIndex: BASE_SLOTS.length - 1 })
  })

  it('resolves a merged slot (e.g. A1/A2) from either of its member levels, not a raw LEVEL_ORDER index', () => {
    const a1a2Index = COMBINED_SLOTS.findIndex((slot) => slot.label === 'A1/A2')
    expect(getPresentLevelIndexRange([makeStructured(['A2'])], COMBINED_SLOTS)).toEqual({
      minIndex: a1a2Index,
      maxIndex: a1a2Index,
    })
  })
})

describe('labelSlotsByPresence', () => {
  it('relabels a merged slot down to just the one member level actually present, event-wide', () => {
    const sessions = [makeStructured(['A2']), makeStructured(['C1'])]
    const relabeled = labelSlotsByPresence(COMBINED_SLOTS, sessions)
    const a1a2Slot = relabeled.find((slot) => slot.levels.includes('A2'))
    expect(a1a2Slot).toMatchObject({ label: 'A2', levels: ['A1', 'A2'] })
  })

  it('keeps the merge label when both member levels are present', () => {
    const sessions = [makeStructured(['A1']), makeStructured(['A2'])]
    const relabeled = labelSlotsByPresence(COMBINED_SLOTS, sessions)
    const a1a2Slot = relabeled.find((slot) => slot.levels.includes('A2'))
    expect(a1a2Slot).toMatchObject({ label: 'A1/A2' })
  })

  it('keeps the merge label when NEITHER member level is present (nothing scheduled yet)', () => {
    const sessions = [makeStructured(['C1'])]
    const relabeled = labelSlotsByPresence(COMBINED_SLOTS, sessions)
    const a1a2Slot = relabeled.find((slot) => slot.levels.includes('A2'))
    expect(a1a2Slot).toMatchObject({ label: 'A1/A2' })
  })

  it('leaves every non-merged (single-level) slot untouched', () => {
    const sessions = [makeStructured(['A2'])]
    const relabeled = labelSlotsByPresence(COMBINED_SLOTS, sessions)
    expect(relabeled.filter((slot) => slot.levels.length === 1)).toEqual(
      COMBINED_SLOTS.filter((slot) => slot.levels.length === 1),
    )
  })

  it('relabels the C3B+ merge down to just C4 when C3B never occurs', () => {
    const sessions = [makeStructured(['C4'])]
    const relabeled = labelSlotsByPresence(C3B_PLUS_SLOTS, sessions)
    const mergedSlot = relabeled.find((slot) => slot.levels.includes('C4'))
    expect(mergedSlot).toMatchObject({ label: 'C4' })
  })

  it('relabels the C3B+ merge down to just C3B when C4 never occurs', () => {
    const sessions = [makeStructured(['C3B'])]
    const relabeled = labelSlotsByPresence(C3B_PLUS_SLOTS, sessions)
    const mergedSlot = relabeled.find((slot) => slot.levels.includes('C3B'))
    expect(mergedSlot).toMatchObject({ label: 'C3B' })
  })

  it('ignores freeform sessions (no levels to contribute)', () => {
    const freeform: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-04T00:00:00.000Z'),
      startTime: new Date('2026-07-04T21:00:00.000Z'),
      endTime: new Date('2026-07-04T21:30:00.000Z'),
      location: { kind: 'roomless' },
      description: 'Lunch Break',
    }
    const relabeled = labelSlotsByPresence(COMBINED_SLOTS, [freeform])
    const a1a2Slot = relabeled.find((slot) => slot.levels.includes('A2'))
    expect(a1a2Slot).toMatchObject({ label: 'A1/A2' })
  })
})
