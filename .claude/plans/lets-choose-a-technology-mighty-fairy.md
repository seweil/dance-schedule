# Detailed schedule — data model, parsing, and storage

## Context

The user shared a reference PDF (`scratch/Dance Schedule.pdf`) and the
**actual real source data**, `scratch/Dance-Schedule.xlsx`, for a
multi-day square dance convention. This is a **new page/tab** —
"Detailed Schedule" — alongside the existing simple schedule
(`SchedulePage`/`ScheduleList`/`data/event-schedule.xlsx`), which is
untouched by this work. Per the user's direction, **this phase covers
only the data model, parsing, and storage** — no React component,
route, nav/tab integration, or rendering yet; that's a later phase.

**What the real file actually contains** (inspected directly with
`read-excel-file`, not just inferred from the PDF):

- **3 sheets, one per day**: `"Thursday July 2"`, `"Friday July 3"`,
  `"Saturday July 4"` — sheet names are weekday + month + day, **no
  year**, and there's no date column anywhere in the grid.
- **Each sheet is a genuine grid**: row 1 = room names (varies per sheet
  — Friday has no "Salon 6/7" column), each subsequent row = a time slot
  in column 0 (e.g. `"12:30p-1:30p"`, bare `a`/`p` with **no** trailing
  `m` — a format `parseTimeRange` doesn't accept yet), each remaining
  cell = one compound text session, e.g.
  `"Plus : Dancing - Kris Jensen\nGCA: Tim Stephens"`, or `null` if that
  room/time is empty.
- Extracted (not guessed) from all ~150 real cells:
  - **Level prefixes actually used**: `SSD`, `Plus`, `C1`, `C2`, `C3A`,
    `C3B`, `C4`, `A1`, `A2`, `Intro`, `Various`, plus combined forms
    `"C1 & C2"` and `"A1/A2"` — **two different separators** for
    multi-level sessions (`&` and `/`).
  - **Exactly 2 cells have no colon at all**: `"Intro to calling - Bill
    Eyler"` and `"Country Western Dance - until 1am"`.
  - GCA line is optional (many cells lack it).
  - Some cells have two co-callers joined by `&` in the *caller*
    position (e.g. `"Michael Kellogg & Terri Sherrer"`), the same
    character used for multi-level — resolved unambiguously by parsing
    position (level-portion is only the text before the first `:`), not
    by a single whole-string split.

**Decisions confirmed with the user** (in order, refined through
several rounds against the real data):
1. Parse the existing grid format directly — no re-entry into clean
   columns.
2. Dates come from parsing the sheet name (stripping the weekday) with
   the existing `parseEventDate` year-inference heuristic — no
   spreadsheet changes needed.
3. A session can have **multiple primary callers** (`callers: string[]`,
   e.g. `["Michael Kellogg", "Terri Sherrer"]` for a co-taught session)
   — the `&` in the caller position joins co-*primary* callers, it does
   NOT demote the second name to `gca`. `gca` is a separate, optional
   field populated **only** when an explicit line starting with `GCA:`
   follows the primary description.
4. A cell whose text starts with `"* "` is treated as a **literal
   freeform description** (no structured parsing attempted). Any other
   cell that doesn't match the expected pattern **fails the build**.
   This means the 2 non-conforming cells found above need a `"* "`
   prefix added to the source file — proposed as part of this
   implementation (see Files touched), not something the parser should
   guess around.

This gets its own living design doc, `docs/design/detailed-schedule.md`
(a new topic), per `docs/design/README.md`'s convention.

## Approach

### Types — `src/types/detailedSchedule.ts`

```ts
export const LEVEL_CODES = [
  'SSD', 'MS', 'Plus', 'Advanced', 'C1', 'C2', 'C3A', 'C3B', 'C4',
  'A1', 'A2', 'Intro', 'Various',
] as const
export type LevelCode = (typeof LEVEL_CODES)[number]
// MS and Advanced appear in the convention's printed legend but not in this
// 3-day excerpt's actual data — included preemptively since they're part of
// the same taxonomy; trivial to remove if they turn out to be unused elsewhere.

interface SessionBase {
  date: string       // ISO — see ScheduleEventData for why strings, not Dates
  startTime: string
  endTime: string
  room: string
}
export interface StructuredSessionData extends SessionBase {
  kind: 'structured'
  levels: LevelCode[]
  eventType: string
  callers: string[]  // one or more primary callers (split on '&')
  gca?: string        // only set when an explicit "GCA: ..." line follows
}
export interface FreeformSessionData extends SessionBase {
  kind: 'freeform'
  description: string
}
export type DetailedSessionData = StructuredSessionData | FreeformSessionData

// App-facing (Date objects) equivalents, produced by buildDetailedSchedule.ts
interface SessionBaseResolved {
  date: Date
  startTime: Date
  endTime: Date
  room: string
}
export interface StructuredSession extends SessionBaseResolved {
  kind: 'structured'
  levels: LevelCode[]
  eventType: string
  callers: string[]
  gca?: string
}
export interface FreeformSession extends SessionBaseResolved {
  kind: 'freeform'
  description: string
}
export type DetailedSession = StructuredSession | FreeformSession
```

The discriminated union (`kind: 'structured' | 'freeform'`) makes the
`"* "`-prefix escape hatch a first-class, type-checked case rather than
an awkwardly-optional bag of fields.

### Source file — move `scratch/Dance-Schedule.xlsx` → `data/detailed-schedule.xlsx`

This is real convention data, not a sample to invent — move it into the
project's real data location. Add the `"* "` prefix to the 2 identified
non-conforming cells (`"Intro to calling - Bill Eyler"` and
`"Country Western Dance - until 1am"`) as part of this change, per the
user's own rule for handling them.

### Parsing — `src/lib/parseTimeRange.ts` (small fix) + new `src/lib/parseDetailedScheduleSheet.ts`

- **Fix `parseTimeRange`'s `TIME_PATTERN`** to make the trailing `m`
  optional (`([ap])\.?(?:m\.?)?` instead of requiring `m`), so bare
  `"12:30p"` parses the same as `"12:30pm"`/`"12:30 PM"`/`"12:30 p.m."`.
  Add table-driven test cases for the bare form to
  `parseTimeRange.test.ts`.
- **New pure function** `parseDetailedScheduleSheet(sheetName: string,
  rows: unknown[][], referenceDate?: Date): DetailedSessionData[]` —
  given one sheet's raw grid data (row 0 = room headers, each following
  row = `[timeRange, ...cells]`), returns every non-empty cell as a
  `DetailedSessionData`:
  1. Derive the date from the sheet name: strip a leading weekday word
     (`/^\w+day\s+/i`) and pass the remainder (e.g. `"July 2"`) to the
     existing `parseEventDate` (year-inference applies).
  2. Parse each row's time-slot cell with `parseTimeRange`.
  3. For each non-empty cell in that row: if it starts with `"* "`,
     produce a `FreeformSessionData` (description = the rest of the
     text, trimmed). Otherwise, split on the first `:`; no colon found
     is a parse error (aggregated, not thrown immediately). Split the
     level-portion on `/[&/]/` and validate each piece against
     `LEVEL_CODES` (unrecognized code is also an aggregated error).
     Split the remainder on `\n` into the main line and an optional
     second line. Split the main line on the *first* `" - "` into event
     type and caller-portion, then split the caller-portion on `&` into
     `callers: string[]` — **always** primary callers, regardless of
     count. If a second line exists: it must start with `GCA:` (case-
     insensitive) or it's a parse error (aggregated, not silently
     ignored); when present, the text after `GCA:` becomes `gca`.
  4. Aggregate every error (bad time, no colon, unrecognized level,
     malformed second line) with sheet/row/room context, throwing one
     combined error if any occurred — same fail-loud approach as the
     existing schedule plugin, just hand-rolled instead of coming from
     `read-excel-file`'s schema (this file's matrix shape doesn't fit
     that declarative model — needs custom Node/browser-agnostic
     matrix-walking instead).
  - Colocated `parseDetailedScheduleSheet.test.ts`, using **real
    examples from the actual cell catalog** we extracted (not just
    synthetic ones) as fixture rows — multi-level via `&`, multi-level
    via `/`, a session with an explicit `GCA:` line, a co-taught session
    with two `callers` and no `gca`, a `"* "`-prefixed freeform cell,
    and an unprefixed non-conforming cell asserting the aggregated
    error.

