# Day-scoped level slider & GCA checkbox

## Context

MotivateToSeattle's registration levels start at A2 (`combineA1A2: true`, `combineC3BC4: true` in its `config.yaml`, with an explicit comment that there are "no SSD/MS/Plus/A1 sessions at all"). The dance-schedule filter row's level slider always spans the full fixed taxonomy (SSD, MS, Plus, A1/A2, C1, C2, C3A, C3B+ — 8 stops with both merge flags on), so 3 of those 8 stops (SSD, MS, Plus — 37.5% of the slider's travel) are permanently dead for this event, every single day. Separately, the "Show GCA callers" checkbox is currently rendered unconditionally, but `dance-schedule-dump.md` confirms the `GCA` column is blank on every row of this event's data — the checkbox does nothing for MotivateToSeattle.

Goal: make both controls reflect what's actually scheduled **for the currently selected day**, while keeping the filter row's hand-tuned layout (documented at length in `DanceScheduleFilters.module.css`) ergonomic and visually balanced. This is investigated and designed already (two Explore passes + a Plan-agent critique); this plan is execution-ready.

**Design shape:** don't touch `slots`/`getLevelSlots` (the fixed, config-driven index space everything else depends on) — instead compute a per-day *present sub-range* within that same stable index space, and use it to narrow the Radix slider's actual `min`/`max` (dead-end trim only, not internal gaps) and to gate the GCA checkbox's visibility. This mirrors the codebase's existing two-layer pattern for the caller-columns view (stable event-wide `callerOrder`/eligibility + per-date visibility) rather than repeating the `MIN_CALLER_HOURS` instability bug that pattern was built to fix — here there's no stability requirement to violate, since both features are explicitly meant to react to the selected day.

Internal gaps (a day missing one level in the middle of an otherwise-present range) are deliberately NOT trimmed — only the dead ends. Real data never exercises the gap case, and `docs/design/dance-schedule.md`'s Open Questions section already has a precedent for punting an analogous compound case as "simplified rather than fully general... never observed in real data."

## Implementation

### 1. `src/lib/levelOrder.ts` — new helper

Add near `isSessionInLevelRange`:

```ts
export function getPresentLevelIndexRange(
  sessions: readonly DanceSession[],
  slots: readonly LevelSlot[],
): { minIndex: number; maxIndex: number } {
  let minIndex: number | undefined
  let maxIndex: number | undefined
  for (const session of sessions) {
    if (session.kind !== 'structured') continue
    for (const level of session.levels) {
      if (!isOrderedLevel(level)) continue
      const index = slots.findIndex((slot) => slot.levels.includes(level))
      if (index === -1) continue
      if (minIndex === undefined || index < minIndex) minIndex = index
      if (maxIndex === undefined || index > maxIndex) maxIndex = index
    }
  }
  return minIndex === undefined || maxIndex === undefined
    ? { minIndex: 0, maxIndex: slots.length - 1 }
    : { minIndex, maxIndex }
}

export function clampLevelIndex(value: number, range: { minIndex: number; maxIndex: number }): number {
  return Math.min(Math.max(value, range.minIndex), range.maxIndex)
}
```

Falls back to the full range when a day has no ordered-level sessions (all Various/Intro/freeform) — avoids an all-dead slider. Doc comment should note it deliberately doesn't special-case internal gaps (cite the Open Questions precedent) and that callers are responsible for date-scoping `sessions` first, mirroring `isSessionInLevelRange`'s own division of responsibility.

**Tests** (`src/lib/levelOrder.test.ts`, new `describe('getPresentLevelIndexRange', ...)`): single ordered level → min===max at that slot's index; multiple sessions spanning a sub-range → correct min/max; day with only unordered levels or only freeform sessions → full-range fallback; mixed ordered+unordered → unordered ignored; empty sessions → full-range fallback; with `combineA1A2`/`combineC3BC4` slots, an A2-only session resolves to the merged "A1/A2" slot index, not `LEVEL_ORDER.indexOf('A2')`.

### 2. `src/hooks/useDanceScheduleFilters.ts`

Reorder so `dateSessions` is computed before the level-index state (it currently comes after). Then:

- `const { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex } = useMemo(() => getPresentLevelIndexRange(dateSessions, slots), [dateSessions, slots])` (or two separate memoized values — keep it simple).
- Initial `minLevelIndex`/`maxLevelIndex` state: after computing `resolveStoredLevelRange(initialStoredFilters, slots.length)` as today, clamp the result through `clampLevelIndex` against the initial day's present range — computed synchronously in the same render (hooks execute top-to-bottom), so there's no first-paint flash of an untrimmed range.
- New effect, keyed on the **primitive** bounds (not an object, to match this hook's flat-field style and avoid identity churn):
  ```ts
  useEffect(() => {
    setMinLevelIndex((prev) => clampLevelIndex(prev, { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex }))
    setMaxLevelIndex((prev) => clampLevelIndex(prev, { minIndex: minPresentLevelIndex, maxIndex: maxPresentLevelIndex }))
  }, [minPresentLevelIndex, maxPresentLevelIndex])
  ```
  Fires on date switches (and harmlessly on mount) but NOT on manual `setLevelRange` calls, since its deps are only the present-range bounds — so it re-scopes across day switches without fighting the user's own in-day slider drags. Note in a comment: this can cause one redundant localStorage write on a date switch (persistence effect fires once before the clamp lands, once after) — harmless, not worth engineering around.
- Add `hasGcaOnSelectedDate = useMemo(() => dateSessions.some((s) => s.kind === 'structured' && !!s.gca), [dateSessions])`.
- Return `minPresentLevelIndex`, `maxPresentLevelIndex`, `hasGcaOnSelectedDate` as new flat fields on `UseDanceScheduleFiltersResult`.

**Tests** (`src/hooks/useDanceScheduleFilters.test.ts`): existing 7 tests pass unchanged — hand-traced (and independently re-verified) that `day1Session`(SSD) + `day1AdvancedSession`(C4) together span the full range on day1 in every combine-flag scenario tested. Add:
- A day whose *earliest* date only has a narrow-range session (e.g. a new `day0Session` before `day1Session`, `levels: ['Plus']` only) → assert `minLevelIndex === maxLevelIndex === LEVEL_ORDER.indexOf('Plus')` at mount (proves the synchronous initial clamp).
- Switch to `day2Session`'s date (`levels: ['SSD']` only) from day1 (full range) → assert both indices collapse to `LEVEL_ORDER.indexOf('SSD')` (proves the effect re-scopes on switch, including the degenerate single-index case).
- `hasGcaOnSelectedDate`: add `gca: 'Some Caller'` to one day1 session, assert `true` on day1 / `false` on day2 (no gca in that fixture), re-check after `setSelectedDate`.

### 3. `src/components/DanceScheduleFilters.tsx`

- New required props: `minPresentLevelIndex: number`, `maxPresentLevelIndex: number`, `hasGcaOnSelectedDate: boolean`.
- `Slider.Root`: `min={minPresentLevelIndex}`, `max={maxPresentLevelIndex}` (was `0`/`slots.length - 1`).
- Ticks: filter `slots` (with index) to `index >= minPresentLevelIndex && index <= maxPresentLevelIndex` before mapping — don't map-then-return-null (avoids a hole in the key list). `onClick` still calls `moveNearestThumb(index, ...)` with the real, unshifted index — no change to `moveNearestThumb.ts`.
- `fraction` and `maxLevelFieldWidthPx`: recompute relative to `[minPresentLevelIndex, maxPresentLevelIndex]` instead of `[0, slots.length - 1]`, each guarded against a degenerate single-slot day (`maxPresentLevelIndex === minPresentLevelIndex`): `fraction = range > 0 ? (index - min) / range : 0.5`; width uses `Math.max(maxPresentLevelIndex - minPresentLevelIndex, 1) * MAX_TICK_GAP_PX + LEVEL_FIELD_FIXED_INSET_PX` so a single-tick day doesn't collapse the field to just its inset.
- GCA checkbox: wrap the existing `<label className={styles.checkboxField}>` block in `{hasGcaOnSelectedDate && (...)}`.
- No CSS changes needed in `DanceScheduleFilters.module.css` — confirmed `.dateGcaRow` (`display: flex; gap: var(--space-md)`, no `justify-content` override) degrades gracefully to one child (CSS `gap` only inserts space *between* rendered children), and `.levelField`'s width/margin formula is unchanged in shape, just fed different live inputs.

**Tests** (`src/components/DanceScheduleFilters.test.tsx`): fix `renderFilters()`'s defaults to derive from the *effective* slots, not a fixed constant — otherwise the existing "combined slots" describe blocks (which override `slots` to a 9-entry array but not the new props) get `maxPresentLevelIndex` one past the end:
  ```ts
  const slots = overrides.slots ?? BASE_SLOTS
  // ...
  minPresentLevelIndex: 0,
  maxPresentLevelIndex: slots.length - 1,
  hasGcaOnSelectedDate: true,
  ...overrides,
  ```
  Add: fewer ticks render when present bounds are a strict subset (assert exact count + which labels are present/absent); Radix's rendered `min`/`max` (via thumbs' `aria-valuemin`/`aria-valuemax`) reflect the narrowed props; GCA checkbox absent when `hasGcaOnSelectedDate={false}`, present when `true`. Existing combined-slots tests pass unchanged once the helper default is fixed.

### 4. Three page components

`src/pages/DanceSchedulePage.tsx`, `DanceScheduleLevelsPage.tsx`, `DanceScheduleCallersPage.tsx` — identical change in all three, keeping them byte-identical per existing convention:
- Destructure `minPresentLevelIndex`, `maxPresentLevelIndex`, `hasGcaOnSelectedDate` from `useDanceScheduleFilters(...)` and pass them into `<DanceScheduleFilters>`.
- Change `onShowAllLevels={() => setLevelRange(0, slots.length - 1)}` → `onShowAllLevels={() => setLevelRange(minPresentLevelIndex, maxPresentLevelIndex)}`. This is required, not cosmetic: once Radix's own `min`/`max` no longer extend to `0`/`slots.length - 1`, the old call would set state outside the slider's own enforced bounds.

`src/components/danceSchedulePageFilterContract.tsx`: no changes needed — the `automated-testing` fixture's default (earliest) date already has a full present range, so existing shared assertions (column count, the 7-ArrowRight level-narrowing test, GCA toggle) are unaffected.

### 5. `docs/design/dance-schedule.md`

Add a new decision entry (after the "Level-columns view" section, near the two merge-flag decisions) — "Level slider and GCA checkbox scope to the selected date's present levels":
- Why: the MotivateToSeattle report (dead slider ends, inert GCA checkbox).
- The two-layer shape (stable `slots` index space, unchanged, + per-date `presentLevelRange`/`hasGcaOnSelectedDate`), explicitly drawn as parallel to the caller-columns view's `callerOrder`/eligibility-vs-visibility split — not a repeat of the `MIN_CALLER_HOURS` instability bug, since neither new feature has a stability requirement to violate.
- Explicit statement that internal gaps aren't trimmed, citing the existing Open Questions precedent.
- Note this doesn't touch `getLevelSlots`/`LevelSlot`/combine-flag interaction at all.

`docs/adding-a-new-event.md`: no changes — fully derived from existing spreadsheet data, no new authoring syntax.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` (covers the new/updated unit and component tests above).
- `pnpm dev` (or `CONTENT_SET=MotivateToSeattle pnpm dev`) and visually check the filter row on a MotivateToSeattle date: slider should span only A1/A2 through C3B+ (SSD/MS/Plus stops gone), field width/tick spacing still balanced (no dead whitespace), GCA checkbox absent on every day. Switch content sets (e.g. `automated-testing`, which does have GCA data on some day) to confirm the checkbox still appears there and the slider still spans its full real range.
- Check a date switch within MotivateToSeattle doesn't visibly jump/flicker the slider, and that "Show all levels" (if reachable — an empty-state link) resets within the new trimmed bounds rather than snapping to the old absolute full range.
- `pnpm build && pnpm test:e2e` if the Playwright dance-schedule spec exercises the slider's tick count or GCA checkbox presence (check `e2e/dance-schedule.spec.ts` for assertions tied to fixed tick counts against the `automated-testing` fixture, since those should be unaffected but are worth confirming green).
