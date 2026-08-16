# Persist the user-set level range separately from the per-day trimmed view

## Context

`useDanceScheduleFilters` (`src/hooks/useDanceScheduleFilters.ts`) drives the
skill-level range slider shared by the Dance Schedule, Room Schedule, and
Caller Schedule pages. It already trims the slider down to whatever levels are
actually scheduled on the selected day (`minPresentLevelIndex`/
`maxPresentLevelIndex`, via `getPresentLevelIndexRange` in
`src/lib/levelOrder.ts`) — e.g. a day with only Plus-level dancing doesn't show
dead SSD/A1/C4 ticks.

The bug: today that trimming **mutates the persisted state itself**. On a date
switch, an in-render adjustment (`prevPresentRange` in the hook) clamps
`minLevelIndex`/`maxLevelIndex` into the new day's present range and that
clamped value is what gets saved to `localStorage`. So if a user sets A2–C3 on
a day that has C3 sessions, then switches to a day that tops out at C2, the
range silently narrows to A2–C2 — and stays narrowed even after switching back
to the original day, because the wider original value was never retained
anywhere. The user's actual selection is lost, not just temporarily hidden.

The fix: separate "the range the user explicitly set" (persisted, stable)
from "the range currently effective/shown" (derived per day, never persisted).
Trimming for a narrow day becomes a pure view computation; returning to a day
where the original range fits shows the original range again.

## Approach

All changes are contained to **`src/hooks/useDanceScheduleFilters.ts`** — its
external return shape (`minLevelIndex`, `maxLevelIndex`, `setLevelRange`,
`minPresentLevelIndex`, `maxPresentLevelIndex`, etc.) stays identical, so
`DanceScheduleFilters.tsx` and the three page components
(`DanceSchedulePage.tsx`, `DanceScheduleLevelsPage.tsx`,
`DanceScheduleCallersPage.tsx`) need no changes — they already just pass these
values through, including their two `setLevelRange(...)` call sites (slider
drag/tick, and the "Show all levels" empty-state link), both of which are
genuine explicit user actions and should keep writing the persisted setting.

1. **Rename the underlying state to represent the setting, not the view.**
   Replace the `minLevelIndex`/`maxLevelIndex` `useState` pair with
   `userMinLevelIndex`/`userMaxLevelIndex`, initialized the same way as today
   (`resolveStoredLevelRange(initialStoredFilters, slots.length)`) but
   **without** clamping to the initial day's present range — that clamping
   moves to the derived view (next step). `resolveStoredLevelRange` already
   guards against indices invalid for the current slot count (e.g. after a
   `combineA1A2` toggle); that guard is unaffected.

2. **Derive the effective/view range with `useMemo`, don't mutate state.**
   ```ts
   const minLevelIndex = useMemo(
     () => clampLevelIndex(userMinLevelIndex, { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex }),
     [userMinLevelIndex, minPresentLevelIndex, maxPresentLevelIndex],
   )
   const maxLevelIndex = useMemo(
     () => clampLevelIndex(userMaxLevelIndex, { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex }),
     [userMaxLevelIndex, minPresentLevelIndex, maxPresentLevelIndex],
   )
   ```
   This entirely replaces the current `prevPresentRange` render-phase
   `setState` hack — no more comparing against the previous render's present
   range, no more re-render-before-commit dance. `clampLevelIndex` (already in
   `src/lib/levelOrder.ts`) is reused as-is.

3. **`setLevelRange(min, max)` writes the setting directly:**
   ```ts
   const setLevelRange = (min: number, max: number) => {
     setUserMinLevelIndex(min)
     setUserMaxLevelIndex(max)
   }
   ```
   Since the slider's own draggable bounds are already clamped to
   `[minPresentLevelIndex, maxPresentLevelIndex]` for the current day
   (`DanceScheduleFilters.tsx`'s `Slider.Root min/max`), a drag/tick on a
   narrow day naturally records a narrower setting — consistent with "if the
   user explicitly touches the control, that's what they set."

4. **Persist the setting, not the view:**
   ```ts
   useEffect(() => {
     saveDanceScheduleFilters({
       selectedDateISO: selectedDate.toISOString(),
       minLevelIndex: userMinLevelIndex,
       maxLevelIndex: userMaxLevelIndex,
       showGca,
     })
   }, [selectedDate, userMinLevelIndex, userMaxLevelIndex, showGca])
   ```
   `danceScheduleFiltersStorage.ts` needs no changes — it already just stores
   two numbers under `minLevelIndex`/`maxLevelIndex`; only *which* two numbers
   the hook feeds it changes.

5. **Leave the `trackEvent('dance_schedule_level_range', ...)` effect keyed on
   the exposed (view) `minLevelIndex`/`maxLevelIndex`** — unchanged, since the
   useful analytics signal is what's actually visible/filtering, not the
   underlying setting.

6. Update the comment block that currently explains the `prevPresentRange`
   render-phase trick to instead explain the derive-don't-mutate model and why
   returning to a wider day now restores the original range.

## Tests — `src/hooks/useDanceScheduleFilters.test.ts`

Existing tests in the `'per-day present level range'` describe block need no
behavioral changes (the exposed `minLevelIndex`/`maxLevelIndex` values are
still the clamped view, computed the same way) except lighter comment
updates. Add two new tests there, this is the actual regression coverage for
the bug:

- **Restores the original range after narrowing then returning to a day it
  fits.** Using the existing `ALL_SESSIONS` fixture (day1 has SSD and C4
  sessions, day2 has only SSD): explicitly `setLevelRange` to a range that
  includes day1's top end (e.g. `A2`–`C4`), confirm it holds; switch to day2
  (view narrows to SSD-only, since that's day2's only present level); switch
  back to day1; assert `minLevelIndex`/`maxLevelIndex` are back to the
  original `A2`–`C4` — not stuck at the day2-narrowed value, which is exactly
  the bug being fixed (today this test would fail: the old code mutates the
  stored range itself when narrowing, so it never recovers).
- **Persists the user-set range, not the narrowed per-day view.** Same setup:
  after switching to the narrow day (view visibly narrowed), read back
  `loadStoredDanceScheduleFilters()` (`src/lib/danceScheduleFiltersStorage.ts`,
  already used by its own test file) and assert the stored
  `minLevelIndex`/`maxLevelIndex` still match the original wide setting, not
  the day-narrowed view.

No changes needed to `danceScheduleFiltersStorage.ts`/its tests, `levelOrder.ts`
tests, `DanceScheduleFilters.tsx`, the three page components or their tests, or
`src/components/danceSchedulePageFilterContract.tsx` (doesn't exercise
date-switch/persistence interplay).

## Docs

Update `docs/design/dance-schedule.md`'s "Level slider and GCA checkbox scope
to the selected date's present levels" section (~line 862) — specifically the
bullet describing the reclamp-on-date-switch effect (~lines 893–900) — to
describe the new persisted-setting-vs-derived-view split instead of the
render-phase mutation it's replacing, and note that this is what makes
returning to a wider day restore the original range.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — must pass, including the two
  new hook tests (which should fail against the current code and pass after
  the fix — worth confirming that red/green transition while implementing).
- Manual spot check with `pnpm dev` (or `pnpm dev:test`, whose fixture data has
  varying per-day level ranges): set a wide range on a day with a high top
  level, switch to a narrower day, confirm the slider visibly trims, switch
  back, confirm the slider is back to the original wide range.
