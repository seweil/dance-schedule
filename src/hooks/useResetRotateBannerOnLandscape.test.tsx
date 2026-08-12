import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useResetRotateBannerOnLandscape } from './useResetRotateBannerOnLandscape'

const STORAGE_KEY = 'dance-schedule:rotate-banner-dismissed'

// jsdom's matchMedia (test-setup.ts's own stub) always reports "no match" and
// never fires 'change' — this mocks a mutable MediaQueryList-alike so a test
// can flip `matches` and invoke the registered listener itself, simulating a
// real rotation.
function mockMatchMedia(initialMatches: boolean) {
  let listener: (() => void) | undefined
  const mediaQueryList = {
    matches: initialMatches,
    addEventListener: (_event: string, callback: () => void) => {
      listener = callback
    },
    removeEventListener: () => {},
  }
  vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQueryList as unknown as MediaQueryList)
  return {
    setMatches(value: boolean) {
      mediaQueryList.matches = value
      listener?.()
    },
  }
}

describe('useResetRotateBannerOnLandscape', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves a dismissal untouched while still on a portrait phone', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(true))
    mockMatchMedia(true)

    renderHook(() => useResetRotateBannerOnLandscape())

    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(true))
  })

  it('clears a stuck dismissal once the phone leaves portrait', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(true))
    const media = mockMatchMedia(true)
    renderHook(() => useResetRotateBannerOnLandscape())

    act(() => {
      media.setMatches(false)
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(false))
  })

  it('writes nothing when there was no dismissal to clear', () => {
    const media = mockMatchMedia(true)
    renderHook(() => useResetRotateBannerOnLandscape())

    act(() => {
      media.setMatches(false)
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