**Error message format** — since this file is a grid, not row-per-record,
each aggregated error identifies the cell the same way a person editing
in Excel would find it: the sheet tab, the row's time-slot label, the
column's room name, *and* the literal Excel cell address (derived from
the row/column index, e.g. `F3`) so it can be jumped to directly via
Excel's Name Box. One line per error, all collected into a single thrown
`Error` so a build failure shows the complete list at once, e.g.:

```
Failed to parse data/detailed-schedule.xlsx — 2 error(s):

  Sheet "Thursday July 2", cell F3 (time "12:30p-1:30p", room "Kafka/Lamartine"):
    Unrecognized level code "C5" in "C5 : Dancing - Vic Ceder"

  Sheet "Friday July 3", cell C4 (time "11:00a-12:00p", room "Ballroom West"):
    Cell doesn't match "Level : Type - Caller" and isn't prefixed with "* ":
    "Some malformed text"
```

`parseDetailedScheduleSheet.test.ts` includes a case asserting this exact
error-message shape (sheet/cell/time/room all present, one line per
error, not just a generic "parsing failed").

### Parsing entry point — new `vite-plugin-detailed-schedule.ts`

Mirrors `vite-plugin-schedule.ts`'s structure (build-time only, watches
`data/detailed-schedule.xlsx` in dev) but reads **all sheets** via
`read-excel-file`'s default export (`readExcelFile`, no schema — we
need the raw matrix, not row-per-object parsing), then calls
`parseDetailedScheduleSheet` once per sheet and concatenates the
results. Exposes `virtual:detailed-schedule` (default-exports
`DetailedSessionData[]`), typed via a new
`src/types/virtual-detailed-schedule.d.ts`, registered in
`vite.config.ts` alongside `schedulePlugin()`.

