import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetHintsLink } from './ResetHintsLink'

describe('ResetHintsLink', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // A blunt localStorage.clear() (via the same clearAllStorage()
  // ClearStorageAction.tsx uses — see this component's own comment on why
  // the two are meant to have identical "reset everything" semantics now),
  // not a hand-picked list of hint-related keys — asserting against an
  // unrelated key alongside the hint ones proves that, the same way
  // ClearStorageAction.test.tsx's own "some-key" assertion does.
  it('clears all of localStorage, then reloads', async () => {
    localStorage.setItem('dance-schedule:launch-count', JSON.stringify(16))
    localStorage.setItem('dance-schedule:hint-dismissed:kebab-menu', JSON.stringify(true))
    localStorage.setItem('dance-schedule:hint-dismissed:level-slider', JSON.stringify(true))
    localStorage.setItem('dance-schedule:hint-dismissed:text-size', JSON.stringify(true))
    localStorage.setItem('dance-schedule:text-size', JSON.stringify('x-large'))
    localStorage.setItem('some-unrelated-key', 'some-value')
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location)
    const user = userEvent.setup()

    render(<ResetHintsLink />)
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(localStorage.length).toBe(0)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
