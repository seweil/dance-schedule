import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PageHeader } from './PageHeader'

// PageMenu's toggle is display:none outside its mobile CSS breakpoint, and a
// hidden element's aria-label doesn't resolve to an accessible name at all — see
// PageMenu.test.tsx's identical mock for the full rationale. This file only cares
// that PageHeader renders PageMenu at all, not its own behavior.
vi.mock('./PageMenu.module.css', () => ({
  default: { nav: 'nav', toggle: 'toggle', list: 'list', link: 'link' } satisfies Record<
    string,
    string
  >,
}))

describe('PageHeader', () => {
  it('renders the title as an h1, alongside the mobile menu toggle', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Dance Schedule" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Dance Schedule' })).toBeInTheDocument()
    // PageMenu's toggle is present in the DOM regardless of viewport (visibility is
    // CSS-only) — see PageMenu.test.tsx for its own behavior coverage.
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument()
  })

  it('accepts a non-string ReactNode title (e.g. built from JSX, not literal text)', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title={
            <>
              Dance Schedule — Debug (<em>test</em>)
            </>
          }
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Dance Schedule — Debug (test)',
    )
  })
})
