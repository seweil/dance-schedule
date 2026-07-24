// Ambient declaration for the virtual module resolved by vite-plugin-schedule.ts's
// schedulePlugin(), the same way vite-plugin-pages/client-react types ~react-pages.
declare module 'virtual:schedule' {
  import type { ScheduleEventData } from './schedule'

  const events: ScheduleEventData[]
  export default events
}
