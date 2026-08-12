import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RotateDeviceBanner } from './RotateDeviceBanner'

describe('RotateDeviceBanner', () => {
  // Only the "matches" test below mocks matchMedia — restoring afterward keeps
  // it from leaking into the other test, which relies on jsdom's default
  // "no match" stub (test-setup.ts) for the normal case.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when not on a portrait phone', () => {
    const { container } = render(<RotateDeviceBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('suggests rotating when the portrait-phone query matches', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)

    render(<RotateDeviceBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(/rotate your phone to landscape/i)
  })
})
