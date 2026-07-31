import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Nav } from './Nav'

function renderNav(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Nav />
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
})
