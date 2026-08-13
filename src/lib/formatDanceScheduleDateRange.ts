// The /events landing page's "(Date range)" next to each real event's name
// (EventsListPage.tsx) — computed from that content set's own parsed
// dance-schedule.xlsx (see vite-plugin-content-sets.ts), not hand-typed into
// config.yaml, so it can't drift from the real schedule data the way a
// hand-maintained string could.
//
// Intl.DateTimeFormat.prototype.formatRange (not hand-rolled same-month/
// same-year/cross-year branching) — confirmed live it already produces
// exactly the wording this needs for every real case: "October 9 – 11, 2026"
// (same month), "June 30 – July 2, 2026" (same year, different month), and
// "December 30, 2026 – January 2, 2027" (different year), all from one call.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  // Dance-schedule dates are wall-clock values encoded as UTC-anchored Date
  // objects (see parseDanceScheduleSheet.ts/ScheduleList.tsx's identical
  // convention) — pinned to UTC here for the same reason, so this always
  // displays the date exactly as entered regardless of the machine building
  // it.
  timeZone: 'UTC',
})

// `dates` should be every session's own `date` field for one content set
// (duplicates and any order are fine — only the min/max matter). Returns
// null for an empty list (never expected for a real, already-validated
// dance-schedule.xlsx, but avoids a confusing NaN/Invalid Date string if a
// content set's sessions array is ever empty).
export function formatDanceScheduleDateRange(dates: Date[]): string | null {
  if (dates.length === 0) {
    return null
  }
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  const start = sorted[0]!
  const end = sorted[sorted.length - 1]!
  return start.getTime() === end.getTime()
    ? dateFormatter.format(start)
    : dateFormatter.formatRange(start, end)
}
