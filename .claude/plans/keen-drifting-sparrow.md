# Widen `test` content set's visual variety + dev-only config-preview env vars

## Context

Requirements coverage recently landed (room/level/caller column sorting),
but review surfaced that the fixture data used for *visual* review is
thin: every caller/room name in `content/test/` is a uniform "Test Caller
N"/"Test Room X" pattern, with no accented characters, no unusually long
or short names, and no long description text — so a reviewer can't
actually eyeball how the grid handles those cases. Separately, `config.yaml`
is one-value-per-content-set, so previewing e.g. `combineA1A2: false` or
`danceSchedule.roomOrder: spreadsheet` today means hand-editing a set's
`config.yaml` and reverting afterward — the same ad hoc practice already
used (and discarded) for prior line-clamp visual checks.

Investigation (two Explore passes) established:
- **`content/test/` is the correct home for this**, not `automated-testing`.
  `automated-testing` is pinned by many literal-string unit/e2e assertions
  (exact caller/room names, page headings, nav labels) and must stay
  stable. `content/test/` is already documented as "deliberately
  edge-case-flavored" and is only touched by one e2e test
  (`e2e/content-sets.spec.ts`), which asserts just the `# TEST CONTENT SET`
  heading and that the Dance Schedule nav link/page renders — not any of
  its actual session/room/caller content. So `content/test/`'s data is
  fully free to extend.
- **No config-override mechanism exists today** — `CONTENT_SET` only picks
  *which* `config.yaml` is read, never overrides an individual field. No
  `.env`/`import.meta.env` custom vars are used anywhere in this repo.
- User's decision: add **dev-only env-var overrides** for the two
  dance-schedule-relevant config knobs (combine flags, room order),
  mirroring this repo's existing `CONTENT_SET`/`BASE_PATH` env-var pattern,
  rather than spinning up extra content-set directories (which would add
  real entries to production's `pnpm build` and the `/events` landing
  page).
- `scripts/edit-test-data.mjs` already exists as the designated, reusable
  tool for exactly this kind of durable enrichment of
  `content/test/data/dance-schedule.xlsx` (its own header comment: "run
  again with a new `additions` entry any time a new edge case needs a
  visual home").

This is **visual-review-only, per explicit instruction — no new automated
tests, no changes to any `*.test.ts(x)`/`e2e/*.spec.ts` file.**

## Part 1: Widen `content/test`'s visual variety

Extend `scripts/edit-test-data.mjs`'s `additions` array (append entries,
keep the one existing "Long Workshop" entry) with new rows covering the
gaps found. Concrete, illustrative set (adjustable during implementation,
but this is the intended coverage):

- **Accented/non-ASCII caller names** — e.g. `François Côté` (ç, ô) and
  `Björn Åström` (ö, å), each on an ordinary short session, so accent
  rendering is visible in isolation from any other edge case.
- **A very long caller name, plain ASCII** — e.g.
  `Alexander Bartholomew Fitzgerald-Montgomery`, isolating "long" from
  "accented" so the two effects are visually distinguishable.
- **A very short, single-word caller name** — e.g. `Zed` — checks the
  caller-column view's minimum-width layout doesn't look broken, and
  (nice side effect) gives a visually obvious first-letter check of the
  alphabetical-by-first-name caller ordering already implemented.
- **A long room name and a short room name** — e.g.
  `The Grand Overflow Annex Ballroom` (new column) and `Gym` (new column)
  — checks column-header wrapping/truncation at both extremes, and lets a
  reviewer sanity-check the median-room-order feature still looks right
  with more varied name lengths.
- **A long details/description line** — e.g. a session whose type reads
  something like `Advanced Choreography Workshop: Exploring Symmetric and
  Asymmetric Formations in Contemporary Western Square Dance Technique`,
  to exercise the card's 4-line-clamp truncation for real (previously only
  checked via temporary edits that got reverted, per
  `docs/design/dance-schedule.md`'s own history).
- **A 3-caller co-taught session** — e.g.
  `Test Caller One & Test Caller Two & Zed` — the caller-column view only
  has 2-caller co-teach coverage today; this exercises the per-caller
  placement fan-out with a third.
- **A long/accented `GCA:` name** on one session (reuse `François Côté` in
  the GCA slot on a different session) — checks the `.gca` line's own
  clamp/rendering, not just `.details`.
