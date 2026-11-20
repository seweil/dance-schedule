import type { DanceSessionDateGroup } from './groupDanceSessionsByDate'
import { getPresentLevelIndexRange, type LevelSlot } from './levelOrder'
import { WEEKDAYS, type Weekday } from '../types/contentConfig'

// The date the dance schedule opens on when nothing usable is stored: today, if
// it's one of the event's dates (someone at the event wants what's on now);
// otherwise the content set's configured `defaultDay` (config.yaml's
// danceSchedule.defaultDay), if any; otherwise the first date with more than one
// level scheduled. Not simply the first date: an event can open with a
// one-session warm-up day that makes a poor first impression of the whole
// schedule, with a single level and no phase slider. `defaultDay` covers a
// warm-up day the level rule can't spot (MidWinter2027's Thursday: one MS+ dance,
// two levels, but nearly empty). Falls back to the first date if no date has more
// than one level. Session dates are UTC midnight (parseEventDate.ts), so today is
// compared as the viewer's local calendar date, and a date's weekday read in UTC.
export function pickDefaultDanceScheduleDate(
  groups: readonly DanceSessionDateGroup[],
  slots: readonly LevelSlot[],
  defaultDay?: Weekday,
  now: Date = new Date(),
): Date | undefined {
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const today = groups.find((group) => group.date.getTime() === todayUtc)
  if (today) return today.date
  const configured = groups.find((group) => weekdayOf(group.date) === defaultDay)
  if (configured) return configured.date
  const firstMultiLevel = groups.find((group) => {
    const { minIndex, maxIndex } = getPresentLevelIndexRange(group.sessions, slots)
    return maxIndex > minIndex
  })
  return (firstMultiLevel ?? groups[0])?.date
}

function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[date.getUTCDay()]!
}

// Build-time check (vite-plugin-dance-schedule.ts) that `defaultDay` names
// exactly one of the schedule's dates, so a typo or a week-plus event fails the
// build instead of silently falling back to the level rule.
export function validateDefaultDayConfig(dates: readonly Date[], defaultDay: Weekday | undefined, configFile: string): void {
  if (!defaultDay) {
    return
  }
  const matches = new Set(dates.filter((date) => weekdayOf(date) === defaultDay).map((date) => date.getTime()))
  if (matches.size !== 1) {
    throw new Error(
      `${configFile}'s "danceSchedule.defaultDay" is ${defaultDay}, which matches ${matches.size} of the dance schedule's dates (needs exactly one)`,
    )
  }
}
