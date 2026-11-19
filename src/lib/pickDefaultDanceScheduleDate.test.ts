import { describe, expect, it } from 'vitest'
import { pickDefaultDanceScheduleDate } from './pickDefaultDanceScheduleDate'
import { getLevelSlots } from './levelOrder'
import type { DanceSessionDateGroup } from './groupDanceSessionsByDate'
import type { LevelCode, StructuredSession } from '../types/danceSchedule'

const SLOTS = getLevelSlots(false, false)

function makeGroup(isoDate: string, levelsPerSession: LevelCode[][]): DanceSessionDateGroup {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  const sessions = levelsPerSession.map(
    (levels): StructuredSession => ({
      kind: 'structured',
      date,
      startTime: new Date(`${isoDate}T19:00:00.000Z`),
      endTime: new Date(`${isoDate}T20:00:00.000Z`),
      location: { kind: 'located', rooms: ['Hall A'] },
      levels,
      eventType: 'Dancing',
      callers: ['Ted Lizotte'],
    }),
  )
  return { date, sessions }
}

// A warm-up day with one level, then two full days.
const GROUPS = [
  makeGroup('2027-01-28', [['MS']]),
  makeGroup('2027-01-29', [['MS'], ['Plus']]),
  makeGroup('2027-01-30', [['MS'], ['A2']]),
]

describe('pickDefaultDanceScheduleDate', () => {
  it("picks today when it's one of the event's dates, even a one-level day", () => {
    expect(pickDefaultDanceScheduleDate(GROUPS, SLOTS, new Date(2027, 0, 28, 20))).toEqual(GROUPS[0]!.date)
    expect(pickDefaultDanceScheduleDate(GROUPS, SLOTS, new Date(2027, 0, 30, 9))).toEqual(GROUPS[2]!.date)
  })

  it('skips a leading one-level day before the event', () => {
    expect(pickDefaultDanceScheduleDate(GROUPS, SLOTS, new Date(2026, 10, 18))).toEqual(GROUPS[1]!.date)
  })

  it('falls back to the first date when no date has more than one level', () => {
    const groups = [makeGroup('2027-01-28', [['MS']]), makeGroup('2027-01-29', [['Plus'], ['Plus']])]
    expect(pickDefaultDanceScheduleDate(groups, SLOTS, new Date(2026, 10, 18))).toEqual(groups[0]!.date)
  })

  it('returns undefined with no dates at all', () => {
    expect(pickDefaultDanceScheduleDate([], SLOTS)).toBeUndefined()
  })
})
