// Ambient declaration for the virtual module resolved by
// vite-plugin-detailed-schedule.ts's detailedSchedulePlugin(), mirroring
// virtual-schedule.d.ts.
declare module 'virtual:detailed-schedule' {
  import type { DetailedSessionData } from './detailedSchedule'

  const sessions: DetailedSessionData[]
  export default sessions
}
