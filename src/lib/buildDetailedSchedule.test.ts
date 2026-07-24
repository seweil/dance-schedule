import { describe, expect, it } from 'vitest'
import { buildDetailedSchedule } from './buildDetailedSchedule'
import type { DetailedSessionData, StructuredSessionData } from '../types/detailedSchedule'

function makeStructured(overrides: Partial<StructuredSessionData> = {}): StructuredSessionData {
  return {
    kind: 'structured',
    date: '2026-07-02T00:00:00.000Z',
    startTime: '2026-07-02T12:30:00.000Z',
    endTime: '2026-07-02T13:30:00.000Z',
    room: 'Ballroom Centre',
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  }
}

describe('buildDetailedSchedule', () => {
  it('converts a structured session, preserving levels/callers/gca', () => {
    const [session] = buildDetailedSchedule([makeStructured({ gca: 'Tim Stephens' })])
    expect(session).toEqual({
      kind: 'structured',
      date: new Date('2026-07-02T00:00:00.000Z'),
      startTime: new Date('2026-07-02T12:30:00.000Z'),
      endTime: new Date('2026-07-02T13:30:00.000Z'),
      room: 'Ballroom Centre',
      levels: ['SSD'],
      eventType: 'Dancing',
      callers: ['Ted Lizotte'],
      gca: 'Tim Stephens',
    })
  })

  it('converts a freeform session', () => {
    const data: DetailedSessionData = {
      kind: 'freeform',
      date: '2026-07-04T00:00:00.000Z',
      startTime: '2026-07-04T22:00:00.000Z',
      endTime: '2026-07-05T01:00:00.000Z',
      room: 'Hemon',
      description: 'Country Western Dance - until 1am',
    }
    const [session] = buildDetailedSchedule([data])
    expect(session).toEqual({
      kind: 'freeform',
      date: new Date('2026-07-04T00:00:00.000Z'),
      startTime: new Date('2026-07-04T22:00:00.000Z'),
      endTime: new Date('2026-07-05T01:00:00.000Z'),
      room: 'Hemon',
      description: 'Country Western Dance - until 1am',
    })
  })

  it('sorts sessions chronologically ascending by start time', () => {
    const later = makeStructured({ startTime: '2026-07-03T18:00:00.000Z', eventType: 'Later' })
    const earlier = makeStructured({ startTime: '2026-07-02T12:30:00.000Z', eventType: 'Earlier' })

    const result = buildDetailedSchedule([later, earlier])

    expect(result.map((s) => (s.kind === 'structured' ? s.eventType : null))).toEqual([
      'Earlier',
      'Later',
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(buildDetailedSchedule([])).toEqual([])
  })
})