### Storage — `src/lib/buildDetailedSchedule.ts`

Pure `buildDetailedSchedule(data: DetailedSessionData[]):
DetailedSession[]` — converts ISO strings to Dates (matching each
union member) and sorts chronologically ascending, mirroring
`buildSchedule.ts`'s pattern exactly. Colocated
`buildDetailedSchedule.test.ts` with fixture data covering both union
members and sort order.

## Explicitly out of scope (deferred to a later rendering phase)

Any React component, route/page file, nav/tab integration, CSS, the
room × time grid layout, and the color legend.

## Files touched

- `data/detailed-schedule.xlsx` — moved from `scratch/`, with `"* "`
  prefixes added to the 2 non-conforming cells
- `src/lib/parseTimeRange.ts` + test — fix to accept bare `a`/`p`
- `src/lib/parseDetailedScheduleSheet.ts` + test — new
- `src/lib/buildDetailedSchedule.ts` + test — new
- `src/types/detailedSchedule.ts` — new
- `src/types/virtual-detailed-schedule.d.ts` — new
- `vite-plugin-detailed-schedule.ts` — new
- `vite.config.ts` — register the new plugin
- `docs/design/detailed-schedule.md` — new living design doc

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` should pass, including the
  new/updated test files above.
- `pnpm build` should succeed, parsing the real
  `data/detailed-schedule.xlsx` (all 3 sheets, ~150 sessions) with no
  errors. Since nothing imports `virtual:detailed-schedule` yet, verify
  the plugin actually runs correctly via a unit test that calls
  `parseDetailedScheduleSheet`/`buildDetailedSchedule` directly against
  fixture data (not by rendering anything) — consistent with "no
  rendering yet" scope.
