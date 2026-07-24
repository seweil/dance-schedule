import danceSessionsData from 'virtual:dance-schedule'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'

// Debug-only page (see App.tsx) rendering the parsed dance schedule as a dense
// table, formatted for desktop use — not linked from the nav.
export function RawDanceScheduleDebugPage() {
  return (
    <>
      <h1>Dance Schedule — Debug</h1>
      <p>
        Parsed from <code>data/dance-schedule.xlsx</code>. See also the generated{' '}
        <code>data/dance-schedule-dump.md</code>. Debug tooling only — not linked from
        the nav.
      </p>
      <RawDanceScheduleTable sessions={buildDanceSchedule(danceSessionsData)} />
    </>
  )
}
