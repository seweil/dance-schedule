# Testing: what runs when, and where to see results

A practical reference for the four layers of checking this repo has, when
each one actually runs, and how to read its results — as opposed to
`CLAUDE.md`'s Testing section, which is short, agent-facing guidance on how
to *write* tests. See `docs/known-issues.md` for why Claude Code itself can't
execute the e2e layer directly in this environment.

## The four layers

| Layer | Catches | Lives in | Command |
| --- | --- | --- | --- |
| **Lint** (ESLint) | Style/correctness lint rules, unused code, hook-rule violations | — | `pnpm lint` (`pnpm lint:fix` to auto-fix) |
| **Typecheck** (`tsc --noEmit`) | Type errors across the whole repo | — | `pnpm typecheck` (also the first half of `pnpm build`) |
| **Unit tests** (Vitest + jsdom) | Logic bugs in pure functions, hooks, and component rendering/interaction | Colocated `*.test.ts`/`*.test.tsx` next to the file under test (plus two root-level exceptions: `content-config.test.ts`, `content-icons.test.ts`) | `pnpm test` (`pnpm test:watch` for watch mode, `pnpm test:coverage` for a coverage report) |
| **E2E tests** (Playwright) | Real-browser behavior: PWA install/offline/service-worker flow, multi-content-set builds, responsive/mobile layout, full user flows through the real built app | `e2e/*.spec.ts` | `pnpm test:e2e` |
| **Build-time data validation** (not a "test" file, but functions as one) | A malformed `dance-schedule.xlsx`/`event-schedule.xlsx` row, or an invalid `content/<set>/config.yaml` | `vite-plugin-schedule.ts`, `vite-plugin-dance-schedule.ts`, `vite-plugin-content-config.ts`, `content-config.ts` | Runs automatically inside `pnpm build`/`pnpm dev` — a bad row or config value fails the build/dev-server start with a named error identifying the offending row/field, rather than silently producing wrong output |

E2E tests require a real production build — they run against `pnpm build && pnpm preview`
(configured as Playwright's own `webServer` in `playwright.config.ts`, which
starts it automatically), never against `pnpm dev`. See `CLAUDE.md`'s PWA
guidance for why: the dev server doesn't register the service worker the same
way production does.

## Where each layer actually runs

| | Local dev loop | GitHub Actions CI (`.github/workflows/ci.yml`) | Amplify deploy build (`amplify.yml`) |
| --- | --- | --- | --- |
| Lint | Automatic on `git commit` (Husky, see below), or manual (`pnpm lint`) | ✅ `checks` job, every push + PR | ❌ not run |
| Typecheck | Automatic on `git commit` (Husky), or manual/automatic via `pnpm build` | ✅ `checks` job | ✅ (first half of `pnpm build`) |
| Unit tests | Automatic on `git commit` (Husky), or manual (`pnpm test`) | ✅ `checks` job, with coverage | ❌ not run |
| E2E tests | Manual (`pnpm test:e2e`) — too slow for a pre-commit hook | ✅ `e2e` job | ❌ not run |
| Build-time data validation | Automatic, any `pnpm build`/`pnpm dev` | ✅ (inside the `e2e` job's build step) | ✅ (inside `pnpm build`) |

**Local pre-commit hook:** `pnpm install` activates a Husky hook
(`.husky/pre-commit`) that runs `pnpm typecheck && pnpm lint && pnpm test`
before every commit and aborts it if any fail — a local safety net for
manual edits, catching most breakage before it ever reaches CI. It doesn't
run e2e tests (too slow to run on every commit) and isn't a substitute for
CI, which is the layer that actually enforces anything for a change that
didn't go through a local commit with the hook active (e.g. an edit made
directly on GitHub, or a contributor who hasn't run `pnpm install` since
the hook was added).

**The gap CI closes:** before the GitHub Actions workflow existed, lint,
unit tests, and e2e tests ran *only* when a human happened to type the
command locally — nothing enforced any of them, and Amplify's deploy build
would happily ship a lint failure or a broken user flow straight to
production as long as `tsc --noEmit` and the data-validation checks passed.
CI doesn't block the Amplify deploy itself (that's a separate, unconnected
pipeline) — it's visibility on the PR/commit, not a deploy gate. Wiring CI
status into branch protection or into Amplify's own build step is a possible
future step, not done here.

## How to see CI results

GitHub → **Actions** tab → the workflow run for your push/PR → its **Summary**
page. Pass/fail per job is right there; for detail:

- **`checks` job → `coverage` artifact**: download and open `index.html` for
  a browsable, file-by-file coverage report (same data `pnpm test:coverage`
  prints as a text table locally).
- **`e2e` job → `playwright-report` artifact**: download and open `index.html`
  for the full Playwright HTML report — screenshots/traces on failure, timing
  per test, retry history.

