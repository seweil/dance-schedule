# Sort dance-schedule columns correctly (room / level / caller)

## Context

The dance schedule has three column-based views — by room (`/dance-schedule`),
by level (`/dance-by-level`), by caller (`/dance-by-caller`) — and the user
wants each one's column order to follow an explicit rule instead of whatever
today's code happens to produce:

- **Level columns**: increasing difficulty, "Other" last.
- **Caller columns**: alphabetical by first name.
- **Room columns**: default to median dance-level per room (average as
  tiebreak), increasing difficulty — but overridable per event either by an
  explicit room list in `config.yaml`, or by opting back into today's
  spreadsheet-column-order behavior.

Investigation found the **level** requirement is already fully satisfied —
`getLevelSlots`/`LEVEL_ORDER` (`src/lib/levelOrder.ts`) are already increasing
difficulty, and `OTHER_LEVEL_SLOT` is always appended last
(`computeDanceScheduleLevelLayout.ts`), with existing test coverage
(`computeDanceScheduleLevelLayout.test.ts`) locking this in. **No code change
needed there.**

**Callers** currently order by first chronological appearance in the
spreadsheet (`deriveCallerOrder`, `computeDanceScheduleCallerLayout.ts`) —
needs to change to alphabetical-by-first-name.

**Rooms** currently always order by first chronological appearance
(`deriveRoomOrder`, `computeDanceScheduleLayout.ts`) — needs a new
median-level default, plus two config-driven overrides.

Confirmed with the user:
- A room with no leveled sessions at all (e.g. only freeform content) sorts
  **last**, in spreadsheet order, after every room that has at least one
  leveled session.
- An explicit `config.yaml` room-order override must name **every** room
  that appears anywhere in the event (across every date/sheet) — the build
  fails loudly if it's incomplete, has an unknown name, or a duplicate.

## Design

### Callers: alphabetical by first name

