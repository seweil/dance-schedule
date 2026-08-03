import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useTextSizePreference, type TextSize } from './useTextSizePreference'

const STORAGE_KEY = 'dance-schedule:text-size'

function TestHarness() {
  const { textSize, setTextSize } = useTextSizePreference()
  return (
    <div>
      <div data-testid="text-size">{textSize}</div>
      {(['normal', 'large', 'x-large'] as const satisfies readonly TextSize[]).map((size) => (
        <button key={size} type="button" onClick={() => setTextSize(size)}>
          {size}
        </button>
      ))}
    </div>
  )
}

// localStorage and document.documentElement's own attributes are both reset
// globally after every test — see src/test-setup.ts for the former; the latter
// isn't explicitly reset, but jsdom gives every test file a fresh document, and
// afterEach(cleanup) unmounts the harness, so no attribute a previous test set
// survives into the next one.

describe('useTextSizePreference', () => {
  it('defaults to "normal" with no data-text-size attribute when nothing is stored', () => {
    render(<TestHarness />)
    expect(screen.getByTestId('text-size')).toHaveTextContent('normal')
    expect(document.documentElement.dataset.textSize).toBeUndefined()
  })

  it('reads a validly stored size on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('large'))
    render(<TestHarness />)
    expect(screen.getByTestId('text-size')).toHaveTextContent('large')
    expect(document.documentElement.dataset.textSize).toBe('large')
  })

  it('falls back to "normal" when the stored value is not a valid size', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('huge'))
    render(<TestHarness />)
    expect(screen.getByTestId('text-size')).toHaveTextContent('normal')
  })

  it('falls back to "normal" when the stored value is malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    render(<TestHarness />)
    expect(screen.getByTestId('text-size')).toHaveTextContent('normal')
  })

  it('sets the data-text-size attribute and persists on change to "large"', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: 'large' }))

    expect(screen.getByTestId('text-size')).toHaveTextContent('large')
    expect(document.documentElement.dataset.textSize).toBe('large')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify('large'))
  })

  it('sets the data-text-size attribute and persists on change to "x-large"', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: 'x-large' }))

    expect(screen.getByTestId('text-size')).toHaveTextContent('x-large')
    expect(document.documentElement.dataset.textSize).toBe('x-large')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify('x-large'))
  })

  it('removes the data-text-size attribute when changed back to "normal"', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, JSON.stringify('x-large'))
    render(<TestHarness />)
    expect(document.documentElement.dataset.textSize).toBe('x-large')

    await user.click(screen.getByRole('button', { name: 'normal' }))

    expect(screen.getByTestId('text-size')).toHaveTextContent('normal')
    expect(document.documentElement.dataset.textSize).toBeUndefined()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify('normal'))
  })
})
