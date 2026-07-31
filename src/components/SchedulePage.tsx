import scheduleData from 'virtual:schedule'
import { buildSchedule } from '../lib/buildSchedule'
import { PageHeader } from './PageHeader'
import { ScheduleList } from './ScheduleList'

export function SchedulePage() {
  return (
    <>
      <PageHeader title="Event Schedule" />
      <ScheduleList events={buildSchedule(scheduleData)} />
    </>
  )
}