- **A long-named caller in a room-spanning session** (ditto mark or
  `ROOMS:` line, reusing `Alexander Bartholomew Fitzgerald-Montgomery`) —
  checks how a wide merged card handles long text, not just a normal
  single-room one.

Update `content/test/pages/2 edge-cases.md`'s existing bullet-list catalog
to document each new case, matching its current style exactly (it's the
living index of what this fixture deliberately covers).

Light secondary touch to `content/test/data/event-schedule.xlsx` (the
flat Schedule page, separate from the dance grid): one row with a long
Description, one with a short one, one with an accented
Description/Location — done as a short one-off ExcelJS edit (not a new
permanent script, unlike the matrix-format dance-schedule.xlsx — this
file's edits aren't the kind that recur the way room/session additions
do).

No changes to `content/automated-testing/` at all.

## Part 2: Dev-only env-var overrides for config.yaml preview

Add override support inside `loadContentConfigData`
(`vite-plugin-content-config.ts`) — the one function already shared by
both the client-shipped `virtual:content-config` module *and*
`vite-plugin-dance-schedule.ts`'s `validateRoomOrderConfig` build-time
cross-check, so overriding here keeps both consistent automatically
without touching either caller.

New env vars, read via plain `process.env` (mirrors this repo's existing
`CONTENT_SET`/`BASE_PATH` pattern — no dotenv/`import.meta.env` introduced):

- `COMBINE_A1A2` — `"true"`/`"false"`, overrides `features.combineA1A2`.
- `COMBINE_C3BC4` — `"true"`/`"false"`, overrides `features.combineC3BC4`.
- `DANCE_SCHEDULE_ROOM_ORDER` — `"default"` (forces the median algorithm
  even if the active set's `config.yaml` sets something else),
  `"spreadsheet"`, or a comma-separated room list (e.g.
  `"Test Room A,Test Room B"`, split/trimmed into a `string[]`) — overrides
  `danceSchedule.roomOrder`.

Any set/non-empty value that doesn't match one of these shapes throws a
fail-loud error naming the env var and the value received, matching this
file's existing `readBooleanFeatureFlag`/`readRoomOrder` validation style.
Unset (the default) → no override, today's config.yaml-driven behavior is
unchanged — this must remain byte-for-byte backward compatible for every
existing `pnpm build`/`pnpm test`/`pnpm test:e2e` invocation, none of which
set these vars.

Example usage once implemented:
```
COMBINE_A1A2=false DANCE_SCHEDULE_ROOM_ORDER=spreadsheet pnpm dev:test
```

Document as a new "Decisions" entry in `docs/design/content-config.md`
(why dev-only, why it lives in the shared `loadContentConfigData` rather
than duplicated per call site), plus a short practical usage note
alongside wherever this repo already documents dev commands (check
`docs/testing.md`'s structure first; fall back to `CLAUDE.md`'s Commands
section if that doc doesn't fit).

## Files touched

- `scripts/edit-test-data.mjs` (extended `additions` array)
- `content/test/data/dance-schedule.xlsx` (via running the script)
- `content/test/data/event-schedule.xlsx` (small direct edit)
- `content/test/pages/2 edge-cases.md`
- `vite-plugin-content-config.ts`
- `docs/design/content-config.md` (+ a short usage note in `docs/testing.md` or `CLAUDE.md`)

No `*.test.ts(x)` or `e2e/*.spec.ts` files touched.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — confirms the env-var
  override code compiles/lints and that leaving every var unset doesn't
  change any existing test's outcome (none of them set these vars).
- `pnpm build` — confirms every real content set (which also never sets
  these vars) still builds identically.
- **Visual-only, per explicit instruction — no new automated test
  asserts any of this:**
  - `pnpm dev:test`, browse `/dance-schedule`, `/dance-by-level`,
    `/dance-by-caller`, and the Schedule page — eyeball the new
    accented/long/short/merged/3-caller cases render sensibly (no broken
    layout, no mojibake, clamps truncate as expected).
  - Re-run with each override combo, e.g.
    `COMBINE_A1A2=false pnpm dev:test` and
    `DANCE_SCHEDULE_ROOM_ORDER=spreadsheet pnpm dev:test`, confirming the
    override actually takes effect and that an unset var still falls back
    to `content/test/config.yaml`'s own value.
