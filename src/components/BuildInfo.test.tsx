import { afterEach, describe, expect, it } from 'vitest'
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

  it('does not render an offline notice while online', () => {
    setNavigatorOnLine(true)
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()
  })

  it('renders an offline notice, after the build-info line, while offline', () => {
    setNavigatorOnLine(false)
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })
})
