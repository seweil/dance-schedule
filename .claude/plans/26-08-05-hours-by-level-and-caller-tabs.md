# Add "Hours by Level" / "Hours by Caller" tabs to the default dance spreadsheet

## Context

The `/debug/dance-schedule` page already computes and displays two summary
tables above its raw session dump — total scheduled hours per skill level,
and per caller, both broken out by day and overall
(`computeDanceScheduleHourSummary`, rendered by `RawDanceScheduleTable.tsx`'s
`HourSummaryTable`). The ask is to duplicate those same two tables as real
worksheet tabs inside the actual source spreadsheet
(`content/backtrack2abq/data/dance-schedule.xlsx` — `backtrack2abq` is
`content/config.yaml`'s `defaultContentSet`, i.e. "the default dance
spreadsheet"), with two simplifications: omit the debug page's own
`MIN_CALLER_HOURS` (3-hour) caller filter, and (already true of the source
table, no extra work needed) GCA credit is never counted toward anyone's
hours.

**Key finding that changes the shape of this work:** simply adding new
tabs to that file would break the real production build. The build-time
parser (`vite-plugin-dance-schedule.ts` → `read-excel-file`) reads *every*
worksheet in the workbook unconditionally and throws an uncaught
`Unrecognized date format` error for any sheet whose name isn't a
recognized date pattern — there's no existing mechanism to skip a
non-day tab. This plan includes the small, targeted fix needed to make
that safe, not just the spreadsheet change itself.

**Chosen approach — static precomputed values, not live Excel formulas.**
A session's cell text is a compound parsed string (level + event type +
caller(s) + optional GCA/multi-room directives); replicating this app's
crediting logic (even-split across distinct levels/callers, dedup, GCA
exclusion) as native Excel formulas would mean reimplementing that parsing
in spreadsheet-formula form — impractical, and this app has no existing
formula-writing anywhere. Instead, a new script reuses the app's own real
parsing/computation TypeScript code to compute the numbers once and writes
them as plain values. Tradeoff, accepted deliberately: these two tabs go
stale if a day sheet is edited later without re-running the script — noted
both in a row inside the spreadsheet itself and in `docs/design/dance-schedule.md`.

## Implementation

**1. Skip mechanism for non-day sheets** (`src/lib/parseDanceScheduleSheet.ts`)

A prefix convention, not an allow-list — more general and future-proof
(any future utility/notes/summary tab opts out the same way, no code
change needed to "register" it by name), while still preserving the
existing fail-loud safety property: a real day sheet's name never starts
with `-`, so a genuinely mistyped day-sheet name still parses as a
(failing) date attempt, hitting today's same loud build error, rather than
being silently skipped.

```ts
// Any sheet name starting with this prefix is treated as non-schedule content
// — a general escape hatch for notes/utility/summary tabs living alongside the
// real per-day sheets in the same workbook, not tied to any specific tab.
// Sheets are otherwise assumed to be real schedule days and must parse as one
// (parseSheetDate throws loudly on a genuine mismatch) — this prefix is the
// ONLY way to opt a sheet out of that expectation.
export const NON_SCHEDULE_SHEET_PREFIX = '-'
export function isNonScheduleSheetName(sheetName: string): boolean {
  return sheetName.startsWith(NON_SCHEDULE_SHEET_PREFIX)
}
```

`vite-plugin-dance-schedule.ts`'s `loadDanceScheduleData` loop (currently
`for (const sheet of sheets) { const result = parseDanceScheduleSheet(...) }`)
skips any sheet matching this predicate before calling the parser. Also
export `loadDanceScheduleData` itself (currently private) so the new
generator script below calls the *exact same* read-and-parse-and-aggregate-
errors function the real build runs, not a re-implementation of it.

New tests in `src/lib/parseDanceScheduleSheet.test.ts`: a `-`-prefixed name
returns `true`; a real date-like name and a mistyped/bogus (but
non-`-`-prefixed) name both return `false`.

**2. Omit the caller-hours floor on demand** (`src/lib/computeDanceScheduleHourSummary.ts`)

Add an optional second parameter, backward-compatible (the debug page's own
call site is unaffected):

```ts
export function computeDanceScheduleHourSummary(
  sessions: DanceSession[],
  options: { minCallerHours?: number } = {},
): DanceScheduleHourSummary
```

