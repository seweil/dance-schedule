import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWallClockNow } from './useWallClockNow'

// Local-field constructors throughout, so expectations hold in any runner TZ —
// the hook's output is that same local wall-clock time re-encoded as UTC.
function localTime(hours: number, minutes: number, seconds = 0): Date {
  return new Date(2026, 6, 2, hours, minutes, seconds)
}

function wallIso(hours: number, minutes: number, seconds = 0): string {
  return new Date(Date.UTC(2026, 6, 2, hours, minutes, seconds)).toISOString()
}

describe('useWallClockNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current local time encoded as wall-clock UTC', () => {
    vi.setSystemTime(localTime(14, 5, 30))
    const { result } = renderHook(() => useWallClockNow())
    expect(result.current.toISOString()).toBe(wallIso(14, 5, 30))
  })

  it('updates on the next minute boundary, then every minute after', () => {
    vi.setSystemTime(localTime(14, 5, 30))
    const { result } = renderHook(() => useWallClockNow())

    act(() => {
      vi.advanceTimersByTime(29_000)
    })
    expect(result.current.toISOString()).toBe(wallIso(14, 5, 30))

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.toISOString()).toBe(wallIso(14, 6))

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.toISOString()).toBe(wallIso(14, 7))
  })

  it('refreshes immediately when the page becomes visible again', () => {
    vi.setSystemTime(localTime(14, 5, 30))
    const { result } = renderHook(() => useWallClockNow())

    // Simulates a backgrounded tab whose timers never fired.
    vi.setSystemTime(localTime(15, 40, 10))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.toISOString()).toBe(wallIso(15, 40, 10))
  })

  it('stops updating after unmount', () => {
    vi.setSystemTime(localTime(14, 5, 30))
    const { unmount } = renderHook(() => useWallClockNow())
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
