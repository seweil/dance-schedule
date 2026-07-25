import { describe, expect, it } from 'vitest'
import { colorForSession, NEUTRAL_CARD_COLOR } from './levelColors'
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

describe('colorForSession', () => {
  it('colors a single-level session by that level', () => {
    const plus = colorForSession(makeStructured(['Plus']))
    const c4 = colorForSession(makeStructured(['C4']))
    expect(plus).not.toBe(c4)
    expect(plus).toBe(colorForSession(makeStructured(['Plus'])))
  })

  it('colors a multi-level session by the LOWEST listed level, not the first', () => {
    const c1Color = colorForSession(makeStructured(['C1']))
    // Listed with C2 first, C1 second — lowest (C1) should still win.
    expect(colorForSession(makeStructured(['C2', 'C1']))).toBe(c1Color)
    expect(colorForSession(makeStructured(['C1', 'C2']))).toBe(c1Color)
  })

  it('gives Advanced, A1, and A2 the same color', () => {
    const advanced = colorForSession(makeStructured(['Advanced']))
    const a1 = colorForSession(makeStructured(['A1']))
    const a2 = colorForSession(makeStructured(['A2']))
    expect(a1).toBe(advanced)
    expect(a2).toBe(advanced)
  })

  it('shares A1/A2\'s color for a multi-level "A1/A2" session', () => {
    expect(colorForSession(makeStructured(['A1', 'A2']))).toBe(colorForSession(makeStructured(['Advanced'])))
  })

  it('treats Various as the SSD/MS bucket', () => {
    expect(colorForSession(makeStructured(['Various']))).toBe(colorForSession(makeStructured(['SSD'])))
  })

  it('floors the bare Intro tag to the SSD/MS bucket', () => {
    expect(colorForSession(makeStructured(['Intro']))).toBe(colorForSession(makeStructured(['MS'])))
  })

  it('colors a real "Intro to X" session by its actual prerequisite level, not as Intro', () => {
    // Real data always lists the prerequisite level (e.g. "A2 : Intro to C1 - ..."),
    // not the bare Intro tag — so this should get A2's color, not the Intro/SSD one.
    const introToC1 = makeStructured(['A2'], { eventType: 'Intro to C1' })
    expect(colorForSession(introToC1)).toBe(colorForSession(makeStructured(['A2'])))
    expect(colorForSession(introToC1)).not.toBe(colorForSession(makeStructured(['Intro'])))
  })

  it('returns the neutral color for a freeform (roomless or not) session', () => {
    const freeform: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-03T00:00:00.000Z'),
      startTime: new Date('2026-07-03T17:00:00.000Z'),
      endTime: new Date('2026-07-03T18:30:00.000Z'),
      location: { kind: 'roomless' },
      description: 'Lunch Break',
    }
    expect(colorForSession(freeform)).toBe(NEUTRAL_CARD_COLOR)
  })
})
