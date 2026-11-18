// Ambient declaration for the second, tiny virtual module resolved by
// vite-plugin-dance-schedule.ts's danceSchedulePlugin(): facts derived from the
// sessions at build time, so the main bundle (Nav.tsx, PageMenu.tsx) can read them
// without importing virtual:dance-schedule's whole session list.
declare module 'virtual:dance-schedule-meta' {
  const meta: {
    // See src/lib/staffScheduleLabel.ts.
    staffScheduleLabel: string
  }
  export default meta
}
