import type { DanceSessionDateGroup } from './groupDanceSessionsByDate'
import { getPresentLevelIndexRange, type LevelSlot } from './levelOrder'

// The date the dance schedule opens on when nothing usable is stored: today, if
// it's one of the event's dates (someone at the event wants what's on now);
// otherwise the first date with more than one level scheduled. Not simply the
// first date: an event can open with a one-session warm-up day (MidWinter2027's
// Thursday pre-event dance, MS Ext only) that makes a poor first impression of
// the whole schedule, with a single level and no phase slider. Falls back to the
// first date if no date has more than one level. Session dates are UTC midnight
// (parseEventDate.ts), so today is compared as the viewer's local calendar date.
export function pickDefaultDanceScheduleDate(
  groups: readonly DanceSessionDateGroup[],
  slots: readonly LevelSlot[],
  now: Date = new Date(),
): Date | undefined {
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const today = groups.find((group) => group.date.getTime() === todayUtc)
  if (today) return today.date
  const firstMultiLevel = groups.find((group) => {
    const { minIndex, maxIndex } = getPresentLevelIndexRange(group.sessions, slots)
    return maxIndex > minIndex
  })
  return (firstMultiLevel ?? groups[0])?.date
}