Both artifacts upload even when their job fails (`if: always()`), so a broken
run's report is exactly as reachable as a passing one's.

## Test organization

Unit tests are colocated: `Foo.ts` → `Foo.test.ts` (or `Foo.tsx` →
`Foo.test.tsx`) in the same directory, per `CLAUDE.md`'s "colocate a
component's styles/tests next to the component file" convention. Three files
break that pattern on purpose, living at the repo root because the code they
test does too: `content-config.test.ts`, `content-icons.test.ts`, and
`vite-plugin-content-config.test.ts`. E2E specs live entirely separately,
under `e2e/`, one file per broad feature area (`app.spec.ts`,
`content-sets.spec.ts`, `dance-schedule.spec.ts`) rather than mirroring the
source tree — a Playwright spec exercises a full user flow across many
components at once, so component-level colocation doesn't apply.

As of this writing: ~40 unit test files (colocated under `src/`, plus the
three root-level exceptions above) and 3 e2e spec files. Run
`pnpm test:coverage` for current, real numbers — don't trust a stale count
here as the codebase grows.

**Known gaps** (surfaced by a coverage pass, not exhaustive):

- `src/components/SchedulePage.tsx` (the `/event-schedule` route) has no unit
  test of its own — the only remaining page in that state.
  `DanceSchedulePage.tsx`/`DanceScheduleLevelsPage.tsx`/`DanceScheduleCallersPage.tsx`
  (routes `/room-schedule`/`/dance-schedule`/`/caller-schedule`) each now
  have their own unit test plus e2e coverage — this bullet used to flag all
  four as gaps; only `SchedulePage.tsx` still is.
- `src/components/BuildInfo.tsx` and `src/components/UpdatePrompt.tsx` have
  no unit test and aren't asserted on by any e2e spec either.
- Three root Vite plugins (`vite-plugin-schedule.ts`,
  `vite-plugin-dance-schedule.ts`, `vite-plugin-content-sets.ts`) are
  intentionally untested as plugins — their parsing/validation *logic* is
  unit-tested via the pure functions they call (`parseEventDate.ts`,
  `parseTimeRange.ts`, `parseDanceScheduleSheet.ts`, `content-config.ts`,
  etc.), but the thin plugin/Excel-IO wrapper around that logic is only
  covered live, via `pnpm build`/`pnpm dev:test`. `vite-plugin-content-config.ts`
  used to be a fourth member of this list, but now has its own
  `vite-plugin-content-config.test.ts` covering `loadContentConfigData`
  directly (config.yaml parsing/validation, and the env-var override layer
  described above) — only its thin `Plugin` object (virtual-module
  resolution, dev-server file watching) remains covered live only, same as
  the other three.

None of these are urgent — call them out here so a gap is a known, named
tradeoff instead of a surprise.

## Hand-calculating the dance-schedule hour-summary totals

The "Hours by level" and "Hours by caller" cross-tabs (`computeDanceScheduleHourSummary.ts`)
render on the raw debug page (`/<content-set>/debug/dance-schedule`) and in each
content set's committed `data/dance-schedule-dump.md`. If you're writing or
checking a test assertion against these — most directly
`computeDanceScheduleHourSummary.test.ts`, but also anything asserting on the
`automated-testing` fixture's dump — here's the exact arithmetic so you can
verify a number by hand instead of just trusting whatever the code currently
outputs:

1. **Per-session hours** = `(endTime - startTime)` in hours (`sessionHours()`)
   — a 90-minute session contributes `1.5`.
2. **A session with more than one *distinct* level or caller splits its hours
   evenly** across them. A 1-hour session tagged `['C1', 'C2']` contributes
   `0.5` to each of C1 and C2's totals; one co-taught by `['Vic Ceder', 'Ted
   Lizotte']` splits the same way between callers. A literal duplicate (e.g.
   the same caller listed twice by mistake) still only counts as **one**
   share, not two — both lists are deduped via `Set` before splitting.
3. **Only `kind === 'structured'` sessions count at all** — a freeform session
   (no level, no caller) contributes nothing to either table. Every
   structured session counts toward both tables, including a `"GCA Caller
   Showcase Dance"` one; `gca` itself is never counted as a caller, only
   `session.callers`.
4. **Sum each level's/caller's per-day shares into a grand total**, then apply
   each table's own floor: a level with a grand total of exactly `0` is
   omitted as a column entirely (no separate threshold otherwise); a caller
   doesn't get their own column unless their grand total exceeds
   `MIN_CALLER_HOURS` (`3`, `computeDanceScheduleHourSummary.ts` — strictly
   greater than, so exactly 3.0 is still excluded). Both thresholds apply to
   the caller's/level's **own total across every day**, not any single day's
   total. A filtered-out caller's hours aren't dropped, though — they're
   rolled into one trailing `"Other"` column (omitted only when there's
   nothing to roll up), so the caller table's own day/grand totals always
   equal the level table's, never running lower.
