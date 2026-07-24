import danceSessionsData from 'virtual:dance-schedule'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'

const buildTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'medium',
})

// Debug-only page (see App.tsx) rendering the parsed dance schedule as a dense
// table, formatted for desktop use — not linked from the nav.
export function RawDanceScheduleDebugPage() {
  return (
    <>
      <h1>Dance Schedule — Debug</h1>
      <p>
        Build {__BUILD_NUMBER__} · Compiled {buildTimeFormatter.format(new Date(__BUILD_TIME__))}
      </p>
      <RawDanceScheduleTable sessions={buildDanceSchedule(danceSessionsData)} />
    </>
  )
}
