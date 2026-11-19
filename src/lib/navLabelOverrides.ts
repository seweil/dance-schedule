import danceScheduleMeta from 'virtual:dance-schedule-meta'
import { STAFF_SCHEDULE_HREF } from './staffScheduleLabel'

// buildNavTree's `labelOverrides` for this build's content set — shared by both
// menus (Nav.tsx, PageMenu.tsx) so they can't disagree. A separate module from
// staffScheduleLabel.ts because that one is also imported Node-side, by the Vite
// plugin that generates this virtual module.
export const NAV_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  [STAFF_SCHEDULE_HREF]: danceScheduleMeta.staffScheduleLabel,
}
