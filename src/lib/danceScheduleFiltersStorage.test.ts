import { describe, expect, it } from 'vitest'
import {
  loadStoredDanceScheduleFilters,
  resolveStoredDate,
  resolveStoredLevelRange,
  resolveStoredShowGca,
  saveDanceScheduleFilters,
} from './danceScheduleFiltersStorage'

// localStorage itself is reset globally after every test — see src/test-setup.ts.

describe('loadStoredDanceScheduleFilters / saveDanceScheduleFilters', () => {
  it('returns an empty object when nothing has been saved', () => {
    expect(loadStoredDanceScheduleFilters()).toEqual({})
  })

  it('round-trips whatever was saved', () => {
    saveDanceScheduleFilters({
      selectedDateISO: '2026-07-04T00:00:00.000Z',
      minLevelIndex: 1,
      maxLevelIndex: 5,
      showGca: false,
    })
    expect(loadStoredDanceScheduleFilters()).toEqual({
      selectedDateISO: '2026-07-04T00:00:00.000Z',
      minLevelIndex: 1,
      maxLevelIndex: 5,
      showGca: false,
    })
  })
})

describe('resolveStoredDate', () => {
  const dates = [new Date('2026-07-02T00:00:00.000Z'), new Date('2026-07-04T00:00:00.000Z')]

  it('returns the matching date when the stored ISO string matches one of the given dates', () => {
    const result = resolveStoredDate({ selectedDateISO: '2026-07-04T00:00:00.000Z' }, dates)
    expect(result.getTime()).toBe(dates[1]!.getTime())
  })

  it('falls back to the first date when nothing is stored', () => {
    expect(resolveStoredDate({}, dates).getTime()).toBe(dates[0]!.getTime())
  })

  it('falls back to the first date when the stored ISO string is malformed', () => {
    expect(resolveStoredDate({ selectedDateISO: 'not a date' }, dates).getTime()).toBe(dates[0]!.getTime())
  })

  it('falls back to the first date when the stored date no longer matches any current date', () => {
    expect(resolveStoredDate({ selectedDateISO: '2020-01-01T00:00:00.000Z' }, dates).getTime()).toBe(
      dates[0]!.getTime(),
    )
  })

  it('falls back to the current time when there are no dates at all', () => {
    const before = Date.now()
    const result = resolveStoredDate({}, [])
    const after = Date.now()
    expect(result.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('resolveStoredLevelRange', () => {
  it('returns the stored range when it is valid for the current slot count', () => {
    expect(resolveStoredLevelRange({ minLevelIndex: 2, maxLevelIndex: 7 }, 10)).toEqual({
      minLevelIndex: 2,
      maxLevelIndex: 7,
    })
  })

  it('falls back to the full range when nothing is stored', () => {
    expect(resolveStoredLevelRange({}, 10)).toEqual({ minLevelIndex: 0, maxLevelIndex: 9 })
  })

  it('falls back to the full range when the stored max index is out of bounds for a shrunk slot count', () => {
    // e.g. combineA1A2 turned on between visits, dropping slot count from 10 to 9.
    expect(resolveStoredLevelRange({ minLevelIndex: 0, maxLevelIndex: 9 }, 9)).toEqual({
      minLevelIndex: 0,
      maxLevelIndex: 8,
    })
  })

  it('falls back to the full range when the stored range is inverted', () => {
    expect(resolveStoredLevelRange({ minLevelIndex: 7, maxLevelIndex: 2 }, 10)).toEqual({
      minLevelIndex: 0,
      maxLevelIndex: 9,
    })
  })

  it('falls back to the full range when the stored indices are not integers', () => {
    expect(resolveStoredLevelRange({ minLevelIndex: 1.5, maxLevelIndex: 7 }, 10)).toEqual({
      minLevelIndex: 0,
      maxLevelIndex: 9,
    })
  })
})

describe('resolveStoredShowGca', () => {
  it('returns the stored boolean when present', () => {
    expect(resolveStoredShowGca({ showGca: false })).toBe(false)
    expect(resolveStoredShowGca({ showGca: true })).toBe(true)
  })

  it('defaults to true when nothing is stored', () => {
    expect(resolveStoredShowGca({})).toBe(true)
  })
})
