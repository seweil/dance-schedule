import { describe, expect, it } from 'vitest'
import { groupDanceSessionsByDate } from './groupDanceSessionsByDate'
import type { StructuredSession } from '../types/danceSchedule'

function makeSession(overrides: Partial<StructuredSession> = {}): StructuredSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date('2026-07-02T12:30:00.000Z'),
    endTime: new Date('2026-07-02T13:30:00.000Z'),
    room: 'Ballroom Centre',
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  }
}

describe('groupDanceSessionsByDate', () => {
  it('groups consecutive same-date sessions into one group', () => {
    const sessions = [
      makeSession({ eventType: 'Morning class' }),
      makeSession({ eventType: 'Afternoon class' }),
    ]

    const groups = groupDanceSessionsByDate(sessions)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.date).toEqual(new Date('2026-07-02T00:00:00.000Z'))
    expect(groups[0]?.sessions).toHaveLength(2)
  })

  it('creates one group per distinct date, in order', () => {
    const day1 = makeSession({ date: new Date('2026-07-02T00:00:00.000Z') })
    const day2 = makeSession({ date: new Date('2026-07-03T00:00:00.000Z') })
    const day3 = makeSession({ date: new Date('2026-07-04T00:00:00.000Z') })

    const groups = groupDanceSessionsByDate([day1, day2, day3])

    expect(groups.map((group) => group.date.toISOString())).toEqual([
      '2026-07-02T00:00:00.000Z',
      '2026-07-03T00:00:00.000Z',
      '2026-07-04T00:00:00.000Z',
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(groupDanceSessionsByDate([])).toEqual([])
  })
})
