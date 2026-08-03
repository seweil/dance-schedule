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

- `src/components/DanceScheduleLevelsPage.tsx` (the `/dance-by-level` route)
  has no unit test *and* no e2e spec navigates to it — the only page in the
  app with literally zero test coverage of its own, not just a missing unit
  test. `DanceSchedulePage.tsx`/`SchedulePage.tsx` are thin wrappers with the
  same "no unit test" gap, but at least get reached by e2e.
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
