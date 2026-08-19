import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { usePinnedMediaQuery } from './usePinnedMediaQuery'

function TestHarness({ query }: { query: string }) {
  const matches = usePinnedMediaQuery(query)
  return <div data-testid="matches">{String(matches)}</div>
}

function mockMatchMedia(matches: boolean) {
  const mediaQueryList = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList
  vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQueryList)
  return mediaQueryList
}

describe('usePinnedMediaQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the initial match synchronously at mount', () => {
    mockMatchMedia(true)
    render(<TestHarness query="(max-width: 640px)" />)
    expect(screen.getByTestId('matches')).toHaveTextContent('true')
  })

  it('does not re-subscribe to changes — no addEventListener call, unlike useMediaQuery', () => {
    const mediaQueryList = mockMatchMedia(true)
    render(<TestHarness query="(max-width: 640px)" />)
    expect(mediaQueryList.addEventListener).not.toHaveBeenCalled()
  })

  it('keeps its mounted-at value even if a later matchMedia call for the same query would answer differently', () => {
    mockMatchMedia(false)
    const { rerender } = render(<TestHarness query="(max-width: 640px)" />)
    expect(screen.getByTestId('matches')).toHaveTextContent('false')

    // Simulates "the viewport changed after mount" — a real useMediaQuery
    // would pick this up via its 'change' listener; this hook shouldn't.
    mockMatchMedia(true)
    rerender(<TestHarness query="(max-width: 640px)" />)

    expect(screen.getByTestId('matches')).toHaveTextContent('false')
  })
})
