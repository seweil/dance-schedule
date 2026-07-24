import { describe, expect, it } from 'vitest'
import { groupEventsByDate } from './groupEventsByDate'
import type { ScheduleEvent } from '../types/schedule'

function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    date: new Date('2026-08-15T00:00:00.000Z'),
    startTime: new Date('2026-08-15T18:00:00.000Z'),
    endTime: new Date('2026-08-15T19:30:00.000Z'),
    location: 'Studio A',
    description: 'Beginner Salsa',
    ...overrides,
  }
}

describe('groupEventsByDate', () => {
  it('groups consecutive same-date events into one group', () => {
    const events = [
      makeEvent({ description: 'Morning class' }),
      makeEvent({ description: 'Afternoon class' }),
    ]

    const groups = groupEventsByDate(events)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.date).toEqual(new Date('2026-08-15T00:00:00.000Z'))
    expect(groups[0]?.events.map((event) => event.description)).toEqual([
      'Morning class',
      'Afternoon class',
    ])
  })

  it('creates one group per distinct date, in order', () => {
    const day1 = makeEvent({ date: new Date('2026-08-15T00:00:00.000Z'), description: 'Day 1' })
    const day2 = makeEvent({ date: new Date('2026-08-16T00:00:00.000Z'), description: 'Day 2' })
    const day3 = makeEvent({ date: new Date('2026-08-17T00:00:00.000Z'), description: 'Day 3' })

    const groups = groupEventsByDate([day1, day2, day3])

    expect(groups.map((group) => group.date.toISOString())).toEqual([
      '2026-08-15T00:00:00.000Z',
      '2026-08-16T00:00:00.000Z',
      '2026-08-17T00:00:00.000Z',
    ])
    expect(groups.map((group) => group.events.length)).toEqual([1, 1, 1])
  })

  it('returns an empty array for empty input', () => {
    expect(groupEventsByDate([])).toEqual([])
  })
})
