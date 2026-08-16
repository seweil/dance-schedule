import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RotateDeviceBanner } from './RotateDeviceBanner'

function mockPortraitPhone() {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
}

describe('RotateDeviceBanner', () => {
  // Only tests that call mockPortraitPhone() override matchMedia — restoring
  // afterward keeps that from leaking into the other tests, which rely on
  // jsdom's default "no match" stub (test-setup.ts) for the normal case.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when not on a portrait phone', () => {
    const { container } = render(<RotateDeviceBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('suggests rotating when the portrait-phone query matches', () => {
    mockPortraitPhone()

    render(<RotateDeviceBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(/rotate your phone to landscape/i)
  })

  it('hides immediately when the close button is clicked', () => {
    mockPortraitPhone()
    const { container } = render(<RotateDeviceBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(container).toBeEmptyDOMElement()
  })

  it('stays dismissed across a remount (e.g. navigating between the three schedule pages) while still portrait', () => {
    mockPortraitPhone()
    const { container, unmount } = render(<RotateDeviceBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(container).toBeEmptyDOMElement()
    unmount()

    const { container: remounted } = render(<RotateDeviceBanner />)

    expect(remounted).toBeEmptyDOMElement()
  })
})
