import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  // findByRole (async, auto-retries), not getByRole — every routed page, home
  // included, is a React.lazy-loaded chunk (vite-plugin-pages' react resolver code-
  // splits every route; see vite.config.ts's Pages() call), so its content isn't
  // necessarily painted on the same tick render() returns, particularly for a page
  // whose module Vite hasn't already transformed/cached earlier in this same test
  // run — confirmed live: a synchronous getByRole here was already relying on
  // incidental cache-warmth from other tests, not a real guarantee.
  it('renders the home page generated from content/home.md', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /welcome to montreal mix/i })).toBeInTheDocument()
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

  it('redirects an unknown path to home instead of rendering blank', async () => {
    window.history.pushState({}, '', '/no-such-page')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /welcome to montreal mix/i })).toBeInTheDocument()
  })
})
