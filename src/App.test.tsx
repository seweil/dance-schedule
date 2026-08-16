import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

  // Regression test for a bug where a content page's absolute-path markdown link
  // (e.g. "[Installation](/installation)" in home.md) compiled to a plain <a
  // href="/installation">, which is a real browser navigation to the site root —
  // only correct for the default content set (mirrored unprefixed at "/"), and
  // wrong for every other set published under its own "/<set>/" prefix (see
  // App.tsx's MdxA). A plain <a> click in jsdom logs a "Not implemented:
  // navigation" error and leaves the URL/route unchanged, so asserting the route
  // *does* change confirms this went through react-router's Link instead.
  it('follows a content page link via client-side routing, not a full page navigation', async () => {
    render(<App />)
    // Scoped past the nav (which has its own "Installation" link) to the one
    // rendered from home.md's markdown body.
    await screen.findByRole('heading', { name: /welcome to montreal mix/i })
    const links = await screen.findAllByRole('link', { name: /installation/i })
    const contentLink = links.find((el) => el.closest('nav') === null)
    if (!contentLink) throw new Error('expected a content-body Installation link outside the nav')
    fireEvent.click(contentLink, { button: 0 })
    expect(await screen.findByRole('heading', { name: /^installation$/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/installation')
  })
})
