import { describe, expect, it } from 'vitest'
import { deriveRoomOrder, validateRoomOrderConfig } from './deriveRoomOrder'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

function makeSession(location: SessionLocation, overrides: Partial<DanceSession> = {}): DanceSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date('2026-07-02T12:00:00.000Z'),
    endTime: new Date('2026-07-02T13:00:00.000Z'),
    location,
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  } as DanceSession
}

function makeFreeform(location: SessionLocation, overrides: Partial<DanceSession> = {}): DanceSession {
  return {
    kind: 'freeform',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date('2026-07-02T12:00:00.000Z'),
    endTime: new Date('2026-07-02T13:00:00.000Z'),
    location,
    description: 'Country Western Dance',
    ...overrides,
  } as DanceSession
}

describe('deriveRoomOrder', () => {
  it('defaults to increasing median dance level, not spreadsheet appearance order', () => {
    // West appears first in the spreadsheet but is the harder level — the default
    // should still put Centre (SSD) before West (C4).
    const west = makeSession(located('Ballroom West'), { levels: ['C4'] })
    const centre = makeSession(located('Ballroom Centre'), { levels: ['SSD'] })
    const allSessions = [west, centre]

    expect(deriveRoomOrder(allSessions, undefined)).toEqual(['Ballroom Centre', 'Ballroom West'])
  })

  it('breaks a median tie by average level', () => {
    // Room A: SSD, A1, A1, A1 → median 3 (A1), average 2.25.
    // Room B: A1, A1, A1, C4 → median 3 (A1), average 4.5.
    // Same median, but A's average is lower, so A sorts first.
    const roomB = [
      makeSession(located('Room B'), { levels: ['A1'] }),
      makeSession(located('Room B'), { levels: ['A1'] }),
      makeSession(located('Room B'), { levels: ['A1'] }),
      makeSession(located('Room B'), { levels: ['C4'] }),
    ]
    const roomA = [
      makeSession(located('Room A'), { levels: ['SSD'] }),
      makeSession(located('Room A'), { levels: ['A1'] }),
      makeSession(located('Room A'), { levels: ['A1'] }),
      makeSession(located('Room A'), { levels: ['A1'] }),
    ]
    // Room B appears first in the spreadsheet — proves the average tiebreak wins
    // over appearance order too.
    const allSessions = [...roomB, ...roomA]

    expect(deriveRoomOrder(allSessions, undefined)).toEqual(['Room A', 'Room B'])
  })

  it('sorts a room with no leveled sessions at all after every leveled room, in spreadsheet order', () => {
    const leveled = makeSession(located('Leveled Room'), { levels: ['C4'] }) // hardest level
    const freeformOnly1 = makeFreeform(located('Freeform Room 1'))
    const freeformOnly2 = makeFreeform(located('Freeform Room 2'))
    // A structured session with only Intro/Various also has no ordered
    // level — same "no data point" treatment as a freeform session.
    const unorderedLevelOnly = makeSession(located('Unordered Room'), { levels: ['Various'] })
    const allSessions = [freeformOnly1, unorderedLevelOnly, leveled, freeformOnly2]

    expect(deriveRoomOrder(allSessions, undefined)).toEqual([
      'Leveled Room',
      'Freeform Room 1',
      'Unordered Room',
      'Freeform Room 2',
    ])
  })

  it('counts a session toward every room it spans, and every level it lists', () => {
    const spanning = makeSession(located('Room A', 'Room B'), { levels: ['SSD', 'C4'] })
    const soloHard = makeSession(located('Room C'), { levels: ['C4'] })
    const allSessions = [spanning, soloHard]

    // Room A and Room B each get [SSD(0), C4(9)] → median 4.5. Room C gets just
    // [C4(9)] → median 9. A/B tie on median+average+(spreadsheet order A before B).
    expect(deriveRoomOrder(allSessions, undefined)).toEqual(['Room A', 'Room B', 'Room C'])
  })

  it('keeps a multi-room session\'s rooms adjacent even when median level would otherwise separate them', () => {
    // Centre and West co-span an "All Callers Dance" — median level alone would
    // put East between them (Centre/West are easy, East is hard, but nothing
    // else ties them together), splitting the span into two duplicate cards
    // (computeDanceScheduleLayout's non-contiguous fallback). Grouping keeps
    // them adjacent instead.
    const allCallers = makeSession(located('Ballroom Centre', 'Ballroom West'), { levels: ['SSD'] })
    const east = makeSession(located('Ballroom East'), { levels: ['C4'] })
    const allSessions = [allCallers, east]

    const order = deriveRoomOrder(allSessions, undefined)
    const centreIndex = order.indexOf('Ballroom Centre')
    const westIndex = order.indexOf('Ballroom West')
    expect(Math.abs(centreIndex - westIndex)).toBe(1)
  })

  it('transitively groups rooms across separate spanning sessions', () => {
    // A spans with B in one session, B spans with C in another — all three must
    // end up in one contiguous block, not just each pair individually.
    const aWithB = makeSession(located('Room A', 'Room B'))
    const bWithC = makeSession(located('Room B', 'Room C'), {
      startTime: new Date('2026-07-02T14:00:00.000Z'),
      endTime: new Date('2026-07-02T15:00:00.000Z'),
    })
    const other = makeSession(located('Room Other'))
    const allSessions = [other, aWithB, bWithC]

    const order = deriveRoomOrder(allSessions, undefined)
    const groupIndices = ['Room A', 'Room B', 'Room C'].map((room) => order.indexOf(room)).sort()
    // Contiguous block of exactly 3 consecutive positions.
    expect(groupIndices[2]! - groupIndices[0]!).toBe(2)
  })

  it("'spreadsheet' opts back into first-appearance order, ignoring level", () => {
    const west = makeSession(located('Ballroom West'), { levels: ['C4'] })
    const centre = makeSession(located('Ballroom Centre'), { levels: ['SSD'] })
    const allSessions = [west, centre]

    expect(deriveRoomOrder(allSessions, 'spreadsheet')).toEqual(['Ballroom West', 'Ballroom Centre'])
  })

  it('an explicit array is returned verbatim — filtering to a given date\'s visible rooms is computeDanceScheduleLayout\'s job, not this function\'s', () => {
    const centre = makeSession(located('Ballroom Centre'))
    const east = makeSession(located('Ballroom East'))
    const allSessions = [centre, east]

    const roomOrderConfig = ['Ballroom East', 'Ballroom West', 'Ballroom Centre']

    expect(deriveRoomOrder(allSessions, roomOrderConfig)).toEqual(roomOrderConfig)
  })
})

