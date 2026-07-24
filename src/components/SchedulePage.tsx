import scheduleData from 'virtual:schedule'
import { buildSchedule } from '../lib/buildSchedule'
import { ScheduleList } from './ScheduleList'

export function SchedulePage() {
  return (
    <>
      <h1>Schedule</h1>
      <ScheduleList events={buildSchedule(scheduleData)} />
    </>
  )
}
