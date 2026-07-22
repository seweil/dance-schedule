import type { RouteObject } from 'react-router-dom'

export interface NavItem {
  label: string
  href: string | null
  children: NavItem[]
}

function titleCase(segment: string): string {
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function joinPaths(parentHref: string, segment: string): string {
  const trimmedParent = parentHref.endsWith('/') ? parentHref : `${parentHref}/`
  return `${trimmedParent}${segment}`.replace(/\/{2,}/g, '/')
}

export function buildNavTree(routes: RouteObject[], parentHref = '/'): NavItem[] {
  return routes.map((route) => {
    const segment = route.path ?? ''
    const isRoot = segment === '/'
    const href = isRoot ? '/' : joinPaths(parentHref, segment)
    const label = isRoot ? 'Home' : titleCase(segment)
    const children = route.children ? buildNavTree(route.children, href) : []

    return {
      label,
      href: route.element ? href : null,
      children,
    }
  })
}
