import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ClearStorageAction } from './ClearStorageAction'
import { TextSizeProvider } from './TextSizeProvider'

function renderAction() {
  return render(
    <MemoryRouter>
      <TextSizeProvider>
        <ClearStorageAction />
      </TextSizeProvider>
    </MemoryRouter>,
  )
}

describe('ClearStorageAction', () => {
  it('does not clear localStorage just from being rendered', () => {
    localStorage.setItem('some-key', 'some-value')
    renderAction()
    expect(localStorage.getItem('some-key')).toBe('some-value')
  })

  it('clears localStorage and shows a confirmation once the button is clicked', async () => {
    const user = userEvent.setup()
    localStorage.setItem('some-key', 'some-value')
    renderAction()

    await user.click(screen.getByRole('button', { name: /clear saved settings/i }))

    expect(localStorage.getItem('some-key')).toBeNull()
    expect(screen.getByText(/have all been cleared/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/')
  })
})
