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

// The banner is also suppressed while either onboarding hint is showing (see
// RotateDeviceBanner.tsx's own comment) — on a fresh device (default
// localStorage, per test-setup.ts's own afterEach clear) BOTH default to
// showing, so any test exercising the banner's OWN rotate-suggestion
// behavior needs both cleared first to isolate that from this separate
// suppression concern (covered in its own tests below).
function dismissBothHints() {
  localStorage.setItem('dance-schedule:hint-dismissed:kebab-menu', JSON.stringify(true))
  localStorage.setItem('dance-schedule:hint-dismissed:level-slider', JSON.stringify(true))
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
    dismissBothHints()
    mockPortraitPhone()

    render(<RotateDeviceBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(/rotate your phone to landscape/i)
  })

  it('hides immediately when the close button is clicked', () => {
    dismissBothHints()
    mockPortraitPhone()
    const { container } = render(<RotateDeviceBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(container).toBeEmptyDOMElement()
  })

  it('stays dismissed across a remount (e.g. navigating between the three schedule pages) while still portrait', () => {
    dismissBothHints()
    mockPortraitPhone()
    const { container, unmount } = render(<RotateDeviceBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(container).toBeEmptyDOMElement()
    unmount()

    const { container: remounted } = render(<RotateDeviceBanner />)

    expect(remounted).toBeEmptyDOMElement()
  })

  it('renders nothing while an onboarding hint is showing, even though it would otherwise (a fresh, undismissed device)', () => {
    mockPortraitPhone()
    const { container } = render(<RotateDeviceBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders once BOTH the kebab-menu and level-slider hints have been dismissed elsewhere', () => {
    dismissBothHints()
    mockPortraitPhone()

    render(<RotateDeviceBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(/rotate your phone to landscape/i)
  })

  it('stays suppressed if only ONE of the two hints has been dismissed', () => {
    // level-slider dismissed, but kebab-menu (default state) has not — both
    // must clear before this renders.
    localStorage.setItem('dance-schedule:hint-dismissed:level-slider', JSON.stringify(true))
    mockPortraitPhone()

    render(<RotateDeviceBanner />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
