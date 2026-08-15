import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetHintsLink } from './ResetHintsLink'

describe('ResetHintsLink', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears the launch count and both hints’ dismissed flags, then reloads', async () => {
    localStorage.setItem('dance-schedule:launch-count', JSON.stringify(16))
    localStorage.setItem('dance-schedule:hint-dismissed:kebab-menu', JSON.stringify(true))
    localStorage.setItem('dance-schedule:hint-dismissed:level-slider', JSON.stringify(true))
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location)
    const user = userEvent.setup()

    render(<ResetHintsLink />)
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(localStorage.getItem('dance-schedule:launch-count')).toBeNull()
    expect(localStorage.getItem('dance-schedule:hint-dismissed:kebab-menu')).toBeNull()
    expect(localStorage.getItem('dance-schedule:hint-dismissed:level-slider')).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
