import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PageHeader } from './PageHeader'
import { TextSizeProvider } from './TextSizeProvider'

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
  // Only the wide-landscape test below mocks matchMedia — restoring afterward
  // keeps that mock from leaking into the other tests in this file, which rely
  // on jsdom's default "no match" stub (test-setup.ts) for the normal case.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the title as an h1, alongside the mobile menu toggle', () => {
    render(
      <MemoryRouter>
        <TextSizeProvider>
          <PageHeader title="Dance Schedule" />
        </TextSizeProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Dance Schedule' })).toBeInTheDocument()
    // PageMenu's toggle is present in the DOM regardless of viewport (visibility is
    // CSS-only) — see PageMenu.test.tsx for its own behavior coverage.
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument()
  })

  it('visually hides the title (but keeps it as an accessible heading) when Nav\'s full tab bar shows in landscape', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)

    render(
      <MemoryRouter>
        <TextSizeProvider>
          <PageHeader title="Dance Schedule" />
        </TextSizeProvider>
      </MemoryRouter>,
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'Dance Schedule' })
    expect(heading.className).toMatch(/visuallyHidden/)
  })

  it('accepts a non-string ReactNode title (e.g. built from JSX, not literal text)', () => {
    render(
      <MemoryRouter>
        <TextSizeProvider>
          <PageHeader
            title={
              <>
                Dance Schedule — Debug (<em>test</em>)
              </>
            }
          />
        </TextSizeProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Dance Schedule — Debug (test)',
    )
  })
})
