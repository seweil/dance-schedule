import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScrollToTopButton } from './ScrollToTopButton'

vi.mock('./ScrollToTopButton.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

describe('ScrollToTopButton', () => {
  it('renders a labeled button, hidden by default (nav presumed visible on mount)', () => {
    render(<ScrollToTopButton />)
    expect(screen.getByRole('button', { name: /scroll to top/i })).toHaveAttribute(
      'data-visible',
      'false',
    )
  })

  it('scrolls smoothly to the top when clicked, by default', async () => {
    const scrollToSpy = vi.fn()
    window.scrollTo = scrollToSpy
    render(<ScrollToTopButton />)

    await userEvent.click(screen.getByRole('button', { name: /scroll to top/i }))

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('scrolls without animation when the user prefers reduced motion', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList)
    const scrollToSpy = vi.fn()
    window.scrollTo = scrollToSpy
    render(<ScrollToTopButton />)

    await userEvent.click(screen.getByRole('button', { name: /scroll to top/i }))

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})
