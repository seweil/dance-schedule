import type { DanceSessionData } from '../types/danceSchedule'

// The href the label below applies to — src/pages/14 caller-schedule.tsx. Only its
// label changes; the route stays /caller-schedule either way, so bookmarks, the
// last-page persistence and analytics don't depend on what an event schedules.
export const STAFF_SCHEDULE_HREF = '/caller-schedule'

// The staff-columns page's title and nav label: "Caller Schedule" at a square-
// dance-only event (every event before MidWinter2027), "Staff Schedule" once the
// schedule has another kind of dancing (round dancing, clogging), whose staff are
// cuers and instructors rather than callers. Per direct product decision — see
// docs/design/midwinter-festival-2027.md's "Staff view label".
export function staffScheduleLabel(sessions: readonly DanceSessionData[]): string {
  const hasOtherDanceForm = sessions.some((session) => session.kind === 'structured' && session.danceForm)
  return hasOtherDanceForm ? 'Staff Schedule' : 'Caller Schedule'
}
