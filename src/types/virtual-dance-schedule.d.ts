// Ambient declaration for the virtual module resolved by
// vite-plugin-dance-schedule.ts's danceSchedulePlugin(), mirroring
// virtual-schedule.d.ts.
declare module 'virtual:dance-schedule' {
  import type { DanceSessionData } from './danceSchedule'

  const sessions: DanceSessionData[]
  export default sessions
}
