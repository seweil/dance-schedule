# Multiple content sets (real / test / future events)

## Context

Today there is exactly one schedule data source (`data/event-schedule.xlsx`,
`data/dance-schedule.xlsx`) and one set of content pages (`content/pages/`).
Two needs have come up together:

1. A genuinely independent **test fixture** — distinct schedule data *and*
   distinct content pages, not a placeholder — so the app can be exercised
   against deliberately edge-case-y data without touching the real event.
2. Support for **several real events under active development at once**
   (the user's words: "so I can have several actual events under development
   at the same time"). So this isn't just a real/test toggle — it needs to
   generalize to any number of named content bundles.

Both needs are the same underlying problem: point the app at one of several
self-contained bundles of pages + schedule data, chosen at build time. The
fix is to move `data/` under `content/`, split into one subdirectory per
named **content set** (`content/<set>/pages/` + `content/<set>/data/`), and
select the active one via an env var read in `vite.config.ts`.

## Approach

### 1. Folder layout

```
content/
  real/            # default/production set (today's content, just moved)
    pages/         # today's content/pages/*.md + assets/
    data/          # today's data/*.xlsx + dance-schedule-dump.md
  test/            # new, deliberately edge-case-flavored fixture set
    pages/
    data/
  <anything>/      # any directory name works as its own content set
```

Move with history preserved:
```bash
git mv content/pages content/real/pages
git mv data content/real/data
```

### 2. Selection mechanism: `CONTENT_SET` env var

Read directly via `process.env.CONTENT_SET` at the top of `vite.config.ts`
(no `.env` files exist in this repo today, and none are needed — this is a
Node-context, build-time-only switch, never exposed to the client bundle).
Defaults to `"real"` when unset, so `pnpm dev` / `pnpm build` / `pnpm preview`
/ `pnpm test:e2e` all behave exactly as they do today with zero args.

```ts
const CONTENT_SET = process.env.CONTENT_SET || 'real'
const CONTENT_DIR = `content/${CONTENT_SET}`
```

Wire `CONTENT_DIR` into three places in `vite.config.ts`:
- `Pages({ dirs: [{ dir: `${CONTENT_DIR}/pages`, baseRoute: '' }, { dir: 'src/pages', baseRoute: '' }] })`
- `schedulePlugin({ dataDir: `${CONTENT_DIR}/data` })`
- `danceSchedulePlugin({ dataDir: `${CONTENT_DIR}/data` })`

Ad-hoc real events in development use the raw env var (`CONTENT_SET=spring-2027 pnpm dev`) — no dedicated script needed per event. `test` gets permanent convenience scripts since it's a fixed, always-present fixture.

New `package.json` scripts:
```json
"dev:test": "CONTENT_SET=test vite",
"build:test": "tsc --noEmit && CONTENT_SET=test vite build",
```
No `preview:test` — `vite preview` only serves the already-built `dist/` and never reads `CONTENT_SET`; the flow is `pnpm build:test && pnpm preview` (two commands).

### 3. Plugin refactor — `vite-plugin-schedule.ts` and `vite-plugin-dance-schedule.ts`

Both plugins currently hardcode a `..._RELATIVE_PATH` constant like
`'data/event-schedule.xlsx'`. Change each factory to take a required
`{ dataDir: string }` option, and build the file path from
`path.resolve(config.root, options.dataDir, '<filename>.xlsx')` instead —
same for `danceSchedulePlugin`'s second file,
`dance-schedule-dump.md` (still lives alongside its source `.xlsx`, still
regenerated on every parse). No other logic changes: same virtual module ids
(`virtual:schedule`, `virtual:dance-schedule`), same `resolveId`/`load`/
`configureServer` dev-watch-and-full-reload behavior, same aggregated
fail-the-build error format on bad rows.

Nothing downstream changes: `SchedulePage.tsx`, `DanceSchedulePage.tsx`,
`RawDanceScheduleDebugPage.tsx` import the virtual modules by fixed id and
are untouched, as are `src/types/virtual-schedule.d.ts` /
`virtual-dance-schedule.d.ts` and `src/lib/buildNavTree.ts`.
`playwright.config.ts`'s `webServer` (`pnpm build && pnpm preview`, no env
var) keeps resolving to `real`, so existing e2e assertions on real-data
strings ("All Callers Dance", "Lunch Break", the home-page heading) keep
passing unmodified.

### 4. `content/test/` fixture content

`.xlsx` is binary, so it can't be hand-authored. Generate it with a
temporary, not-committed dependency:

1. `pnpm add -D exceljs`
2. Write a one-off script (e.g. `scratch/generate-test-content-set.mjs`) that
   builds both workbooks and writes them to `content/test/data/`.
3. Round-trip-verify inside the same script: re-read the generated files
   through the project's real pipeline — `readSheet`/`readExcelFile` from
   `read-excel-file/node`, plus `parseEventDate` (`src/lib/parseEventDate.ts`),
   `parseTimeRange` (`src/lib/parseTimeRange.ts`), and
   `parseDanceScheduleSheet` (`src/lib/parseDanceScheduleSheet.ts`) — and
   confirm zero parse errors before trusting the fixture.
