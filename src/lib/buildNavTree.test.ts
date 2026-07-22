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

  it('builds nested hrefs from parent + child segments', () => {
    const [section] = buildNavTree([
      {
        path: 'getting-started',
        children: [{ path: 'installation', element: createElement('div') }],
      },
    ])

    expect(section?.href).toBeNull()
    expect(section?.children[0]).toMatchObject({
      label: 'Installation',
      href: '/getting-started/installation',
    })
  })
})
