import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsElementVisible } from './useIsElementVisible'

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void

let observedCallback: ObserverCallback | null = null
let observeSpy: ReturnType<typeof vi.fn>
let disconnectSpy: ReturnType<typeof vi.fn>

class MockIntersectionObserver {
  observe = observeSpy
  unobserve = vi.fn()
  disconnect = disconnectSpy

  constructor(callback: ObserverCallback) {
    observedCallback = callback
  }
}

beforeEach(() => {
  observedCallback = null
  observeSpy = vi.fn()
  disconnectSpy = vi.fn()
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  document.body.innerHTML = '<nav></nav>'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIsElementVisible', () => {
  it('starts visible, before the observer has reported anything', () => {
    const { result } = renderHook(() => useIsElementVisible('nav'))
    expect(result.current).toBe(true)
    expect(observeSpy).toHaveBeenCalledWith(document.querySelector('nav'))
  })

  it('becomes false once the element stops intersecting the viewport', () => {
    const { result } = renderHook(() => useIsElementVisible('nav'))

    act(() => {
      observedCallback?.([{ isIntersecting: false }])
    })

    expect(result.current).toBe(false)
  })

  it('becomes true again once the element re-enters the viewport', () => {
    const { result } = renderHook(() => useIsElementVisible('nav'))

    act(() => {
      observedCallback?.([{ isIntersecting: false }])
    })
    act(() => {
      observedCallback?.([{ isIntersecting: true }])
    })

    expect(result.current).toBe(true)
  })

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderHook(() => useIsElementVisible('nav'))
    unmount()
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })

  it('stays visible and never observes when no element matches the selector', () => {
    document.body.innerHTML = ''
    const { result } = renderHook(() => useIsElementVisible('nav'))
    expect(result.current).toBe(true)
    expect(observeSpy).not.toHaveBeenCalled()
  })
})
