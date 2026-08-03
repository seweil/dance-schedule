import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './BuildInfo.module.css'

const buildTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'medium',
})

// __BUILD_NUMBER__/__BUILD_TIME__ (the short git commit hash and compile time) are
// injected via vite.config.ts's `define` — see src/vite-env.d.ts. Shared, route-
// agnostic presentational piece: also shown on the debug page
// (RawDanceScheduleDebugPage.tsx); App.tsx decides where else it renders. Since
// it's shared, the "All events" link right after the build date (below) shows up
// in both places automatically, not just one.
//
// `extraLinks` lets a specific caller fold an extra link into this same fine-print
// line, before "All events", instead of adding its own separate line elsewhere —
// App.tsx's Home-only rendering uses this for a "Raw data" link (see its own
// comment) rather than hardcoding that link here, since it'd be a pointless
// self-link on the debug page, which also renders this component.
export function BuildInfo({ extraLinks }: { extraLinks?: ReactNode } = {}) {
  return (
    <p className={styles.buildInfo}>
      Build {__BUILD_NUMBER__} · Compiled {buildTimeFormatter.format(new Date(__BUILD_TIME__))}
      {extraLinks && <> · {extraLinks}</>} ·{' '}
      {/* react-router Link, not a plain <a> — /events is a route within THIS
          build (unlike EventsListPage.tsx's own cross-set links), so a
          basename-relative client-side link is correct here. */}
      <Link to="/events">All events</Link>
    </p>
  )
}
