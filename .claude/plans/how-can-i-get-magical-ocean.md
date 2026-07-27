# Content-folder configuration: default content set + per-event feature flags

## Context

Two related needs came up together: (1) which content set (`content/<set>/`)
loads by default should be configurable, instead of hardcoded to `'real'` in
`vite.config.ts`; (2) individual real events (content sets) sometimes want
the dance-schedule level slider to treat A1 and A2 as one combined stop —
per the user, many events have too few A1-only dances to bother
distinguishing, but some events do want them separate. That second point is
the key design driver: **this is a per-event (per-content-set) setting, not
a single global toggle** — different content sets need different values.

This splits into two genuinely different kinds of config, at two different
scopes:

- **Which content set to use by default** — must live *outside* any
  particular content set (it's what picks one), and is consumed purely at
  build time in Node (`vite.config.ts`), never shipped to the client.
- **Per-event feature flags** (starting with "combine A1/A2 on the slider")
  — live *inside* each content set's own directory (alongside its
  `pages/`/`data/`), and must reach client-side React code (the level
  slider), so — per this repo's established pattern
  (`vite-plugin-schedule.ts`/`vite-plugin-dance-schedule.ts`) — need a
  build-time Vite plugin exposing a `virtual:*` module, not a raw runtime
  file read (Node `fs` isn't available in the browser bundle).

YAML, per the user's suggestion — no YAML library exists in this repo yet
(confirmed); adding `yaml` (the same package Vite itself already optionally
depends on) as a **devDependency** (parsing only ever happens in Node/build
context, never bundled to the client — same category as `read-excel-file`).

This also happens to close two items already logged as open questions in
`docs/design/content-sets.md` ("should content-set resolution validate the
target directory exists" / discoverability) — the new top-level loader
validates `defaultContentSet` (and any `CONTENT_SET` env override) against
real `content/<name>/` directories and fails loudly if not, rather than
letting `vite-plugin-pages`/`read-excel-file` produce a raw ENOENT.

## File layout

```
content/
  config.yaml              # NEW — top-level, shared, chooses the default set
    defaultContentSet: real

  real/
    config.yaml             # NEW — per-set feature flags
      features:
        combineA1A2: false
    pages/...
    data/...

  test/
    config.yaml
      features:
        combineA1A2: true   # exercises the merged-slot behavior in the fixture
    pages/...
    data/...
```

Missing `content/config.yaml` → falls back to `defaultContentSet: real`
(today's hardcoded behavior, unchanged). Missing per-set `config.yaml` →
falls back to `features: { combineA1A2: false }` (today's UI, unchanged).
Malformed YAML, or a value of the wrong type/shape, in either file → fails
the build loudly with a clear message, consistent with this repo's existing
fail-loud parsing philosophy (`docs/design/schedule-page.md`).

## Change 1: top-level `defaultContentSet`

- **New `content-config.ts`** (repo root, alongside `vite-plugin-schedule.ts`)
  — a small, pure, synchronous Node function
  `loadTopLevelContentConfig(root: string): { defaultContentSet: string }`.
  Reads `content/config.yaml` via `fs.readFileSync` + `yaml.parse`; validates
  `defaultContentSet` is a string naming a real `content/<name>/` directory
  (`fs.existsSync`), throwing a clear error if not (e.g. `content/config.yaml
  names defaultContentSet "spring" but content/spring/ doesn't exist`).
  Colocated `content-config.test.ts` (pure function — easy to test against
  fixture strings/temp paths, no Vite machinery needed).
- **`vite.config.ts`** — replace the hardcoded fallback:
  ```ts
  const contentConfig = loadTopLevelContentConfig(process.cwd())
  const CONTENT_SET = process.env.CONTENT_SET || contentConfig.defaultContentSet
  ```
  Also validate an explicit `CONTENT_SET` env override the same way (same
  "does `content/<name>/` exist" check) — closes the open question fully,
  not just for the default case.

## Change 2: per-set feature flags reaching the client

- **New `vite-plugin-content-config.ts`** (repo root) — mirrors
  `vite-plugin-schedule.ts` exactly: `CONTENT_CONFIG_VIRTUAL_MODULE_ID =
  'virtual:content-config'`, `\0`-prefixed resolved id, `{ dataDir: string }`
  options (same shape as `schedulePlugin`/`danceSchedulePlugin`, reusing
  `CONTENT_DIR` from `vite.config.ts`), path resolved eagerly then corrected
  in `configResolved`, `load()` reads `${dataDir}/config.yaml` (note:
  `dataDir` here is the content-set root, e.g. `content/real`, not
  `content/real/data` — distinct from the schedule plugins' data dir),
  parses with `yaml`, returns `export default ${JSON.stringify(data)}`.
  Dev-watching via `configureServer` + `server.watcher.add` + change
  listener + `moduleGraph.invalidateModule` + full-reload — identical
  mechanism to the existing plugins. Missing file → default
  `{ features: { combineA1A2: false } }`; malformed/wrong-shaped → throws.
- **New `src/types/virtual-content-config.d.ts`** — ambient declaration
  mirroring `virtual-dance-schedule.d.ts`.
- **`vite.config.ts`** — register
  `contentConfigPlugin({ dataDir: CONTENT_DIR })` alongside the existing
  `schedulePlugin`/`danceSchedulePlugin` registrations.

## Change 3: "combine A1/A2" — a real behavioral merge in the slider

Today every slider position maps 1:1 to exactly one `LEVEL_ORDER` entry, and
every downstream piece (`isSessionInLevelRange`, `DanceScheduleFilters`'
tick rendering/click handling, `moveNearestThumb`) is keyed on that raw
array index — confirmed via research, there's no indirection layer to hook
into today. Combining A1/A2 means a single slider position now represents
*two* level codes, so this introduces a **slot** concept:

- **`src/lib/levelOrder.ts`** — add:
  ```ts
  export interface LevelSlot {
    label: string
    levels: readonly OrderedLevelCode[] // one level normally; two when combined
  }

  export function getLevelSlots(combineA1A2: boolean): readonly LevelSlot[] {
    // combineA1A2 === false: same 10 slots as today, one level each.
    // combineA1A2 === true: 9 slots — A1 and A2's two separate slots become
    // one { label: 'A1/A2', levels: ['A1', 'A2'] } slot in their place.
  }
  ```
  Keep `LEVEL_ORDER` itself unchanged (still the canonical base ordering;
  `getLevelSlots(false)` is just derived from it). Rewrite
  `isSessionInLevelRange` to accept `slots: readonly LevelSlot[]` instead of
  closing over `LEVEL_ORDER` directly — for each of a session's levels, find
  which slot's `.levels` contains it (not a direct `indexOf`), then the
  existing "any level's slot-index falls in `[min, max]`" logic is
  unchanged. This is the one true behavioral core of the feature: a session
  tagged only `A1`, only `A2`, or both, all resolve to the *same* slot index
  when combined, so all three match identically against the range — a real
  merge, not just a relabel.
- **`src/lib/filterDanceSessions.ts`** — add a `slots` parameter, threaded
  through to `isSessionInLevelRange`.
- **`src/hooks/useDanceScheduleFilters.ts`** — accept `combineA1A2: boolean`,
  compute `slots = getLevelSlots(combineA1A2)` once, use `slots.length` (not
  `LEVEL_ORDER.length`) for the initial full-range default, pass `slots`
  through to `filterDanceSessions` and out to the caller (replacing the
  page's/filter component's own `LEVEL_ORDER` import).
- **`src/components/DanceScheduleFilters.tsx`** — take `slots` as a prop
  instead of importing `LEVEL_ORDER` directly; tick rendering/positioning
  math (`fraction = index / (slots.length - 1)`) and `Slider.Root`'s
  `max={slots.length - 1}` use `slots.length`; each tick's label is
  `slot.label` (so the combined tick reads "A1/A2"). `moveNearestThumb`
  itself needs no change — it already operates on plain indices, agnostic
  to what they represent.
- **`src/components/DanceSchedulePage.tsx`** — import `virtual:content-config`
  (mirroring its existing `virtual:dance-schedule` import), extract
  `features.combineA1A2`, pass into `useDanceScheduleFilters`.

## Test/doc updates

- `content-config.test.ts` (new) — the top-level loader: default when
  missing, parses a real file, throws on bad YAML, throws when
  `defaultContentSet` names a nonexistent directory.
- A colocated test for `vite-plugin-content-config.ts`'s data-loading
  function (mirroring how `vite-plugin-schedule.ts`/
  `vite-plugin-dance-schedule.ts` structure their own tests, if any exist
  for those — check during implementation and match precedent) or, if
  those plugins aren't unit-tested directly, cover it live via
  `pnpm build`/`pnpm dev:test` instead, consistent with precedent.
- `src/lib/levelOrder.test.ts` — new tests for `getLevelSlots(false)`
  (matches today's 10 single-level slots) and `getLevelSlots(true)` (9
  slots, the merged `A1/A2` entry); update `isSessionInLevelRange`'s
  existing tests to pass slots; add cases proving an A1-only, A2-only, and
  both-tagged session all match identically against the combined slot.
- `src/lib/filterDanceSessions.test.ts`, `useDanceScheduleFilters.test.ts` —
  update call sites for the new `slots`/`combineA1A2` parameters.
- `src/components/DanceScheduleFilters.test.tsx` — per research, these
  currently hardcode `LEVEL_ORDER` iteration and magic indices (`9`, `5`,
  `4`); update the render helper to take a `slots` prop, fix hardcoded
  indices to derive from whichever `slots` value each test uses, and add
  new cases for the combined-slot render (9 ticks, "A1/A2" label, clicking
  it, and — importantly — that the *filtering* callback reflects the merged
  index).
- `e2e/dance-schedule.spec.ts` — the two tests hardcoding `9`/`5` (tied to
  today's 10-level, `combineA1A2: false` default for the `real` content set)
  need no change *if* `real`'s new `config.yaml` sets `combineA1A2: false`
  (preserving current behavior exactly) — confirm this holds since
  Playwright's `webServer` always builds the default (`real`) content set.
  No new e2e coverage for the combined-slot case is planned (would need a
  second Playwright project pointed at a `CONTENT_SET=test`-like build,
  overengineering for this) — covered by unit tests instead, plus a manual
  live-browser check against `pnpm build:test && pnpm preview` during
  implementation (mirrors how `content/test/`'s `combineA1A2: true` gets
  exercised).
- `docs/design/content-sets.md` — add a Decisions entry for the new
  top-level `content/config.yaml` / `defaultContentSet` mechanism, and mark
  the "should content-set resolution validate the target directory exists"
  open question resolved.
- New `docs/design/content-config.md` — the general config-file mechanism
  (both changes above), why two separate files/scopes exist, the YAML
  choice, fail-loud/fallback behavior. Cross-links to
  `docs/design/content-sets.md` (for `defaultContentSet`) and
  `docs/design/dance-schedule.md` (for the `LevelSlot` concept, which
  extends that doc's existing level-code design decisions — add a short
  Decisions entry there too pointing at the new doc rather than duplicating
  detail).

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — full unit suite including all
  new/updated tests above.
- `pnpm build` (default `real` content set) — confirm it still builds with
  `content/real/config.yaml`'s `combineA1A2: false`, and that
  `defaultContentSet` resolution from `content/config.yaml` works with no
  `CONTENT_SET` env var set.
- `pnpm build:test` (or `CONTENT_SET=test pnpm build`) then `pnpm preview` —
  live-verify via `claude-in-chrome`: the level slider shows 9 ticks with a
  combined "A1/A2" label, clicking/dragging it filters sessions tagged
  either A1, A2, or both identically, and the tick math (position, no
  overlap) still holds with one fewer slot — reuse the same live-measurement
  approach (comparing `getBoundingClientRect()` against expected thumb
  positions) established for the original tick-mark work.
- Temporarily rename/corrupt `content/config.yaml` and
  `content/real/config.yaml` to confirm the fail-loud/fallback behavior
  each actually triggers as designed (missing → default; malformed → clear
  thrown error), then restore.
- `pnpm test:e2e` outside this sandbox (Playwright can't launch here,
  confirmed in earlier sessions) — confirm the two previously-hardcoded
  tests still pass unchanged against the `real` content set's
  `combineA1A2: false`.