describe('validateRoomOrderConfig', () => {
  const centre = makeSession(located('Ballroom Centre'))
  const east = makeSession(located('Ballroom East'))
  const allSessions = [centre, east]

  it('does nothing when roomOrderConfig is undefined or "spreadsheet"', () => {
    expect(() => validateRoomOrderConfig(allSessions, undefined, 'config.yaml')).not.toThrow()
    expect(() => validateRoomOrderConfig(allSessions, 'spreadsheet', 'config.yaml')).not.toThrow()
  })

  it('accepts an explicit array that names every real room exactly once', () => {
    expect(() =>
      validateRoomOrderConfig(allSessions, ['Ballroom East', 'Ballroom Centre'], 'config.yaml'),
    ).not.toThrow()
  })

  it('throws naming a room missing from the list', () => {
    expect(() => validateRoomOrderConfig(allSessions, ['Ballroom Centre'], 'config.yaml')).toThrow(
      /missing room\(s\): Ballroom East/,
    )
  })

  it('throws naming a listed room that matches no real room', () => {
    expect(() =>
      validateRoomOrderConfig(allSessions, ['Ballroom Centre', 'Ballroom East', 'Nonexistent Room'], 'config.yaml'),
    ).toThrow(/unknown room\(s\) not found in any date: Nonexistent Room/)
  })

  it('throws naming a room listed twice', () => {
    expect(() =>
      validateRoomOrderConfig(
        allSessions,
        ['Ballroom Centre', 'Ballroom East', 'Ballroom Centre'],
        'config.yaml',
      ),
    ).toThrow(/duplicate room\(s\): Ballroom Centre/)
  })

  it('includes the config file path in the error message', () => {
    expect(() => validateRoomOrderConfig(allSessions, [], '/path/to/config.yaml')).toThrow(
      /\/path\/to\/config\.yaml/,
    )
  })
})
