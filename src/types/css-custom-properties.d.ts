import 'react'

// CSS custom properties this app sets via inline `style`, typed so call sites
// don't need a cast.
declare module 'react' {
  interface CSSProperties {
    // A dance-schedule card's own background color, read by its text's halo
    // (.levels/.details/.gca in DanceScheduleGrid.module.css).
    '--card-bg'?: string
  }
}
