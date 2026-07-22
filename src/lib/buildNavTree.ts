import type { RouteObject } from 'react-router-dom'

export interface NavItem {
  label: string
  href: string
}

function titleCase(segment: string): string {
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function buildNavTree(routes: RouteObject[]): NavItem[] {
  return routes.map((route) => {
    const segment = route.path ?? ''
    const isRoot = segment === '/'

    return {
      label: isRoot ? 'Home' : titleCase(segment),
      href: isRoot ? '/' : `/${segment}`,
    }
  })
}
