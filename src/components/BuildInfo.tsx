import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import styles from './BuildInfo.module.css'

// Short — "8/3/26," not "August 3, 2026" — this whole line is meant to read as
// a single, compact fine-print string, not a sentence.
const buildDateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'short' })

// A separate formatter, not dateStyle/timeStyle combined with timeZoneName on
// one — Intl.DateTimeFormat rejects mixing a *Style option with individual
// component options (weekday/hour/minute/.../timeZoneName) on the same
// instance. timeZoneName so a build date doesn't read as ambiguous to
// whoever's reading it in a different timezone than whoever triggered the
// build.
const buildTimeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  timeZoneName: 'short',
})

// __BUILD_NUMBER__/__BUILD_TIME__ (the short git commit hash and compile time) are
// injected via vite.config.ts's `define` — see src/vite-env.d.ts. Shared, route-
// agnostic presentational piece: also shown on the debug page
// (RawDanceScheduleDebugPage.tsx); App.tsx decides where else it renders. Since
// it's shared, the "All events" link at the end of the line (below) shows up
// in both places automatically, not just one.
//
// `extraLinks` lets a specific caller fold an extra link into this same fine-print
// line, before "All events", instead of adding its own separate line elsewhere —
// App.tsx's Home-only rendering uses this for a "Raw data" link (see its own
// comment) rather than hardcoding that link here, since it'd be a pointless
// self-link on the debug page, which also renders this component.
//
// Everything below is deliberately ONE line/paragraph, not build info and
// online status as two separate ones (an earlier version) — per direct
// product decision, this whole footer reads as a single fine-print string:
// "Build <hash> at <date>, <time TZ> · Online/Offline · Raw data · All events".
export function BuildInfo({ extraLinks }: { extraLinks?: ReactNode } = {}) {
  const isOnline = useOnlineStatus()
  const builtAt = new Date(__BUILD_TIME__)
  return (
    <p className={styles.buildInfo}>
      Build {__BUILD_NUMBER__} at {buildDateFormatter.format(builtAt)}, {buildTimeFormatter.format(builtAt)} ·{' '}
      {/* navigator.onLine/the 'online'/'offline' window events (useOnlineStatus.ts)
          reflect whether the DEVICE has a network connection at all, not whether
          this specific origin is reachable — a reasonable proxy, and the same
          signal the browser's own offline UI relies on, but not a guarantee every
          fetch will succeed. */}
      {isOnline ? 'Online' : 'Offline'}
      {extraLinks && <> · {extraLinks}</>} ·{' '}
      {/* react-router Link, not a plain <a> — /events is a route within THIS
          build (unlike EventsListPage.tsx's own cross-set links), so a
          basename-relative client-side link is correct here. */}
      <Link to="/events">All events</Link>
    </p>
  )
}
