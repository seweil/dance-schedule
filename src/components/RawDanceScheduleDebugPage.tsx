import contentSets from 'virtual:content-sets'
import danceSessionsData from 'virtual:dance-schedule'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { BuildInfo } from './BuildInfo'
import { PageHeader } from './PageHeader'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'
import styles from './RawDanceScheduleDebugPage.module.css'

// Thrown inside a plain onClick, not during render — React's error-boundary
// machinery only intercepts errors thrown while rendering/in lifecycles/in
// effects, never ones thrown inside an event handler, so this propagates as
// a normal uncaught exception (window.onerror, exactly what RUM's `errors`
// telemetry listens for — see vite.config.ts's RumAppMonitor Telemetries)
// without unmounting the page or leaving it in any broken state — clicking
// this is safe to repeat as many times as needed.
function TriggerTestErrorLink() {
  return (
    <p>
      <button
        type="button"
        className={styles.testErrorLink}
        onClick={() => {
          throw new Error('Test JS error — triggered from the debug page to verify RUM/CloudWatch alerting end to end')
        }}
      >
        Trigger a test JS error (for RUM/CloudWatch alerting verification —
        see docs/design/alerting.md)
      </button>
    </p>
  )
}

// Debug-only page (see App.tsx) rendering the parsed dance schedule as a dense
// table, formatted for desktop use — not linked from the nav.
export function RawDanceScheduleDebugPage() {
  return (
    <>
      <PageHeader title={`Dance Schedule — Debug (${contentSets.activeSet})`} />
      <BuildInfo />
      <RawDanceScheduleTable sessions={buildDanceSchedule(danceSessionsData)} />
      <TriggerTestErrorLink />
    </>
  )
}
