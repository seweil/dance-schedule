import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Nav } from './Nav'

// The toggle is only visible below the CSS module's mobile breakpoint. Real CSS is
// loaded in jsdom (vitest.config.ts sets css: true), and per the accname spec a
// display:none element's aria-label doesn't resolve to an accessible name at all —
// so without this mock, the toggle would be unqueryable by role/name in every test.
// These tests cover ARIA/interaction state, not the responsive CSS switch itself
// (that's covered in Playwright instead).
vi.mock('./Nav.module.css', () => ({
  default: { nav: 'nav', toggle: 'toggle', list: 'list' } satisfies Record<string, string>,
}))

function getToggle() {
  return screen.getByRole('button', { name: /menu/i })
}

function renderNav() {
  return render(
    <MemoryRouter initialEntries={['/installation']}>
      <Nav />
    </MemoryRouter>,
  )
}

describe('Nav', () => {
  it('renders a toggle button that controls the link list', () => {
    renderNav()
    const toggle = getToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', screen.getByRole('list').id)
  })

  it('opens and closes the menu when the toggle is clicked', async () => {
    const user = userEvent.setup()
    renderNav()
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the menu when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderNav()
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the menu after navigating to a link', async () => {
    const user = userEvent.setup()
    renderNav()
    const toggle = getToggle()

    await user.click(toggle)
    await user.click(screen.getByRole('link', { name: /home/i }))

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the menu when clicking outside the nav', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/installation']}>
        <Nav />
        <button type="button">Outside</button>
      </MemoryRouter>,
    )
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: /outside/i }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
