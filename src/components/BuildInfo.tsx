import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
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
  const isOnline = useOnlineStatus()
  return (
    <>
      <p className={styles.buildInfo}>
        Build {__BUILD_NUMBER__} · Compiled {buildTimeFormatter.format(new Date(__BUILD_TIME__))}
        {extraLinks && <> · {extraLinks}</>} ·{' '}
        {/* react-router Link, not a plain <a> — /events is a route within THIS
            build (unlike EventsListPage.tsx's own cross-set links), so a
            basename-relative client-side link is correct here. */}
        <Link to="/events">All events</Link>
      </p>
      {/* Only rendered while actually offline — the normal, online state needs no
          announcement, same reasoning as UpdatePrompt.tsx only rendering once
          there's something to say. navigator.onLine/the 'online'/'offline' window
          events (useOnlineStatus.ts) reflect whether the DEVICE has a network
          connection at all, not whether this specific origin is reachable — a
          reasonable proxy, and the same signal the browser's own offline UI relies
          on, but not a guarantee every fetch will succeed. */}
      {!isOnline && <p className={styles.offline}>Offline — showing cached content</p>}
    </>
  )
}
