import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

// navigator.onLine is a read-only browser property — jsdom lets it be
// overridden via defineProperty, the standard way tests simulate connectivity
// changes since there's no real network to toggle.
function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('useOnlineStatus', () => {
  afterEach(() => {
    setNavigatorOnLine(true)
  })

  it('reflects navigator.onLine as its initial value', () => {
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('flips to false on a window "offline" event, and back on "online"', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
