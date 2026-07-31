import { describe, expect, it } from 'vitest'
import { filterDanceSessions } from './filterDanceSessions'
import { LEVEL_ORDER, getLevelSlots } from './levelOrder'
import type { StructuredSession } from '../types/danceSchedule'

const BASE_SLOTS = getLevelSlots(false, false)

function makeSession(overrides: Partial<StructuredSession> = {}): StructuredSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date('2026-07-02T12:30:00.000Z'),
    endTime: new Date('2026-07-02T13:30:00.000Z'),
    location: { kind: 'located', rooms: ['Ballroom Centre'] },
    levels: ['Plus'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  }
}

const FULL_RANGE: [number, number] = [0, LEVEL_ORDER.length - 1]

describe('filterDanceSessions', () => {
  it('excludes sessions on a different date', () => {
    const sessions = [
      makeSession({ date: new Date('2026-07-02T00:00:00.000Z') }),
      makeSession({ date: new Date('2026-07-03T00:00:00.000Z') }),
    ]
    const result = filterDanceSessions(sessions, new Date('2026-07-02T00:00:00.000Z'), ...FULL_RANGE, BASE_SLOTS)
    expect(result).toHaveLength(1)
    expect(result[0]?.date).toEqual(new Date('2026-07-02T00:00:00.000Z'))
  })

  it('excludes sessions outside the level range on the matching date', () => {
    const inRange = makeSession({ levels: ['Plus'], eventType: 'InRange' })
    const outOfRange = makeSession({ levels: ['C4'], eventType: 'OutOfRange' })
    const minIndex = LEVEL_ORDER.indexOf('SSD')
    const maxIndex = LEVEL_ORDER.indexOf('Plus')

    const result = filterDanceSessions(
      [inRange, outOfRange],
      new Date('2026-07-02T00:00:00.000Z'),
      minIndex,
      maxIndex,
      BASE_SLOTS,
    )

    expect(result.map((s) => (s.kind === 'structured' ? s.eventType : null))).toEqual(['InRange'])
  })

  it('applies both filters together', () => {
    const rightDateRightLevel = makeSession({
      date: new Date('2026-07-02T00:00:00.000Z'),
      levels: ['Plus'],
      eventType: 'Match',
    })
    const rightDateWrongLevel = makeSession({
      date: new Date('2026-07-02T00:00:00.000Z'),
      levels: ['C4'],
      eventType: 'WrongLevel',
    })
    const wrongDateRightLevel = makeSession({
      date: new Date('2026-07-03T00:00:00.000Z'),
      levels: ['Plus'],
      eventType: 'WrongDate',
    })
    const minIndex = LEVEL_ORDER.indexOf('SSD')
    const maxIndex = LEVEL_ORDER.indexOf('Plus')

    const result = filterDanceSessions(
      [rightDateRightLevel, rightDateWrongLevel, wrongDateRightLevel],
      new Date('2026-07-02T00:00:00.000Z'),
      minIndex,
      maxIndex,
      BASE_SLOTS,
    )

    expect(result.map((s) => (s.kind === 'structured' ? s.eventType : null))).toEqual(['Match'])
  })

  it('returns an empty array when nothing matches the date', () => {
    const sessions = [makeSession({ date: new Date('2026-07-02T00:00:00.000Z') })]
    const result = filterDanceSessions(sessions, new Date('2026-07-05T00:00:00.000Z'), ...FULL_RANGE, BASE_SLOTS)
    expect(result).toEqual([])
  })
})
