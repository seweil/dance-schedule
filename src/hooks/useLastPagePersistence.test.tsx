import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { useLastPagePersistence } from './useLastPagePersistence'

// BASE_PATH is unset in tests, so vite.config.ts's BASE_URL default ("/") applies —
// mirrors the hook's own namespacing (see useLastPagePersistence.ts).
const STORAGE_KEY = 'dance-schedule:last-page:/'

function TestHarness() {
  useLastPagePersistence()
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <div data-testid="pathname">{location.pathname}</div>
      <button type="button" onClick={() => navigate('/')}>
        Go home
      </button>
    </div>
  )
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TestHarness />
    </MemoryRouter>,
  )
}

// localStorage itself is reset globally after every test — see src/test-setup.ts.

describe('useLastPagePersistence', () => {
  it('stays on "/" and saves it when nothing is stored yet', () => {
    renderAt('/')
    expect(screen.getByTestId('pathname')).toHaveTextContent('/')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify('/'))
  })

  it('redirects from "/" to the last saved nav page on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('/installation'))
    renderAt('/')
    expect(screen.getByTestId('pathname')).toHaveTextContent('/installation')
  })

  it('does not redirect when the saved page is not a real nav page (stale/invalid)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('/no-such-page'))
    renderAt('/')
    expect(screen.getByTestId('pathname')).toHaveTextContent('/')
  })

  it('saves a directly-loaded nav page without redirecting away from it', () => {
    renderAt('/faq')
    expect(screen.getByTestId('pathname')).toHaveTextContent('/faq')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify('/faq'))
  })

  it('does not redirect a later, in-session navigation to "/" (e.g. clicking Home)', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, JSON.stringify('/installation'))
    renderAt('/faq')
    expect(screen.getByTestId('pathname')).toHaveTextContent('/faq')

    await user.click(screen.getByRole('button', { name: 'Go home' }))

    expect(screen.getByTestId('pathname')).toHaveTextContent('/')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify('/'))
  })

  it('ignores a last-page saved under a different content set (different base path)', () => {
    // All content sets share one localStorage per origin in production, distinguished
    // only by path prefix — a key saved under a sibling set's own namespace must not
    // leak into this one's cold-launch redirect.
    localStorage.setItem('dance-schedule:last-page:/MotivateToSeattle/', JSON.stringify('/dance-by-level'))
    renderAt('/')
    expect(screen.getByTestId('pathname')).toHaveTextContent('/')
  })
})
