import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Nav } from './Nav'
import { TextSizeProvider } from './TextSizeProvider'

function renderNav(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TextSizeProvider>
        <Nav />
      </TextSizeProvider>
    </MemoryRouter>,
  )
}

// jsdom's default matchMedia stub (test-setup.ts) always reports "no match" —
// used by every test in this file that doesn't call this to cover the
// portrait/desktop default (always-visible Text size row).
function mockLandscape() {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
}

describe('Nav', () => {
  it("marks the current page's link with aria-current, and no other", () => {
    renderNav('/installation')
    expect(screen.getByRole('link', { name: /installation/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /features/i })).not.toHaveAttribute('aria-current')
  })

  it('does not mark Home as current on every other page (exact-match only)', () => {
    renderNav('/faq')
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /faq/i })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the Text size buttons directly, with no toggle to click, outside landscape', () => {
    renderNav('/installation')
    expect(screen.getByRole('button', { name: 'Normal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Text size' })).not.toBeInTheDocument()
  })

  describe('in landscape', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('renders a "Text size" toggle, closed by default', () => {
      mockLandscape()
      renderNav('/installation')
      expect(screen.getByRole('button', { name: 'Text size' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })

    it('opens the dropdown when the toggle is clicked', async () => {
      mockLandscape()
      const user = userEvent.setup()
      renderNav('/installation')

      await user.click(screen.getByRole('button', { name: 'Text size' }))

      expect(screen.getByRole('button', { name: 'Text size' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      expect(screen.getByRole('button', { name: 'Normal' })).toBeInTheDocument()
    })

    it('closes the dropdown when a size is selected', async () => {
      mockLandscape()
      const user = userEvent.setup()
      renderNav('/installation')

      await user.click(screen.getByRole('button', { name: 'Text size' }))
      await user.click(screen.getByRole('button', { name: 'Large' }))

      expect(screen.getByRole('button', { name: 'Text size' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })
  })
})
