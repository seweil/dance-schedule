import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useNudgeScrollOnOrientationChange } from './useNudgeScrollOnOrientationChange'

function TestHarness() {
  useNudgeScrollOnOrientationChange()
  return null
}

describe('useNudgeScrollOnOrientationChange', () => {
  // vi.spyOn reuses an already-spied method's mock (and its recorded call
  // history) rather than creating a fresh one each time — restoring after
  // every test keeps one test's scrollTo calls from leaking into the next.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing until an orientationchange event fires', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<TestHarness />)

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('nudges the scroll position by 1px and immediately back on orientationchange', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { value: 42, configurable: true })
    Object.defineProperty(window, 'scrollX', { value: 0, configurable: true })
    render(<TestHarness />)

    window.dispatchEvent(new Event('orientationchange'))

    expect(scrollTo).toHaveBeenNthCalledWith(1, 0, 43)
    expect(scrollTo).toHaveBeenNthCalledWith(2, 0, 42)
  })

  it('removes the listener on unmount', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { unmount } = render(<TestHarness />)
    unmount()

    window.dispatchEvent(new Event('orientationchange'))

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
