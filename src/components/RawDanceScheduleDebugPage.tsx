import { useEffect, useState } from 'react'
import contentSets from 'virtual:content-sets'
import danceSessionsData from 'virtual:dance-schedule'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { BuildInfo } from './BuildInfo'
import { PageHeader } from './PageHeader'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'
import styles from './RawDanceScheduleDebugPage.module.css'

const CONFIRMATION_DURATION_MS = 3000

// Thrown inside a plain onClick, not during render — React's error-boundary
// machinery only intercepts errors thrown while rendering/in lifecycles/in
// effects, never ones thrown inside an event handler, so this propagates as
// a normal uncaught exception (window.onerror, exactly what RUM's `errors`
// telemetry listens for — see vite.config.ts's RumAppMonitor Telemetries)
// without unmounting the page or leaving it in any broken state — clicking
// this is safe to repeat as many times as needed.
function TriggerTestErrorLink() {
  // Count, not a boolean — verifying the M-out-of-N alarm
  // (docs/design/alerting.md) means clicking this several times, spaced
  // minutes apart, so each click needs to restart the auto-hide timer even
  // if a previous confirmation is still showing.
  const [triggerCount, setTriggerCount] = useState(0)

  useEffect(() => {
    if (triggerCount === 0) {
      return
    }
    const timeoutId = window.setTimeout(() => setTriggerCount(0), CONFIRMATION_DURATION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [triggerCount])

  return (
    <p>
      <button
        type="button"
        className={styles.testErrorLink}
        onClick={() => {
          // Set before throwing, not after — React still flushes an update
          // scheduled earlier in the same handler even though the handler
          // itself goes on to throw synchronously right after.
          setTriggerCount((count) => count + 1)
          throw new Error('Test JS error — triggered from the debug page to verify RUM/CloudWatch alerting end to end')
        }}
      >
        Trigger a test JS error (for RUM/CloudWatch alerting verification —
        see docs/design/alerting.md)
      </button>
      {triggerCount > 0 && (
        <span className={styles.confirmation} role="status">
          {' '}
          Triggered — check RUM/CloudWatch for the event
        </span>
      )}
    </p>
  )
}

// Debug-only page (see App.tsx) rendering the parsed dance schedule as a dense
// table, formatted for desktop use — not linked from the nav.
export function RawDanceScheduleDebugPage() {
  return (
    <>
      <PageHeader title={`Schedule details (${contentSets.activeSet})`} />
      <BuildInfo />
      <RawDanceScheduleTable sessions={buildDanceSchedule(danceSessionsData)} />
      <TriggerTestErrorLink />
    </>
  )
}
