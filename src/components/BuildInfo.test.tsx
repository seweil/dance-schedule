import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BuildInfo } from './BuildInfo'

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('BuildInfo', () => {
  afterEach(() => {
    setNavigatorOnLine(true)
  })

  it('renders build info, online status, install status, and "All events" as a single fine-print line', () => {
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    // One paragraph, not build info and online status as two separate lines
    // (an earlier version) — per direct product decision, this whole footer
    // reads as one fine-print string.
    const paragraphs = screen.getAllByText(/Build/, { selector: 'p' })
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]).toHaveTextContent(/^Build \S+ at .+ · Online · Browser · All events$/)
  })

  it('says "Online" while online', () => {
    setNavigatorOnLine(true)
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Build/, { selector: 'p' })).toHaveTextContent('Online')
  })

  it('says "Offline" while offline', () => {
    setNavigatorOnLine(false)
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Build/, { selector: 'p' })).toHaveTextContent('Offline')
  })

  it('says "Browser" when not running installed', () => {
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Build/, { selector: 'p' })).toHaveTextContent('Browser')
  })

  it('says "Installed" when running standalone', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValueOnce({ matches: true } as MediaQueryList)
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Build/, { selector: 'p' })).toHaveTextContent('Installed')
  })

  it('folds extraLinks in before "All events", still on the one line', () => {
    render(
      <MemoryRouter>
        <BuildInfo extraLinks={<a href="/raw">Raw data</a>} />
      </MemoryRouter>,
    )
    const paragraph = screen.getByText(/Build/, { selector: 'p' })
    expect(paragraph).toHaveTextContent(/Online · Browser · Raw data · All events$/)
  })

  it('folds extraLinksAfter in after "All events", still on the one line', () => {
    render(
      <MemoryRouter>
        <BuildInfo extraLinksAfter={<a href="/reset">Reset</a>} />
      </MemoryRouter>,
    )
    const paragraph = screen.getByText(/Build/, { selector: 'p' })
    expect(paragraph).toHaveTextContent(/All events · Reset$/)
  })
})
