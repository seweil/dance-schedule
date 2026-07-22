import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { buildNavTree } from './buildNavTree'

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
})
