import { describe, expect, it } from 'vitest'
import { LEVEL_ORDER, isSessionInLevelRange } from './levelOrder'
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

const FULL_RANGE: [number, number] = [0, LEVEL_ORDER.length - 1]

describe('LEVEL_ORDER', () => {
  it('reflects the real skill progression, not LEVEL_CODES\'s declared order', () => {
    expect(LEVEL_ORDER).toEqual(['SSD', 'MS', 'Plus', 'A1', 'A2', 'C1', 'C2', 'C3A', 'C3B', 'C4'])
  })
})

describe('isSessionInLevelRange', () => {
  it('is visible when its single level is inside the range', () => {
    const session = makeStructured(['Plus'])
    const minIndex = LEVEL_ORDER.indexOf('MS')
    const maxIndex = LEVEL_ORDER.indexOf('A1')
    expect(isSessionInLevelRange(session, minIndex, maxIndex)).toBe(true)
  })

  it('is hidden when its single level is outside the range', () => {
    const session = makeStructured(['C4'])
    const minIndex = LEVEL_ORDER.indexOf('SSD')
    const maxIndex = LEVEL_ORDER.indexOf('Plus')
    expect(isSessionInLevelRange(session, minIndex, maxIndex)).toBe(false)
  })

  it('treats range boundaries as inclusive', () => {
    const session = makeStructured(['Plus'])
    const index = LEVEL_ORDER.indexOf('Plus')
    expect(isSessionInLevelRange(session, index, index)).toBe(true)
  })

  it('is visible if ANY of its multiple levels is in range', () => {
    const session = makeStructured(['SSD', 'C4'])
    const minIndex = LEVEL_ORDER.indexOf('SSD')
    const maxIndex = LEVEL_ORDER.indexOf('MS')
    expect(isSessionInLevelRange(session, minIndex, maxIndex)).toBe(true)
  })

  it('is hidden only if ALL of its multiple levels are outside range', () => {
    const session = makeStructured(['C3A', 'C4'])
    const minIndex = LEVEL_ORDER.indexOf('SSD')
    const maxIndex = LEVEL_ORDER.indexOf('Plus')
    expect(isSessionInLevelRange(session, minIndex, maxIndex)).toBe(false)
  })

  it('is always visible for levels not on the ordered scale (Advanced/Intro/Various)', () => {
    expect(isSessionInLevelRange(makeStructured(['Advanced']), 0, 0)).toBe(true)
    expect(isSessionInLevelRange(makeStructured(['Intro']), 0, 0)).toBe(true)
    expect(isSessionInLevelRange(makeStructured(['Various']), 0, 0)).toBe(true)
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
    expect(isSessionInLevelRange(freeform, 0, 0)).toBe(true)
  })

  it('is visible for any level when the range spans the full scale', () => {
    for (const level of LEVEL_ORDER) {
      expect(isSessionInLevelRange(makeStructured([level]), ...FULL_RANGE)).toBe(true)
    }
  })
})
