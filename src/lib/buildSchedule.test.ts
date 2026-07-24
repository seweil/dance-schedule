import { describe, expect, it } from 'vitest'
import { buildSchedule } from './buildSchedule'
import type { ScheduleEventData } from '../types/schedule'

function makeEventData(overrides: Partial<ScheduleEventData> = {}): ScheduleEventData {
  return {
    date: '2026-08-15T00:00:00.000Z',
    startTime: '2026-08-15T18:00:00.000Z',
    endTime: '2026-08-15T19:30:00.000Z',
    location: 'Studio A',
    description: 'Beginner salsa',
    ...overrides,
  }
}

describe('buildSchedule', () => {
  it('converts ISO string fields into Date objects', () => {
    const [event] = buildSchedule([makeEventData()])
    expect(event).toEqual({
      date: new Date('2026-08-15T00:00:00.000Z'),
      startTime: new Date('2026-08-15T18:00:00.000Z'),
      endTime: new Date('2026-08-15T19:30:00.000Z'),
      location: 'Studio A',
      description: 'Beginner salsa',
    })
  })

  it('sorts events chronologically ascending by start time', () => {
    const later = makeEventData({
      startTime: '2026-09-01T18:00:00.000Z',
      endTime: '2026-09-01T19:30:00.000Z',
      description: 'Later event',
    })
    const earlier = makeEventData({
      startTime: '2026-08-15T18:00:00.000Z',
      endTime: '2026-08-15T19:30:00.000Z',
      description: 'Earlier event',
    })

    const result = buildSchedule([later, earlier])

    expect(result.map((event) => event.description)).toEqual(['Earlier event', 'Later event'])
  })

  it('returns an empty array for empty input', () => {
    expect(buildSchedule([])).toEqual([])
  })
})
