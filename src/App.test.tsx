import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('renders the home page generated from content/index.md', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /welcome to montreal mix/i })).toBeInTheDocument()
  })

  it('renders the nav generated from content/ file structure', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: /site navigation/i })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /home/i })).toBeInTheDocument()
    // The home page's own body text also links to Installation, so this is
    // scoped to the nav rather than asserting there's only one such link on
    // the whole page.
    expect(within(nav).getByRole('link', { name: /installation/i })).toBeInTheDocument()
  })

  it('redirects an unknown path to home instead of rendering blank', () => {
    window.history.pushState({}, '', '/no-such-page')
    render(<App />)
    expect(screen.getByRole('heading', { name: /welcome to montreal mix/i })).toBeInTheDocument()
  })
})
