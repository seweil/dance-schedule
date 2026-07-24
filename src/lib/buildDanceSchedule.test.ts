import { describe, expect, it } from 'vitest'
import { buildDanceSchedule } from './buildDanceSchedule'
import type { DanceSessionData, StructuredSessionData } from '../types/danceSchedule'

function makeStructured(overrides: Partial<StructuredSessionData> = {}): StructuredSessionData {
  return {
    kind: 'structured',
    date: '2026-07-02T00:00:00.000Z',
    startTime: '2026-07-02T12:30:00.000Z',
    endTime: '2026-07-02T13:30:00.000Z',
    location: { kind: 'located', rooms: ['Ballroom Centre'] },
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  }
}

describe('buildDanceSchedule', () => {
  it('converts a structured session, preserving levels/callers/gca', () => {
    const [session] = buildDanceSchedule([makeStructured({ gca: 'Tim Stephens' })])
    expect(session).toEqual({
      kind: 'structured',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T12:30:00.000Z'),
      endTime: new Date('2026-07-02T13:30:00.000Z'),
      location: { kind: 'located', rooms: ['Ballroom Centre'] },
      levels: ['SSD'],
      eventType: 'Dancing',
      callers: ['Ted Lizotte'],
      gca: 'Tim Stephens',
    })
  })

  it('converts a freeform session', () => {
    const data: DanceSessionData = {
      kind: 'freeform',
      date: '2026-07-04T00:00:00.000Z',
      startTime: '2026-07-04T22:00:00.000Z',
      endTime: '2026-07-05T01:00:00.000Z',
      location: { kind: 'located', rooms: ['Hemon'] },
      description: 'Country Western Dance - until 1am',
    }
    const [session] = buildDanceSchedule([data])
    expect(session).toEqual({
      kind: 'freeform',
      date: new Date('2026-07-04T00:00:00.000Z'),
      startTime: new Date('2026-07-04T22:00:00.000Z'),
      endTime: new Date('2026-07-05T01:00:00.000Z'),
      location: { kind: 'located', rooms: ['Hemon'] },
      description: 'Country Western Dance - until 1am',
    })
  })

  it('preserves a roomless location and a multi-room located list unchanged', () => {
    const roomless = makeStructured({ location: { kind: 'roomless' }, eventType: 'Lunch Break' })
    const multiRoom = makeStructured({
      location: { kind: 'located', rooms: ['Ballroom Centre', 'Ballroom East'] },
      startTime: '2026-07-02T13:30:00.000Z',
      eventType: 'Combined',
    })

    const [first, second] = buildDanceSchedule([roomless, multiRoom])

    expect(first?.location).toEqual({ kind: 'roomless' })
    expect(second?.location).toEqual({ kind: 'located', rooms: ['Ballroom Centre', 'Ballroom East'] })
  })

  it('sorts sessions chronologically ascending by start time', () => {
    const later = makeStructured({ startTime: '2026-07-03T18:00:00.000Z', eventType: 'Later' })
    const earlier = makeStructured({ startTime: '2026-07-02T12:30:00.000Z', eventType: 'Earlier' })

    const result = buildDanceSchedule([later, earlier])

    expect(result.map((s) => (s.kind === 'structured' ? s.eventType : null))).toEqual([
      'Earlier',
      'Later',
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(buildDanceSchedule([])).toEqual([])
  })
})