4. `pnpm remove exceljs` — only the two committed binary `.xlsx` files
   remain; no permanent dependency footprint.

**`content/test/data/event-schedule.xlsx`** (~12 rows, columns `Date | Start
time - End time | Location | Description`) — each row targets a distinct
branch of `parseEventDate`/`parseTimeRange`: ISO date, 2-digit-year slash
date, long-form date (with/without comma, with/without period abbreviation),
no-year date + year-inference (both slash and long-form), ambiguous-hour
meridiem inference in both directions (including the "flip" subcase), and all
four time-range separators (`-`, `to`, en dash, em dash).

**`content/test/data/dance-schedule.xlsx`** (2 sheets, e.g. `"Monday Jan 5"` /
`"Tuesday Jan 6"`, second sheet deliberately drops one room column to mirror
the real data's per-day room variance) — covers: edge-of-range levels (`SSD`
min, `C4` max, per `src/lib/levelOrder.ts`'s `LEVEL_ORDER`), an unordered
level (`Various`, always visible regardless of slider), multi-level cells via
both `&` and `/` separators, a room-spanning session via the `"` ditto mark
(adjacent column), a room-spanning session via an explicit non-adjacent
`ROOMS:` line, a `GCA:` line, and a roomless freeform session (`* ... ` +
`ROOMS: NONE`) — all per the cell grammar in
`src/lib/parseDanceScheduleSheet.ts`.

**`content/test/pages/`** — 2–3 short markdown pages, no `assets/` needed
(none reference images):
- `index.md` — a clearly-labeled "TEST CONTENT SET" banner page so it's
  obvious at a glance which content set is active.
- `2 edge-cases.md` — a short human-readable index of what the fixture
  deliberately covers.
- `3 about-this-set.md` — one paragraph on why this set exists.

### 5. Documentation updates

- **New living design doc** `docs/design/content-sets.md`, following the
  Context / Sub-problems / Decisions / Open-questions structure from
  `docs/design/README.md`. Key decisions to record: folder-per-set over a
  root-level naming scheme (generalizes to N concurrent real events); env
  var over Vite `--mode` (avoids conflating content selection with Vite's
  own dev/prod concept); default-to-`real` (zero-config parity); no
  `preview:test`; build-time-only switching (matches the existing
  "editing the spreadsheet requires a rebuild" model); test fixture
  generated via a temporary dependency, not a permanent one. Open questions:
  whether to validate/friendly-error a missing `CONTENT_SET` directory,
  whether `test` should get its own e2e coverage later.
- **`CLAUDE.md`** — update the "Project structure" tree and the "Content
  pipeline" / "Schedule data pipeline" prose to describe
  `content/<set>/{pages,data}/` and the `CONTENT_SET` mechanism (pointing at
  the new design doc), and add `dev:test`/`build:test` to the commands list.
- **`content/real/pages/index.md`** — currently hardcodes `content/pages/`
  in its own text; reword to say "this content set's `pages/` directory" so
  it's correct regardless of which set is active. Keep the
  `# Welcome to Dance Schedule` heading verbatim (matched by
  `e2e/app.spec.ts`).

## Critical files

- `vite.config.ts` — compute `CONTENT_SET`/`CONTENT_DIR`, wire into `Pages()` and both plugin calls
- `vite-plugin-schedule.ts` — `dataDir` option
- `vite-plugin-dance-schedule.ts` — `dataDir` option (both the `.xlsx` and the dump `.md`)
- `package.json` — `dev:test`, `build:test` scripts
- `content/real/pages/`, `content/real/data/` — moved via `git mv`
- `content/test/pages/`, `content/test/data/` — new fixture content
- `docs/design/content-sets.md` — new design doc
- `CLAUDE.md` — structure/pipeline docs updated

## Verification

1. `pnpm dev` (default) → `/` shows "Welcome to Dance Schedule", nav unchanged, `/schedule` and `/dance-schedule` still show real data (e.g. "All Callers Dance", a lunch break).
2. `pnpm dev:test` → `/` shows the "TEST CONTENT SET" banner, nav reflects test pages, `/schedule` shows the 12 fixture rows, `/dance-schedule` shows the ditto-spanned room block, the explicit-`ROOMS:` spanning block, the roomless session banner, and confirms the level slider hides `SSD`/`C4` sessions outside range while keeping `Various` visible.
3. `pnpm typecheck && pnpm lint && pnpm test` — all green (unit tests don't reference these file paths).
4. `pnpm build:test && pnpm preview` — build succeeds, `content/test/data/dance-schedule-dump.md` is regenerated and plausible, preview serves the test build.
5. `pnpm build && pnpm preview` — rebuilding with no `CONTENT_SET` restores the real content set.
6. `pnpm test:e2e` — existing Playwright specs pass unchanged (they run against `real` via `playwright.config.ts`'s unmodified `webServer` command).
