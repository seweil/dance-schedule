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

  it('says "Online" after the build-info line while online', () => {
    setNavigatorOnLine(true)
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    expect(screen.getByText('Online')).toBeInTheDocument()
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })

  it('says "Offline" after the build-info line while offline', () => {
    setNavigatorOnLine(false)
    render(
      <MemoryRouter>
        <BuildInfo />
      </MemoryRouter>,
    )
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.queryByText('Online')).not.toBeInTheDocument()
  })
})