In `computeDanceScheduleCallerLayout.ts`, replace `deriveCallerOrder`'s
insertion-order dedup with a `Set` + sort keyed by first name
(`name.trim().split(/\s+/)[0]`), tiebroken by full-name `localeCompare` for
determinism when two callers share a first name. Update the function's doc
comment (it currently says it "mirrors `deriveRoomOrder`... first
appearance" — no longer true). No config option — this one's unconditional,
matching the user's request (only rooms need an override).

### Rooms: new `src/lib/deriveRoomOrder.ts` (extracted from `computeDanceScheduleLayout.ts`)

Extracting (not just editing in place) because this grows real branching
logic worth its own unit tests, mirroring this codebase's existing precedent
for pulling shared/nontrivial logic into its own `src/lib/*.ts` file
(`computeDanceScheduleTimeAxis.ts`, `assignLanes.ts`).

```ts
export type RoomOrderConfig = 'spreadsheet' | readonly string[] | undefined

// Today's existing logic, unchanged, renamed from the exported deriveRoomOrder.
function spreadsheetRoomOrder(dateSessions: DanceSession[]): string[]

// New: per room, every ordered-level LEVEL_ORDER index from every structured
// session located in that room (one entry per session-level pair — a session
// with 2 levels contributes 2 entries; a session spanning 2 rooms contributes
// to both rooms). Rooms with zero such entries get median/average = Infinity,
// which naturally sorts them last; among ties (including all-Infinity rooms),
// break by original spreadsheetRoomOrder position — keeps them internally in
// spreadsheet order per the confirmed behavior above.
function defaultRoomOrder(spreadsheetOrder: string[], dateSessions: DanceSession[]): string[]

export function deriveRoomOrder(dateSessions: DanceSession[], roomOrderConfig: RoomOrderConfig): string[] {
  const spreadsheetOrder = spreadsheetRoomOrder(dateSessions)
  if (roomOrderConfig === 'spreadsheet') return spreadsheetOrder
  if (Array.isArray(roomOrderConfig)) {
    // validateRoomOrderConfig (below) already guarantees this names every real
    // room — just filter to whichever ones are actually present today, in the
    // configured relative order.
    return roomOrderConfig.filter((room) => spreadsheetOrder.includes(room))
  }
  return defaultRoomOrder(spreadsheetOrder, dateSessions) // undefined → the new default
}

// Build-time-only cross-check: every room name that appears anywhere across
// ALL dates (not just one) must appear exactly once in an explicit
// roomOrderConfig array. Throws a fail-loud, named error (matching this
// repo's existing config-validation style in vite-plugin-content-config.ts/
// content-config.ts) listing missing/unknown/duplicate names. No-op when
// roomOrderConfig isn't an array.
export function validateRoomOrderConfig(
  allSessions: DanceSession[],
  roomOrderConfig: RoomOrderConfig,
  configFile: string,
): void
```

`computeDanceScheduleLayout.ts` drops its local `deriveRoomOrder`, imports
the new one, and gains a third parameter
(`roomOrderConfig: RoomOrderConfig`, optional — defaults to `undefined` so
most existing unit tests that don't care about room order don't need
touching) threaded straight into `deriveRoomOrder`.

### Config plumbing: `content/<set>/config.yaml`'s new `danceSchedule.roomOrder` key

Mirrors the existing `features.*` pattern end to end:

```yaml
danceSchedule:
  roomOrder: spreadsheet        # opt out of the new default, keep today's column order
  # — or —
  roomOrder: [Ballroom Centre, Ballroom East, Ballroom West, Drummond Ballroom]
```

Omit `danceSchedule` (or `roomOrder`) entirely → new median-level default.

- **`src/types/contentConfig.ts`**: add `DanceScheduleRoomOrder = 'spreadsheet' | readonly string[]`,
  `DanceScheduleConfig { roomOrder?: DanceScheduleRoomOrder }`, and an optional
  `danceSchedule?: DanceScheduleConfig` on `ContentConfigData`.
- **`vite-plugin-content-config.ts`**: add a `readRoomOrder` shape validator
  (mirrors `readBooleanFeatureFlag`) — `undefined` → `undefined`;
  `'spreadsheet'` → passthrough; array of strings → passthrough; anything
  else → throws. Wire into `loadContentConfigData`'s return. **Export**
  `loadContentConfigData` (currently private) — `vite-plugin-dance-schedule.ts`
  needs it for the cross-validation below, so there's one source of truth for
  the shape check rather than a second hand-rolled copy.
- **`vite-plugin-dance-schedule.ts`**: add a `contentDir` option (the content
  set's root, sibling of `dataDir` — same value `contentConfigPlugin` already
  gets). In `load()`, after building `buildDanceSchedule(sessions)` (already
  computed there for the markdown dump — reuse it, don't recompute), resolve
  `content/<set>/config.yaml`, call the now-exported `loadContentConfigData`,
  and call `validateRoomOrderConfig(builtSessions, config.danceSchedule?.roomOrder, configFile)`.
  Also watch that config file in `configureServer` (same invalidate + full-reload
  as the xlsx watch already does) so editing `config.yaml`'s room list during
  `pnpm dev` re-validates live.
- **`vite.config.ts`**: pass `contentDir: CONTENT_DIR` into `danceSchedulePlugin(...)`.
- **`src/components/DanceSchedulePage.tsx`**: pass
  `contentConfig.danceSchedule?.roomOrder` as `computeDanceScheduleLayout`'s
  third argument (and add it to the `useMemo` deps array).

No existing `content/*/config.yaml` needs edits — every set (including the
real `backtrack2abq` default and the `automated-testing`/`test` fixtures)
automatically gets the new median-level default by omission, which is the
intended outcome.

## Known ripple effects

- `computeDanceScheduleLayout.test.ts` has one test asserting today's
  first-appearance default (`'orders visible rooms by first chronological
  occurrence, not alphabetically'`) — its own fixture happens to give both
  rooms the same level, so it still passes numerically under the new
  median+tiebreak default, but its name no longer describes the real
  mechanism. Rewrite it into: (a) a real median-default test where two rooms
  have *different* levels, proving order follows level, not appearance; (b) a
  dedicated `roomOrderConfig: 'spreadsheet'` test reusing the old
  appearance-order scenario to lock in the opt-out. Add new tests for:
  average tiebreak on an even-count median tie, a no-level room sorting last,
  an explicit override list being filtered per-date, and
  `validateRoomOrderConfig`'s missing/unknown/duplicate-name error cases.
- `computeDanceScheduleCallerLayout.test.ts`: two existing tests assert
  chronological caller order (`'orders visible callers by first chronological
  occurrence, not alphabetically'` and `'hides a caller column once nothing in
  it is visible...'`) — the second one's expected order (`['Vic Ceder', 'Kris
  Jensen']`) actually flips under alphabetical-by-first-name (`['Kris Jensen',
  'Vic Ceder']`), a real behavior change, not just a rename. Update both
  expectations; skim the rest of the file for any other order-dependent
  assertion.
- Checked `e2e/dance-schedule.spec.ts` and `DanceScheduleGrid.test.tsx`: none
  hardcode a specific room name/order (they use `.first()`, counts, or
  explicitly-passed `visibleRooms` props), so the real fixture's reordering
  under the new default shouldn't break them — but `pnpm test`/`pnpm build &&
  pnpm test:e2e` will be the actual check.

## Docs to update (per CLAUDE.md's sync rule)

- `docs/design/dance-schedule.md`: rewrite the room-columns section's
  `deriveRoomOrder` description (new default + both overrides +
  build-time validation) and the caller-columns section's "Columns are
  data-derived, like rooms" + "No contiguous-span merge" paragraphs (drop the
  "mirrors deriveRoomOrder... first appearance" framing, describe
  alphabetical-by-first-name instead).
- `docs/design/content-config.md`: new "Decisions" entry for
  `danceSchedule.roomOrder`, matching the existing entries' style.
- `docs/adding-a-new-event.md`: new subsection under "Step 2" documenting the
  `danceSchedule.roomOrder` key (default, `spreadsheet` opt-out, explicit-list
  requirements and the fail-loud validation), same style as the existing
  `features`/`manifest` documentation there.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` after the code changes.
- `pnpm build` (exercises `validateRoomOrderConfig` for real against every
  content set's real data — this is the first real build-time check of this
  new validation) then `pnpm test:e2e` to confirm the real fixture's reordered
  room columns don't break any e2e assertion.
- Spot-check `pnpm dev` on `/dance-schedule` and `/dance-by-caller` to visually
  confirm the new column orders look right against real fixture data, and that
  editing `content/automated-testing/config.yaml` to add a deliberately
  incomplete `danceSchedule.roomOrder` list produces the expected fail-loud
  error (then revert it).
