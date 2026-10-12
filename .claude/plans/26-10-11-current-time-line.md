# Current-time line on the schedule grids

## Context
At the event, people want to see at a glance where "now" falls on the schedule. On the
three grid pages (Room / Dance / Caller Schedule — all rendered through the shared
`src/components/StickyScrollGrid.tsx`), draw a horizontal line at the current local time
when the selected date is today and now lies within the grid's labelled time range.
The axis is not linear (one row per distinct session boundary, rows auto-sized), so the
position is interpolated linearly between the two surrounding labels. Updates every
minute. Visuals are placeholder for now; logic + tests are the goal. Event Schedule
(flat list) is out of scope.

## Key facts from exploration
- Session times are wall-clock values encoded as UTC-anchored `Date`s (see
  `ScheduleList.tsx` comment, `computeDanceScheduleTimeAxis.ts`'s UTC formatter). So
  "now" must be converted: `Date.UTC(local Y, M, D, h, m, s)` from the device clock —
  NOT compared as a raw instant.
- Tick times are full datetimes (date included), so "is the displayed day today" falls
  out for free: if wall-now isn't between the first and last tick of the visible
  sessions, no line. No separate date comparison needed (also handles after-midnight
  sessions correctly).
- `computeDanceScheduleTimeAxis` builds `timeMarks` (one per tick, `rowStart = i+1`);
  tick `i` sits at the top edge of body-grid row `i+1`; there are `totalRows = N-1`
  explicit rows (the last label lives in an implicit row after them). `TimeMark` has
  no time value today.
- All three layouts (`computeDanceScheduleLayout`, `…LevelLayout`, `…CallerLayout`)
  pass `timeAxis.timeMarks` straight through to `StickyScrollGrid`, so extending
  `TimeMark` reaches every grid with no per-page changes.

## Changes

1. **`src/lib/computeDanceScheduleTimeAxis.ts`** — add `time: Date` to `TimeMark`
   (set to `new Date(t)` in the existing `tickTimes.map`). Update the few test
   expectations that deep-equal timeMarks.

2. **New `src/lib/computeNowLinePosition.ts`** (+ colocated table-driven test) —
   ```ts
   export function toWallClockUtc(now: Date): Date   // local fields → UTC-anchored
   export function computeNowLinePosition(timeMarks: TimeMark[], wallNow: Date):
     { row: number; fraction: number } | null
   ```
   Find `i` with `marks[i].time <= wallNow < marks[i+1].time`; return
   `{ row: marks[i].rowStart, fraction: (now - t_i) / (t_{i+1} - t_i) }`. Exactly
   equal to the last tick → `{ row: last explicit row, fraction: 1 }`. Fewer than 2
   marks, before first, or after last → `null`. Tests: before/after range, exactly on
   first/middle/last label, midpoint of a short gap vs. a long gap (proves per-segment
   interpolation, not global), different day → null, `toWallClockUtc` with a
   non-UTC `TZ` (`process.env.TZ` or constructing via local-field Date).

3. **New `src/hooks/useWallClockNow.ts`** (+ test with `vi.useFakeTimers` /
   `vi.setSystemTime`, matching `HintBalloon.test.tsx`'s pattern) — returns
   `toWallClockUtc(new Date())`, re-rendering at each minute boundary
   (`setTimeout` to the next :00, then every 60s) and also on `visibilitychange` →
   visible (backgrounded PWA timers get throttled, so the line would otherwise be stale
   on return). Cleans up on unmount.

4. **`src/components/StickyScrollGrid.tsx`** — call `useWallClockNow()`, compute
   `computeNowLinePosition(timeMarks, now)` (memo on both), and when non-null render
   inside the body grid, after `children`:
   ```tsx
   <div className={styles.nowRow} style={{ gridRow: row, gridColumn: '1 / -1' }}
        data-testid="now-line" aria-hidden="true">
     <div className={styles.nowLine} style={{ top: `${fraction * 100}%` }} />
   </div>
   ```
   Placing the overlay in the grid row itself means the browser's own row height does
   the scaling — no DOM measurement, and it stays correct with text-size changes and
   auto-sized rows.

5. **`src/components/DanceScheduleGrid.module.css`** — placeholder styling:
   `.nowRow { position: relative; pointer-events: none; z-index: 2 }` and
   `.nowLine { position: absolute; left: 0; right: 0; height: 2px; background: red;
   transform: translateY(-1px) }`. (z-index above cards and sticky `.timeLabel`;
   refine visuals later.)

6. **Docs** — add a short decision to `docs/design/dance-schedule.md` ("current-time
   line": wall-clock UTC conversion, per-segment linear interpolation, grid-row overlay
   instead of pixel measurement, minute + visibility refresh).

## Tests
- Unit: `computeNowLinePosition.test.ts`, `useWallClockNow.test.ts`, and a
  `StickyScrollGrid`-level case in an existing grid component test
  (e.g. `DanceScheduleGrid.test.tsx`): with `vi.setSystemTime` inside the visible
  range → `now-line` present with expected `gridRow` and `top` %; outside range or on
  another date → absent; advance fake timers 60s → `top` moves.
- E2E (`e2e/room-schedule.spec.ts`): `page.clock.install({ time })` at a local time
  inside a known `automated-testing` date/session, load Room Schedule → line visible
  and vertically between the two surrounding time labels' bounding boxes; a time
  outside the day's range → no line. One parallel smoke check on caller-schedule.

## Verification
- `pnpm typecheck && pnpm lint && pnpm test`
- `pnpm build && pnpm test:e2e`
- Manual: `pnpm dev`, use DevTools Sensors / temporarily set system time (or the e2e
  clock) to eyeball the line on Room / Dance / Caller pages, including after changing
  text size and on a phone-width viewport (split header/body scroll).
