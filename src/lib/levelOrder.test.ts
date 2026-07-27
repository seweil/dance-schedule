import { describe, expect, it } from 'vitest'
import { LEVEL_ORDER, getLevelSlots, isSessionInLevelRange } from './levelOrder'
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

const BASE_SLOTS = getLevelSlots(false)
const COMBINED_SLOTS = getLevelSlots(true)
const FULL_RANGE: [number, number] = [0, BASE_SLOTS.length - 1]

describe('LEVEL_ORDER', () => {
  it('reflects the real skill progression, not LEVEL_CODES\'s declared order', () => {
    expect(LEVEL_ORDER).toEqual(['SSD', 'MS', 'Plus', 'A1', 'A2', 'C1', 'C2', 'C3A', 'C3B', 'C4'])
  })
})

describe('getLevelSlots', () => {
  it('returns one slot per level, unchanged, when not combining A1/A2', () => {
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

  it('is always visible for levels not on the ordered scale (Advanced/Intro/Various)', () => {
    expect(isSessionInLevelRange(makeStructured(['Advanced']), 0, 0, BASE_SLOTS)).toBe(true)
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
})