`minCallerHours` defaults to the existing `MIN_CALLER_HOURS = 3`; the new
script passes `{ minCallerHours: 0 }` (the filter is a strict `>`, so `0`
means "everyone with any measured hours," matching "omit the limit for
simplicity"). New test case in the colocated test file covering the
override; existing no-options tests stay unchanged.

**3. Generator script** — new `scripts/generate-dance-schedule-hour-tabs.ts`

A permanent, reusable, re-runnable tool (same model as the existing
`scripts/edit-test-data.mjs`), not a one-off:

1. `loadDanceScheduleData(WORKBOOK_PATH)` (newly exported, step 1) →
   `buildDanceSchedule(...)` → `computeDanceScheduleHourSummary(sessions, { minCallerHours: 0 })`.
   Reuses the real pipeline end to end, so the numbers are guaranteed to
   match the live debug page, and fails loudly on any malformed day sheet
   exactly like the real build does (never writes tabs derived from
   partially-broken data).
2. Opens the same file a second time with **ExcelJS** (`read-excel-file` is
   read-only) purely for the write step. Tab names are `'- Hours by Level'`
   and `'- Hours by Caller'` — the leading `-` opts them out of day-sheet
   parsing via the prefix convention above. Removes any pre-existing
   sheet(s) matching those two *exact* names first (idempotent re-runs —
   don't depend on ExcelJS's unspecified duplicate-name behavior); this is
   the script's own narrow bookkeeping for the two tabs it owns, deliberately
   NOT "remove anything `-`-prefixed" — that broader rule belongs only to
   the parser's skip check, so a hypothetical unrelated `-`-prefixed tab
   someone else adds by hand is never touched by this script. Then
   `addWorksheet('- Hours by Level')` / `addWorksheet('- Hours by Caller')`
   (appended at the end — inert either way, since `buildDanceSchedule`
   globally re-sorts sessions by real time regardless of source-sheet
   order).
3. Each tab: header row (`Date` + one column per level/caller + `Total`,
   bold), one row per day, a final bold `Total` row + grand-total cell, and
   a trailing note row: *"Generated by scripts/generate-dance-schedule-hour-tabs.ts
   — re-run after editing any day's schedule."* Date column uses the same
   plain formatted-string label the debug page itself uses (`Intl.DateTimeFormat`
   with `weekday:'short', month:'short', day:'numeric'`, e.g. "Thu, Jul 2")
   rather than a native Excel date value — sidesteps unverified ExcelJS
   date-serialization/timezone behavior in committed data; native date
   sorting isn't needed since rows are already written in chronological
   order. Hour cells are raw numeric values (full precision) with a
   per-column `numFmt: '0.##'` applied for display — matches
   `formatHours`'s "≤2 decimals, no trailing zeros" convention visually
   while keeping exact values available for anyone doing further math in
   Excel.
4. `WORKBOOK_PATH` hardcoded to `content/backtrack2abq/data/dance-schedule.xlsx`
   — scoped to that one file, matching "the default dance spreadsheet";
   not generalized to other content sets.
5. Invocation documented in the script's own header comment (`node
   --import=tsx scripts/generate-dance-schedule-hour-tabs.ts` — NOT `pnpm
   exec tsx ...`/the bare `tsx` CLI, which spins up an IPC socket that this
   sandboxed environment's own filesystem/network restrictions block with
   `EPERM`; confirmed live that `node --import=tsx` bypasses that wrapper
   entirely and runs identically, including resolving relative `.ts`
   imports correctly), matching
   `edit-test-data.mjs`'s own "Usage:" comment convention — no new
   `package.json` script entry, for the same reason that file doesn't have
   one either.

**4. New devDependency: `tsx`** — needed so this script (and only this
script) can import real `.ts` app code (`loadDanceScheduleData`,
`buildDanceSchedule`, `computeDanceScheduleHourSummary`) directly rather
than risk silently drifting from that logic by reimplementing it in plain
JS. No path aliases exist in the imported module graph, so plain `tsx`
(no project-aware resolution needed) is sufficient.

**5. Build-config wiring** (easy to miss, both required for `pnpm typecheck`/`pnpm lint` to actually cover the new script)

- `tsconfig.json`: add `"scripts/generate-dance-schedule-hour-tabs.ts"` to `"include"`.
- `eslint.config.js`: add the same path to the existing Node-globals
  override (`files: ['e2e/**/*.ts', 'playwright.config.ts', 'vite.config.ts']`)
  — otherwise it's linted under browser globals and `process`/etc. flag as undefined.

**6. Docs**: a short new decision entry in `docs/design/dance-schedule.md`
(there's already a directly-relevant section on this file) recording the
static-values-not-live-formulas choice and the staleness tradeoff.

## Files touched

- New: `scripts/generate-dance-schedule-hour-tabs.ts`
- `src/lib/parseDanceScheduleSheet.ts` + its test file (new export + tests)
- `vite-plugin-dance-schedule.ts` (export `loadDanceScheduleData`, skip check in its loop)
- `src/lib/computeDanceScheduleHourSummary.ts` + its test file (new optional param + test)
- `tsconfig.json`, `eslint.config.js` (include the new script)
- `package.json` (new `tsx` devDependency)
- `content/backtrack2abq/data/dance-schedule.xlsx` (generated output — regenerate by re-running the script, never hand-edited)
- `docs/design/dance-schedule.md` (new decision entry)

Not touched: `content/test/`, `content/automated-testing/`, `content/MotivateToSeattle/` — scope is `backtrack2abq` only.

## Verification

Playwright/e2e can't run inside this sandbox (`docs/known-issues.md`) — verification is typecheck/lint/unit tests plus a real build and manual inspection:

1. `pnpm typecheck && pnpm lint && pnpm test` — covers the new predicate/summary-option unit tests and type/lint-checks the new script.
2. Run the generator: `node --import=tsx scripts/generate-dance-schedule-hour-tabs.ts`.
3. `pnpm build` (the real default build) — confirms the skip mechanism actually prevents the crash the new tabs would otherwise cause, and the whole content-set pipeline still succeeds. Confirm `dance-schedule-dump.md` for that set is unchanged (the new tabs should contribute zero sessions/errors).
4. Re-run the generator a second time; `git diff` should show no change (idempotency — same numbers, no duplicate sheets).
5. Manual spot-check: open the regenerated `.xlsx` and hand-compare a few cells against the live `/debug/dance-schedule` page's own two tables for the same data, confirming the numbers genuinely match, not just "the script ran without error."
6. `pnpm build && pnpm preview`, spot-check `/debug/dance-schedule` for `backtrack2abq` still renders exactly as before (sanity check nothing in the real parsing pipeline regressed).
