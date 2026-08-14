import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStandalonePwa } from './pwaDisplayMode'

function stubMatchMediaStandalone(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches } as MediaQueryList)
}

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true })
})

describe('isStandalonePwa', () => {
  it('is true when the display-mode: standalone media query matches', () => {
    stubMatchMediaStandalone(true)

    expect(isStandalonePwa()).toBe(true)
  })

  it('is true when navigator.standalone is true, even if the media query does not match', () => {
    stubMatchMediaStandalone(false)
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })

    expect(isStandalonePwa()).toBe(true)
  })

  it('is false when neither signal indicates standalone', () => {
    stubMatchMediaStandalone(false)

    expect(isStandalonePwa()).toBe(false)
  })
})
