import { Suspense, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, useLocation, useRoutes, type RouteObject } from 'react-router-dom'
import { MDXProvider } from '@mdx-js/react'
import routes from '~react-pages'
import { BuildInfo } from './components/BuildInfo'
import { ClearStorageAction } from './components/ClearStorageAction'
import { EventsListPage } from './components/EventsListPage'
import { ImageGalleryProvider } from './components/ImageGallery'
import { Nav } from './components/Nav'
import { PageHeader } from './components/PageHeader'
import { ResetHintsLink } from './components/ResetHintsLink'
import { ScrollToTopButton } from './components/ScrollToTopButton'
import { UpdatePrompt } from './components/UpdatePrompt'
import { ZoomableImage } from './components/ZoomableImage'
import { RawDanceScheduleDebugPage } from './components/RawDanceScheduleDebugPage'
import { TextSizeProvider } from './components/TextSizeProvider'
import { useAppLaunchCount } from './hooks/useAppLaunchCount'
import { useLastPagePersistence } from './hooks/useLastPagePersistence'
import { useNudgeScrollOnOrientationChange } from './hooks/useNudgeScrollOnOrientationChange'
import { useResetRotateBannerOnLandscape } from './hooks/useResetRotateBannerOnLandscape'
import { normalizeRoutes } from './lib/buildNavTree'

// A content page's markdown `# Title` compiles to a plain `<h1>` — this override
// routes it through PageHeader.tsx too, same as every hand-written page already
// does, so its mobile kebab toggle shares a row with the title here as well.
function MdxH1({ children }: { children?: ReactNode }) {
  return <PageHeader title={children} />
}

// Content authors write markdown links as absolute paths (e.g. "/event-schedule")
// meant to stay within the current content set. Left as a plain <a>, that's a real
// browser navigation to the site root, which only "works" by accident for the
// default content set (mirrored unprefixed at "/", see docs/design/content-sets.md)
// — every other set gets bounced out of its "/<set>/" prefix into the default set.
// Routing same-origin absolute paths through react-router's Link (basename-relative,
// same distinction BuildInfo.tsx already draws for "/events") keeps them in the
// current build. Anything else — external URLs, mailto:, protocol-relative "//..." —
// is left as a real <a>.
function MdxA({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href?.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link to={href} {...rest}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}

const mdxComponents = { img: ZoomableImage, h1: MdxH1, a: MdxA }

// Registered routes must match the clean hrefs buildNavTree computes for the nav
// (order prefixes like "2 " are stripped from the URL, not just the label).
const normalizedRoutes = normalizeRoutes(routes)

// Hand-added outside ~react-pages on purpose: Nav derives its menu straight from
// ~react-pages' own routes (src/components/Nav.tsx), so a route added only here is
// reachable but never appears in the nav — debug tooling only, not a real page.
const debugRoutes: RouteObject[] = [
  { path: '/debug', element: <Navigate to="/debug/dance-schedule" replace /> },
  { path: '/debug/dance-schedule', element: <RawDanceScheduleDebugPage /> },
]

// Same "reachable but not in nav" treatment as debugRoutes above, for a different
// reason: this is a one-off utility action (linked from the Installation page), not
// a page worth a permanent nav entry.
const utilityRoutes: RouteObject[] = [{ path: '/clear-storage', element: <ClearStorageAction /> }]

// Real, user-facing page (unlike debugRoutes/utilityRoutes above) — deliberately
// kept out of ~react-pages/Nav anyway, since it's meant to be a subtle, secondary
// discovery path (linked from BuildInfo.tsx, right after the build date), not a
// primary nav destination for a page that's about every OTHER event, not this one.
const eventsRoutes: RouteObject[] = [{ path: '/events', element: <EventsListPage /> }]

// Without this, any unmatched path (typo, stale link, or — now that every content
// set publishes under its own "/<set>/" prefix, see docs/design/content-sets.md —
// a path that happens to look like another set's name, e.g. "/real/test") rendered
// nothing below the nav instead of a real 404 or a helpful fallback. `to="/"` is
// basename-relative (see BrowserRouter below), so this lands on *this* build's own
// home page, not some other content set's.
const notFoundRoute: RouteObject = { path: '*', element: <Navigate to="/" replace /> }

function Pages() {
  useLastPagePersistence()
  return useRoutes([...normalizedRoutes, ...debugRoutes, ...utilityRoutes, ...eventsRoutes, notFoundRoute])
}

// Fine print at the bottom of the home page only — not global chrome like Nav/
// UpdatePrompt, so it's gated on the route here rather than baked into BuildInfo
// itself (which stays route-agnostic — see the debug page's own, separate use of
// it). `pathname` is basename-relative (BrowserRouter's `basename` below), same
// convention Nav.tsx's own `end={item.href === '/'}` Home check relies on.
//
// "Raw data" (linking to the same debug dump DanceSchedulePage.tsx used to link
// to directly) lives here, not on the schedule page itself, so it adds no extra
// vertical space to that page's own layout — it folds into this already-existing
// fine-print line instead, before "All events" (see BuildInfo.tsx's `extraLinks`).
// ResetHintsLink goes after "All events" instead (`extraLinksAfter`) — both are
// Home-only for the same reason: a pointless/confusing addition on the debug
// page, which also renders this same BuildInfo component.
function HomeBuildInfo() {
  const location = useLocation()
  return location.pathname === '/' ? (
    <BuildInfo
      extraLinks={<Link to="/debug/dance-schedule">Raw data</Link>}
      extraLinksAfter={<ResetHintsLink />}
    />
  ) : null
}

export function App() {
  // Called for its side effect only (the increment itself) — see that hook's
  // own comment for why nothing here needs its return value: any component
  // that cares how many times the app has launched (useFirstLaunchHint.ts)
  // reads the same persisted count directly instead. Called here, not inside
  // Pages()/useLastPagePersistence() below, since it needs to run exactly
  // once per real page load, not once per in-app route (Pages() re-renders on
  // every navigation; App() does not).
  useAppLaunchCount()
  useNudgeScrollOnOrientationChange()
  useResetRotateBannerOnLandscape()

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <TextSizeProvider>
        <MDXProvider components={mdxComponents}>
          {/* Watched by ScrollToTopButton (via useIsElementVisible) to know whether
              the page is scrolled away from the top — deliberately NOT `<nav>`
              itself: Nav.module.css hides it entirely (`display: none`) below the
              640px breakpoint, so on mobile — this button's primary use case,
              scrolling the dance-schedule grid, see ScrollToTopButton.tsx — nav
              never intersects at all, and the button was stuck permanently visible
              regardless of scroll position. This zero-size marker is always
              rendered, at the very top of the page, on every viewport. */}
          <div id="page-top-sentinel" aria-hidden="true" />
          <Nav />
          <UpdatePrompt />
          <ImageGalleryProvider>
            <Suspense fallback={<p>Loading…</p>}>
              <Pages />
            </Suspense>
          </ImageGalleryProvider>
          <HomeBuildInfo />
          <ScrollToTopButton />
        </MDXProvider>
      </TextSizeProvider>
    </BrowserRouter>
  )
}
