import detailedSessionsData from 'virtual:detailed-schedule'
import { buildDetailedSchedule } from '../lib/buildDetailedSchedule'
import { DetailedScheduleTable } from './DetailedScheduleTable'

// Debug-only page (see App.tsx) rendering the parsed detailed schedule as a dense
// table, formatted for desktop use — not linked from the nav.
export function DetailedScheduleDebugPage() {
  return (
    <>
      <h1>Detailed Schedule — Debug</h1>
      <p>
        Parsed from <code>data/detailed-schedule.xlsx</code>. See also the generated{' '}
        <code>data/detailed-schedule-dump.md</code>. Debug tooling only — not linked from
        the nav.
      </p>
      <DetailedScheduleTable sessions={buildDetailedSchedule(detailedSessionsData)} />
    </>
  )
}
