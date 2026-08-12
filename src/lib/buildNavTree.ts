import type { RouteObject } from 'react-router-dom'

export interface NavItem {
  label: string
  href: string
  // True for exactly one item — the Dance Schedule page (src/pages/12 dance-
  // schedule.tsx, DanceScheduleLevelsPage) — per direct product decision: it's
  // the app's single most important page, so both menus (Nav.tsx's desktop tab
  // bar, PageMenu.tsx's mobile dropdown) give its link a bit more visual
  // weight than an ordinary item, independent of whether it's also the
  // CURRENT page (a separate, NavLink-driven aria-current state each menu's
  // own CSS already handles). Computed here, once, rather than each menu
  // hardcoding its own href check, so the two can't drift.
  emphasized: boolean
}

// The one nav item that gets the "most important page" treatment above — a
// plain href match, not a route/label lookup, so it stays correct regardless
// of that page's own order-prefix digit (see ORDER_PREFIX below) or exact
// title-cased label wording.
const EMPHASIZED_HREF = '/dance-schedule'

// Content filenames may start with "<digits> " (a number then a single space) to
// control menu sort order — e.g. "2 installation.md" sorts before "10 about.md"
// regardless of alphabetical order. The prefix is stripped from the resulting
// label/route. The remaining name should be kebab-case (hyphens, not spaces);
// titleCase below splits on hyphens/underscores to build the display label.
const ORDER_PREFIX = /^(\d+) (.+)$/

function parseSegment(segment: string): { order: number | null; slug: string } {
  const match = segment.match(ORDER_PREFIX)
  return match ? { order: Number(match[1]), slug: match[2] ?? segment } : { order: null, slug: segment }
}

// Short connector words stay lowercase (conventional English title-case style,
// e.g. "Dance by Level" not "Dance By Level") — except as the first word, where a
// label should never start lowercase regardless of what the word is.
const LOWERCASE_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

function titleCase(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && LOWERCASE_WORDS.has(word.toLowerCase())) {
        return word.toLowerCase()
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

// Strips the order prefix from a route's path so the registered route matches the
// clean href buildNavTree computes for it (e.g. "2 installation" -> "installation").
export function normalizeRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) => {
    const segment = route.path ?? ''
    if (segment === '/' || segment === '') {
      return route
    }
    const { slug } = parseSegment(segment)
    return slug === segment ? route : { ...route, path: slug }
  })
}

export function buildNavTree(routes: RouteObject[]): NavItem[] {
  return routes
    .map((route, index) => {
      const segment = route.path ?? ''
      const isRoot = segment === '/'
      const { order, slug } = isRoot ? { order: null, slug: segment } : parseSegment(segment)

      const href = isRoot ? '/' : `/${slug}`

      return {
        // Home always leads the menu, ahead of any order prefix on other pages.
        sortKey: isRoot ? -1 : (order ?? Number.POSITIVE_INFINITY),
        index,
        label: isRoot ? 'Home' : titleCase(slug),
        href,
        emphasized: href === EMPHASIZED_HREF,
      }
    })
    .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index)
    .map(({ label, href, emphasized }) => ({ label, href, emphasized }))
}
