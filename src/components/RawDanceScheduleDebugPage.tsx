import contentSets from 'virtual:content-sets'
import danceSessionsData from 'virtual:dance-schedule'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { BuildInfo } from './BuildInfo'
import { PageHeader } from './PageHeader'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'

// Debug-only page (see App.tsx) rendering the parsed dance schedule as a dense
// table, formatted for desktop use — not linked from the nav.
export function RawDanceScheduleDebugPage() {
  return (
    <>
      <PageHeader title={`Dance Schedule — Debug (${contentSets.activeSet})`} />
      <BuildInfo />
      <RawDanceScheduleTable sessions={buildDanceSchedule(danceSessionsData)} />
    </>
  )
}