5. **Displayed values are rounded** to at most 2 decimal places with trailing
   zeros dropped (`formatHours()`) — a `1/3` split reads as `0.33`, a whole
   number as `4`, not `4.00`.

Column *order* isn't a totals question but trips people up alongside it:
level columns follow `LEVEL_ORDER`'s real skill progression with
`Intro`/`Various` trailing (not alphabetical, not spreadsheet order); caller
columns sort by descending total hours (ties broken alphabetically), with a
headline-callers-first / GCA-showcase-only-callers-last split
(`groupBoundary`) — a caller whose *only* credited hours come from
`GCA_CALLER_SHOWCASE_EVENT_TYPE` sessions still gets a column (if over the
hour floor) but sorts after every real headliner.

## Regenerating the totals baked into the real spreadsheet

The numbers above aren't just displayed in the app — `scripts/generate-dance-schedule-hour-tabs.ts`
writes the same two tables as static `"- Hours by Level"`/`"- Hours by Caller"`
tabs directly into `content/<CONTENT_SET>/data/dance-schedule.xlsx`, so anyone
who opens the real spreadsheet in Excel sees the same totals without visiting
the app.

```
CONTENT_SET=<your-event-name> node --import=tsx scripts/generate-dance-schedule-hour-tabs.ts
```

`CONTENT_SET` is required (not defaulted) — this writes directly to a real
content set's workbook on disk, so a missing/mistyped value fails loud
(`assertContentSetExists`) rather than silently touching the wrong event.

Not `pnpm exec tsx ...` or the bare `tsx` CLI — the script's own header
comment notes its IPC-socket setup fails with `EPERM` in at least one
sandboxed environment; `node --import=tsx` runs the identical transform
without that wrapper.

A few things worth knowing before you run it or read its output:

- **This is a manual, permanent tool, not part of any build** — it doesn't
  run in `pnpm build`/`pnpm dev`, CI, or the Amplify deploy. The tab values
  are static snapshots, not live formulas (the source cells are compound
  parsed strings — `"Level : Type - Caller"` — not something a plain Excel
  formula can re-derive), so **re-run it any time a day's schedule in the
  workbook changes**, or the tabs silently go stale.
- **The spreadsheet's caller table has no hour floor** — it's generated with
  `minCallerHours: 0`, so every caller with any measured hours gets their own
  row and there's never anything left to roll into an "Other" one, unlike the
  debug page/dump's own version (and this doc's hand-calculation steps
  above), which rolls anyone at or under `MIN_CALLER_HOURS` (`3`) into a
  shared `"Other"` row instead of giving them their own. Per direct product
  decision, to keep the spreadsheet's own version simpler than the app's
  curated one — expect the two to disagree on caller *count* for that reason
  alone, even when every individual total matches.
- **Each generated tab has a built-in staleness check** — a "Calculated" row
  (a fixed timestamp from when the script ran) next to a "Saved" row (a live
  `=NOW()` formula, seeded to match "Calculated" until the workbook is
  actually edited) and a "Status" formula comparing the two. If "Status"
  reads as stale, the tab's numbers no longer necessarily match the day
  sheets — re-run the script. (Google Sheets recalculates `NOW()` on every
  open regardless of edits, so "Status" can read as stale there just from
  opening the file — a real platform gap, not a bug.)
- **Both tab names start with `"-"`** (`isNonScheduleSheetName`,
  `parseDanceScheduleSheet.ts`) so the real schedule parser skips them
  instead of trying to parse them as another day's grid.

## Previewing a different config.yaml value without editing it

`config.yaml` is one value per content set — there's no way to have, say,
`combineA1A2: true` and `combineA1A2: false` live at once to compare. For a
quick local visual check of a different value, `vite-plugin-content-config.ts`
supports dev-only env-var overrides instead of hand-editing (and remembering
to revert) the active set's `config.yaml`:

```
COMBINE_A1A2=false COMBINE_C3BC4=false pnpm dev:test
DANCE_SCHEDULE_ROOM_ORDER=spreadsheet pnpm dev:test
DANCE_SCHEDULE_ROOM_ORDER="Test Room A,Test Room B,Test Room C,Test Room D" pnpm dev:test
```

`DANCE_SCHEDULE_ROOM_ORDER` also accepts `default`, to force the median-level
algorithm even when the active set's `config.yaml` itself sets something
else. These are read once at Vite config time (same as `CONTENT_SET`/
`BASE_PATH`), so a change needs a dev-server restart, not just a save — and
they're unset in every real build/test/e2e run, so they have no effect
outside a manual `pnpm dev`/`dev:test` session. See
`docs/design/content-config.md` for the design rationale.
