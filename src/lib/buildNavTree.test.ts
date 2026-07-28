import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { buildNavTree, normalizeRoutes } from './buildNavTree'

describe('buildNavTree', () => {
  it('labels the root index route "Home" with href "/"', () => {
    const [home] = buildNavTree([{ path: '/', element: createElement('div') }])

    expect(home).toMatchObject({ label: 'Home', href: '/' })
  })

  it('title-cases kebab-case path segments', () => {
    const [item] = buildNavTree([{ path: 'getting-started', element: createElement('div') }])

    expect(item).toMatchObject({ label: 'Getting Started', href: '/getting-started' })
  })

  it('maps a flat list of routes straight to nav items', () => {
    const items = buildNavTree([
      { path: '/', element: createElement('div') },
      { path: 'installation', element: createElement('div') },
      { path: 'about', element: createElement('div') },
    ])

    expect(items).toEqual([
      { label: 'Home', href: '/' },
      { label: 'Installation', href: '/installation' },
      { label: 'About', href: '/about' },
    ])
  })

  it('strips a leading "<digits> " order prefix from the label and href', () => {
    const [item] = buildNavTree([{ path: '2 installation', element: createElement('div') }])

    expect(item).toEqual({ label: 'Installation', href: '/installation' })
  })

  it('sorts by numeric order prefix rather than alphabetically', () => {
    const items = buildNavTree([
      { path: '10 zebra', element: createElement('div') },
      { path: '2 about', element: createElement('div') },
    ])

    expect(items.map((item) => item.label)).toEqual(['About', 'Zebra'])
  })

  it('keeps Home first regardless of other pages’ order prefixes', () => {
    const items = buildNavTree([
      { path: '1 about', element: createElement('div') },
      { path: '/', element: createElement('div') },
    ])

    expect(items.map((item) => item.label)).toEqual(['Home', 'About'])
  })

  it('keeps a short connector word lowercase, except as the first word', () => {
    const items = buildNavTree([
      { path: 'dance-by-level', element: createElement('div') },
      { path: 'by-the-way', element: createElement('div') },
    ])

    expect(items.map((item) => item.label)).toEqual(['Dance by Level', 'By the Way'])
  })

  it('sorts unprefixed pages after prefixed ones, in their original order', () => {
    const items = buildNavTree([
      { path: 'unprefixed', element: createElement('div') },
      { path: '1 first', element: createElement('div') },
    ])

    expect(items.map((item) => item.label)).toEqual(['First', 'Unprefixed'])
  })
})

describe('normalizeRoutes', () => {
  it('strips the order prefix from a route path so it matches the nav href', () => {
    const [route] = normalizeRoutes([{ path: '2 installation', element: createElement('div') }])

    expect(route?.path).toBe('installation')
  })

  it('leaves the root route and unprefixed routes untouched', () => {
    const routes = normalizeRoutes([
      { path: '/', element: createElement('div') },
      { path: 'about', element: createElement('div') },
    ])

    expect(routes.map((route) => route.path)).toEqual(['/', 'about'])
  })
})
