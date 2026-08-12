import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRotateBannerDismissed } from './useRotateBannerDismissed'

const STORAGE_KEY = 'dance-schedule:rotate-banner-dismissed'

function TestHarness({ isPortraitPhone }: { isPortraitPhone: boolean }) {
  const { dismissed, dismiss } = useRotateBannerDismissed(isPortraitPhone)
  return (
    <div>
      <div data-testid="dismissed">{String(dismissed)}</div>
      <button type="button" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  )
}

describe('useRotateBannerDismissed', () => {
  it('is not dismissed by default', () => {
    render(<TestHarness isPortraitPhone />)
    expect(screen.getByTestId('dismissed')).toHaveTextContent('false')
  })

  it('dismissing marks it dismissed and persists that', async () => {
    const user = userEvent.setup()
    render(<TestHarness isPortraitPhone />)

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.getByTestId('dismissed')).toHaveTextContent('true')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(true))
  })

  it('stays dismissed on a fresh mount while still portrait (e.g. navigating between schedule pages)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(true))
    render(<TestHarness isPortraitPhone />)
    expect(screen.getByTestId('dismissed')).toHaveTextContent('true')
  })

  it('does not itself clear storage on leaving portrait — that is useResetRotateBannerOnLandscape.ts\'s job', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TestHarness isPortraitPhone />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(true))

    rerender(<TestHarness isPortraitPhone={false} />)

    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(true))
  })

  it('resyncs from storage when re-entering portrait, picking up a clear made elsewhere', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(true))
    const { rerender } = render(<TestHarness isPortraitPhone={false} />)
    // Simulate useResetRotateBannerOnLandscape.ts having cleared the stored
    // dismissal while this page wasn't mounted at all (e.g. the user rotated
    // while on some other, non-schedule page).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(false))

    rerender(<TestHarness isPortraitPhone />)

    expect(screen.getByTestId('dismissed')).toHaveTextContent('false')
  })
})
