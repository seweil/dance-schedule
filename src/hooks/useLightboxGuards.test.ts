import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLightboxGuards } from './useLightboxGuards'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

function gestureStart() {
  const event = new Event('gesturestart', { cancelable: true })
  document.dispatchEvent(event)
  return event
}

describe('useLightboxGuards', () => {
  afterEach(() => {
    setVisibility('visible')
  })

  it('closes the lightbox when the app goes to the background', () => {
    const close = vi.fn()
    renderHook(() => useLightboxGuards(true, close))
    setVisibility('visible')
    expect(close).not.toHaveBeenCalled()
    setVisibility('hidden')
    expect(close).toHaveBeenCalledOnce()
  })

  it("cancels iOS's page pinch-zoom while open", () => {
    renderHook(() => useLightboxGuards(true, () => {}))
    expect(gestureStart().defaultPrevented).toBe(true)
  })

  it('does nothing while closed, or after closing', () => {
    const close = vi.fn()
    const { rerender } = renderHook(({ isOpen }) => useLightboxGuards(isOpen, close), {
      initialProps: { isOpen: false },
    })
    setVisibility('hidden')
    expect(gestureStart().defaultPrevented).toBe(false)

    rerender({ isOpen: true })
    rerender({ isOpen: false })
    setVisibility('hidden')
    expect(gestureStart().defaultPrevented).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })
})
