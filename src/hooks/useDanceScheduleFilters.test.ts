import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDanceScheduleFilters } from './useDanceScheduleFilters'
import { LEVEL_ORDER, getLevelSlots, labelSlotsByPresence } from '../lib/levelOrder'
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
  { gca: 'Some Caller' },
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
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))

    expect(result.current.dates).toEqual([
      new Date('2026-07-02T00:00:00.000Z'),
      new Date('2026-07-03T00:00:00.000Z'),
    ])
    expect(result.current.selectedDate).toEqual(new Date('2026-07-02T00:00:00.000Z'))
    expect(result.current.minLevelIndex).toBe(0)
    expect(result.current.maxLevelIndex).toBe(LEVEL_ORDER.length - 1)
    expect(result.current.showGca).toBe(true)
  })

  it('scopes dateSessions/visibleSessions to the selected date and switches when the date changes', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))

    expect(result.current.dateSessions).toEqual([day1Session, day1AdvancedSession])
    expect(result.current.visibleSessions).toEqual([day1Session, day1AdvancedSession])

    act(() => result.current.setSelectedDate(new Date('2026-07-03T00:00:00.000Z')))

    expect(result.current.selectedDate).toEqual(new Date('2026-07-03T00:00:00.000Z'))
    expect(result.current.dateSessions).toEqual([day2Session])
    expect(result.current.visibleSessions).toEqual([day2Session])
  })

  it('narrows visibleSessions (but not dateSessions) when the level range narrows', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))

    act(() => result.current.setLevelRange(LEVEL_ORDER.indexOf('SSD'), LEVEL_ORDER.indexOf('Plus')))

    expect(result.current.minLevelIndex).toBe(LEVEL_ORDER.indexOf('SSD'))
    expect(result.current.maxLevelIndex).toBe(LEVEL_ORDER.indexOf('Plus'))
    expect(result.current.visibleSessions).toEqual([day1Session])
    expect(result.current.dateSessions).toEqual([day1Session, day1AdvancedSession])
  })

  it('toggles showGca', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))

    act(() => result.current.setShowGca(false))

    expect(result.current.showGca).toBe(false)
  })

  it('exposes the base (uncombined) slots when both flags are false', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))
    expect(result.current.slots).toEqual(getLevelSlots(false, false))
    expect(result.current.slots).toHaveLength(LEVEL_ORDER.length)
  })

  it('exposes the merged slots and a smaller full-range default when combineA1A2 is true', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, true, false))
    expect(result.current.slots).toEqual(getLevelSlots(true, false))
    expect(result.current.maxLevelIndex).toBe(getLevelSlots(true, false).length - 1)
  })

  it('exposes a smaller full-range default when combineC3BC4 is true, relabeled to just "C4" since C3B never occurs in this fixture', () => {
    const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, true))
    expect(result.current.slots).toEqual(labelSlotsByPresence(getLevelSlots(false, true), ALL_SESSIONS))
    expect(result.current.slots.find((slot) => slot.levels.includes('C4'))).toMatchObject({ label: 'C4' })
    expect(result.current.maxLevelIndex).toBe(getLevelSlots(false, true).length - 1)
  })

  it('does not crash with no sessions at all, and leaves dates/dateSessions/visibleSessions empty', () => {
    const { result } = renderHook(() => useDanceScheduleFilters([], false, false))

    expect(result.current.dates).toEqual([])
    expect(result.current.dateSessions).toEqual([])
    expect(result.current.visibleSessions).toEqual([])
    // selectedDate falls back to "now" (resolveStoredDate) when there are no dates
    // to pick from — not asserted against an exact value, just that it's a real Date.
    expect(result.current.selectedDate).toBeInstanceOf(Date)
  })

  describe('per-day present level range', () => {
    const narrowDaySession = makeSession(
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T13:00:00.000Z',
      '2026-07-01T14:00:00.000Z',
      located('Ballroom Centre'),
      { levels: ['Plus'] },
    )
    const NARROW_FIRST_SESSIONS = [narrowDaySession, day1Session, day1AdvancedSession, day2Session]

    it('exposes minPresentLevelIndex/maxPresentLevelIndex for the (full-range) default day', () => {
      const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))
      expect(result.current.minPresentLevelIndex).toBe(LEVEL_ORDER.indexOf('SSD'))
      expect(result.current.maxPresentLevelIndex).toBe(LEVEL_ORDER.indexOf('C4'))
    })

    it('clamps the initial minLevelIndex/maxLevelIndex to the earliest date\'s own present range, not the full slots range', () => {
      const { result } = renderHook(() => useDanceScheduleFilters(NARROW_FIRST_SESSIONS, false, false))
      const plusIndex = LEVEL_ORDER.indexOf('Plus')
      expect(result.current.minPresentLevelIndex).toBe(plusIndex)
      expect(result.current.maxPresentLevelIndex).toBe(plusIndex)
      expect(result.current.minLevelIndex).toBe(plusIndex)
      expect(result.current.maxLevelIndex).toBe(plusIndex)
    })

    it('re-scopes minLevelIndex/maxLevelIndex to the new date\'s present range after switching dates', () => {
      const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))

      act(() => result.current.setSelectedDate(new Date('2026-07-03T00:00:00.000Z')))

      const ssdIndex = LEVEL_ORDER.indexOf('SSD')
      expect(result.current.minPresentLevelIndex).toBe(ssdIndex)
      expect(result.current.maxPresentLevelIndex).toBe(ssdIndex)
      expect(result.current.minLevelIndex).toBe(ssdIndex)
      expect(result.current.maxLevelIndex).toBe(ssdIndex)
    })

    it('does not fight a manual in-day level-range narrowing', () => {
      const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))

      act(() => result.current.setLevelRange(LEVEL_ORDER.indexOf('SSD'), LEVEL_ORDER.indexOf('Plus')))

      expect(result.current.minLevelIndex).toBe(LEVEL_ORDER.indexOf('SSD'))
      expect(result.current.maxLevelIndex).toBe(LEVEL_ORDER.indexOf('Plus'))
    })
  })

  describe('merged slot labeling', () => {
    const a2OnlySession = makeSession(
      '2026-07-02T00:00:00.000Z',
      '2026-07-02T13:00:00.000Z',
      '2026-07-02T14:00:00.000Z',
      located('Ballroom Centre'),
      { levels: ['A2'] },
    )
    const a1OnlySession = makeSession(
      '2026-07-03T00:00:00.000Z',
      '2026-07-03T13:00:00.000Z',
      '2026-07-03T14:00:00.000Z',
      located('Ballroom Centre'),
      { levels: ['A1'] },
    )

    it('relabels the merged slot to just "A2" when no A1 session exists anywhere in the event', () => {
      const { result } = renderHook(() => useDanceScheduleFilters([a2OnlySession], true, false))
      expect(result.current.slots.find((slot) => slot.levels.includes('A2'))).toMatchObject({ label: 'A2' })
    })

    it('keeps the "A1/A2" label when both levels occur, even on different dates', () => {
      const { result } = renderHook(() =>
        useDanceScheduleFilters([a1OnlySession, a2OnlySession], true, false),
      )
      expect(result.current.slots.find((slot) => slot.levels.includes('A2'))).toMatchObject({ label: 'A1/A2' })
    })

    it('keeps the "A1/A2" label stable across a date switch, even though each individual date only has one of the two levels', () => {
      const { result } = renderHook(() =>
        useDanceScheduleFilters([a2OnlySession, a1OnlySession], true, false),
      )
      // Starts on the earlier date (A2 only) — event-wide presence still sees A1 too.
      expect(result.current.selectedDate).toEqual(new Date('2026-07-02T00:00:00.000Z'))
      expect(result.current.slots.find((slot) => slot.levels.includes('A2'))).toMatchObject({ label: 'A1/A2' })

      // Switching dates re-scopes minPresentLevelIndex/maxPresentLevelIndex, but the
      // slot LABEL itself is computed event-wide and must not flicker along with it.
      act(() => result.current.setSelectedDate(new Date('2026-07-03T00:00:00.000Z')))
      expect(result.current.slots.find((slot) => slot.levels.includes('A2'))).toMatchObject({ label: 'A1/A2' })
    })
  })

  describe('hasGcaOnSelectedDate', () => {
    it('is true when the selected date has a session with a gca credit, false otherwise', () => {
      const { result } = renderHook(() => useDanceScheduleFilters(ALL_SESSIONS, false, false))
      expect(result.current.hasGcaOnSelectedDate).toBe(true)

      act(() => result.current.setSelectedDate(new Date('2026-07-03T00:00:00.000Z')))
      expect(result.current.hasGcaOnSelectedDate).toBe(false)
    })
  })
})
