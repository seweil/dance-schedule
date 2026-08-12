import { describe, expect, it } from 'vitest'
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

  it('marks only the Dance Schedule link as emphasized', () => {
    renderNav('/installation')
    expect(screen.getByRole('link', { name: /^dance schedule$/i })).toHaveAttribute(
      'data-emphasized',
      'true',
    )
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('data-emphasized', 'false')
    expect(screen.getByRole('link', { name: /room schedule/i })).toHaveAttribute(
      'data-emphasized',
      'false',
    )
  })

  // Always a dropdown menu item, in every orientation — no more always-visible
  // row (see Nav.tsx's own comment for why: it read as "buttons sitting on top
  // of every content page" rather than a menu item, inconsistent with the one
  // other place this control shows up, PageMenu.tsx's mobile dropdown).
  it('renders a "Text size" toggle, closed by default, with no size buttons visible yet', () => {
    renderNav('/installation')
    expect(screen.getByRole('button', { name: 'Text size' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('button', { name: 'Normal' })).not.toBeInTheDocument()
  })

  it('opens the dropdown when the toggle is clicked', async () => {
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
