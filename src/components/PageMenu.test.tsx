import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PageMenu } from './PageMenu'
import { TextSizeProvider } from './TextSizeProvider'

// The toggle is only visible below the CSS module's mobile breakpoint. Real CSS is
// loaded in jsdom (vitest.config.ts sets css: true), and per the accname spec a
// display:none element's aria-label doesn't resolve to an accessible name at all —
// so without this mock, the toggle would be unqueryable by role/name in every test.
// These tests cover ARIA/interaction state, not the responsive CSS switch itself
// (that's covered in Playwright instead).
vi.mock('./PageMenu.module.css', () => ({
  default: { nav: 'nav', toggle: 'toggle', list: 'list', link: 'link' } satisfies Record<
    string,
    string
  >,
}))

function getToggle() {
  return screen.getByRole('button', { name: /menu/i })
}

function renderPageMenu(initialPath = '/installation') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TextSizeProvider>
        <PageMenu />
      </TextSizeProvider>
    </MemoryRouter>,
  )
}

describe('PageMenu', () => {
  it('renders a toggle button that controls the link list', () => {
    renderPageMenu()
    const toggle = getToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', screen.getByRole('list').id)
  })

  it('opens and closes the menu when the toggle is clicked', async () => {
    const user = userEvent.setup()
    renderPageMenu()
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the menu when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderPageMenu()
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it("marks the current page's link with aria-current, and no other", () => {
    renderPageMenu('/installation')
    expect(screen.getByRole('link', { name: /installation/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /features/i })).not.toHaveAttribute('aria-current')
  })

  it('closes the menu when a text-size option is selected, same as clicking a page link would', async () => {
    const user = userEvent.setup()
    renderPageMenu()
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: 'Large' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the menu when clicking outside the nav', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/installation']}>
        <TextSizeProvider>
          <PageMenu />
          <button type="button">Outside</button>
        </TextSizeProvider>
      </MemoryRouter>,
    )
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: /outside/i }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
