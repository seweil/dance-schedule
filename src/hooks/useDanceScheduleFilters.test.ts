import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDanceScheduleFilters } from './useDanceScheduleFilters'
import { LEVEL_ORDER } from '../lib/levelOrder'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

function makeSession(
  date: string,
  startTime: string,
  endTime: string,
  location: SessionLocation,
  overrides: Partial<DanceSession> = {},
): DanceSession {
  return {
    kind: 'structured',
    date: new Date(date),
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    location,
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  } as DanceSession
}

const day1Session = makeSession(
  '2026-07-02T00:00:00.000Z',
  '2026-07-02T13:00:00.000Z',
  '2026-07-02T14:00:00.000Z',
  located('Ballroom Centre'),
)
const day1AdvancedSession = makeSession(
  '2026-07-02T00:00:00.000Z',
  '2026-07-02T13:00:00.000Z',
  '2026-07-02T14:00:00.000Z',
  located('Ballroom East'),
  { levels: ['C4'] },
)
const day2Session = makeSession(
  '2026-07-03T00:00:00.000Z',
  '2026-07-03T13:00:00.000Z',
  '2026-07-03T14:00:00.000Z',
  located('Ballroom Centre'),
)

const ALL_SESSIONS = [day1Session, day1AdvancedSession, day2Session]

describe('useDanceScheduleFilters', () => {
  it('defaults to the earliest date, the full level range, and showing GCA', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS))

    expect(result.current.dates).toEqual([
      new Date('2026-07-02T00:00:00.000Z'),
      new Date('2026-07-03T00:00:00.000Z'),
    ])
    expect(result.current.selectedDate).toEqual(new Date('2026-07-02T00:00:00.000Z'))
    expect(result.current.minLevelIndex).toBe(0)
    expect(result.current.maxLevelIndex).toBe(LEVEL_ORDER.length - 1)
    expect(result.current.showGca).toBe(true)
  })

  it('scopes the layout to the selected date and switches when the date changes', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS))

    expect(result.current.layout.placements.map((p) => p.session)).toEqual([
      day1Session,
      day1AdvancedSession,
    ])

    act(() => result.current.setSelectedDate(new Date('2026-07-03T00:00:00.000Z')))

    expect(result.current.selectedDate).toEqual(new Date('2026-07-03T00:00:00.000Z'))
    expect(result.current.layout.placements.map((p) => p.session)).toEqual([day2Session])
  })

  it('hides out-of-range sessions and their now-empty room column when the level range narrows', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS))

    act(() => result.current.setLevelRange(LEVEL_ORDER.indexOf('SSD'), LEVEL_ORDER.indexOf('Plus')))

    expect(result.current.minLevelIndex).toBe(LEVEL_ORDER.indexOf('SSD'))
    expect(result.current.maxLevelIndex).toBe(LEVEL_ORDER.indexOf('Plus'))
    expect(result.current.layout.placements.map((p) => p.session)).toEqual([day1Session])
    expect(result.current.layout.visibleRooms).toEqual(['Ballroom Centre'])
  })

  it('toggles showGca', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS))

    act(() => result.current.setShowGca(false))

    expect(result.current.showGca).toBe(false)
  })
})
