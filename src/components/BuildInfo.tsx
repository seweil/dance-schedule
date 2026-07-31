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
export function BuildInfo() {
  return (
    <p className={styles.buildInfo}>
      Build {__BUILD_NUMBER__} · Compiled {buildTimeFormatter.format(new Date(__BUILD_TIME__))} ·{' '}
      {/* react-router Link, not a plain <a> — /events is a route within THIS
          build (unlike EventsListPage.tsx's own cross-set links), so a
          basename-relative client-side link is correct here. */}
      <Link to="/events">All events</Link>
    </p>
  )
}
