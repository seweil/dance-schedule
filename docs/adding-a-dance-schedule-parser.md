# Adding a dance-schedule parser for a new spreadsheet format

The procedure to follow when an organizer sends a schedule that isn't in our
`room-grid` format (`dance-schedule.xlsx`: one sheet per day, rooms as columns,
time slots as rows, `Level : Type - Caller [GCA: Name]` cells).

Architecture background: `docs/design/dance-schedule.md`, "Pluggable parsers"
and "Double-booking". In short:
- A parser turns one source file into `SourcedDanceSession[]`, the shared data
  model plus a source label per session.
- The shared loader runs the data-model validator (double-booking, level codes)
  over every parser's output. **A parser never re-implements those rules.**
- Nothing downstream of parsing changes, so no page, grid or e2e test needs to
  know about a new format.

## 0. Is it really a new format?

Most of the work below only pays off for a format that will be reused, or for one
that's genuinely different. Check these cheaper outcomes first:

- **It already fits `room-grid`,** or nearly: different sheet names, an extra
  notes tab (prefix it with `-`), or cells that only differ in spacing. Then use
  the existing parser, and maybe extend `parseDanceScheduleSheet` for the small
  difference.
- **It matches a parser added earlier** for another event. Reuse that one.
- **It's a one-off.** Hand-converting it to `room-grid` once may be cheaper than
  a parser. Converting at least one day is still useful, though, as the test
  oracle in step 6.

**Ask the organizer** before building anything:
- Will they keep editing this file and resend it? That's the main reason to
  parse their format rather than convert it.
- Will the layout stay stable between updates?
- Is the file `.xlsx`, or `.csv`, Google Sheets, etc.? The existing tooling
  reads `.xlsx`; Google Sheets can be exported to it.

## 1. Intake: keep the original untouched

- Put the file as received in `content/<event>/scratch/`, named with the date
  received (e.g. `scratch/2027-03-04 schedule from organizer.xlsx`). Nothing in
  the build reads `scratch/`, and it's committed, so the original survives.
- The working copy that the build reads goes in `content/<event>/data/` under
  the new parser's `sourceFileName` (step 3). **Don't hand-edit it to make it
  parse**, except for genuine data errors you confirm with the organizer. The
  point is that the organizer's next resend parses as-is.

## 2. Inspect the structure

Look at the file as the parser will see it, not as Excel displays it. Things a
glance in Excel hides:

- **Cell types.** Date and time cells may arrive as JS `Date`s, numbers or
  strings, and the same column can mix them.
- **Merged cells.** `read-excel-file` reports only the top-left cell of a merge;
  the rest come back empty. A merged block often means "this session spans these
  rooms or slots".
- **Meaning carried by formatting**, such as a fill color for level or bold for
  the headliner. That's invisible to the parser unless read deliberately with
  `exceljs`. Prefer asking the organizer to put it in text.
- **Hidden sheets, rows and columns**, comments, and trailing whitespace.
- **Day boundaries:** one sheet per day, or a date column. And sessions running
  past midnight.

`read-excel-file` (`readExcelFile(path)`, the same call `roomGrid.ts` makes)
gives the raw values the parser gets. `exceljs` is also a dependency, and
reports merges, fills and comments (see `scripts/edit-test-data.mjs` for usage).
A short throwaway script that prints each sheet's first rows from both is enough.
If this becomes a regular task, make it a reusable `scripts/inspect-workbook.mjs`.

## 3. Map it onto the data model

Write a mapping table **before writing code**. It becomes the new format's entry
in `docs/design/dance-schedule.md`. One row per `DanceSessionData` field
(`src/types/danceSchedule.ts`):

| Field | Where it comes from in this format | Notes |
|---|---|---|
| `date` | sheet name? date column? | year inference: `parseEventDate` |
| `startTime` / `endTime` | one "range" cell? two cells? | `parseTimeRange` / `parseTimeOfDay` (`src/lib/parseTimeRange.ts`) |
| `location` | room column? room cell? | `{ kind: 'located', rooms }`, or `{ kind: 'roomless' }` for breaks/meals |
| `kind` | how to tell a dance from a break or note | `structured` vs `freeform` |
| `levels` | | `normalizeLevelCode` then `isLevelCode` (`src/lib/levelCodes.ts`) |
| `eventType` | | default `DEFAULT_EVENT_TYPE` (`src/lib/recognizedSessionKeywords.ts`) |
| `callers` | | headline callers only |
| `gca` | | optional |

Also list:
- **What the format has that the model doesn't.** It gets ignored; say so
  explicitly, so nobody wonders later.
- **What the model needs that the format lacks.** Each gap is a decision: a
  default, a `config.yaml` setting, or a request to the organizer.
- **Ambiguities.** Settle them with the organizer, not by guessing, and record
  the answers as decisions.

Two existing limitations to check for early:
- **Level taxonomy:** a level outside `LEVEL_CODES`, e.g. a round-dance phase,
  can't be represented yet (`docs/known-issues.md`, "Level taxonomy is hardcoded
  to modern western square dance only"). It fails the build until that's
  solved.
- **Room order:** `roomOrder: spreadsheet` in `config.yaml` means *source
  order*, i.e. the order this parser emits sessions. Decide what order that
  should be for this format.

## 4. Name it

- **`format`:** kebab-case, describing the layout, not the event, e.g.
  `session-list`, `caller-grid`. It's what organizers write in `config.yaml`
  and what appears in the unknown-format error.
- **`sourceFileName`:** what the file is called in `data/`. Keep
  `dance-schedule.<ext>` unless it would be confused with a `room-grid` file.
- **`description`:** one line, shown in the unknown-format error message.

## 5. Implement

Follow the `room-grid` split: a pure parsing function, plus a thin wrapper that
does the file I/O.

1. **`src/lib/parse<Format>.ts`, the pure parser** (raw rows in, no I/O).
   - Return `{ sessions, sources, errors }`, the same shape as
     `parseDanceScheduleSheet`:
     - `sources[i]` is a label that tells an organizer exactly where session
       `i` is in *their* file, e.g. `Sheet "Friday", row 14 (time "2:00p")`.
       The shared validator prefixes its errors with it, so make it
       findable.
     - `errors` holds **format** problems only: unparseable cells, missing
       headers, unknown columns, unrecognized level text. Report them,
       don't throw, and keep going so every problem shows up in one build.
   - **Don't** check double-booking or level validity beyond rejecting
     unparseable text. `validateDanceSessions` does that for every format.
   - Reuse the existing helpers: `parseEventDate`, `parseTimeRange`/
     `parseTimeOfDay`, `normalizeLevelCode`/`isLevelCode`,
     `DEFAULT_EVENT_TYPE`.
2. **`dance-schedule-parsers/<format>.ts`, the `DanceScheduleParser`.**
   - Reads the file and calls the pure parser.
   - Zips `sessions` and `sources` into `SourcedDanceSession[]`.
   - Copy `roomGrid.ts`'s shape.
3. **Register it** in `DANCE_SCHEDULE_PARSERS` (`dance-schedule-parsers/index.ts`).
   - That's the only wiring needed. Selection, file watching, validation and
     the dump all come from the existing loader.

## 6. Test

- **Pure-parser unit tests** (`src/lib/parse<Format>.test.ts`), table-driven,
  like `parseDanceScheduleSheet.test.ts`.
  - Use rows copied from the **real file**, including its oddities, plus every
    error case.
  - Check the `sources` labels too.
- **A parser smoke test** (`dance-schedule-parsers/<format>.test.ts`), like
  `roomGrid.test.ts`.
  - Parse a small fixture in this format: no errors, non-empty, and every
    session labelled.
  - The fixture can be a trimmed, anonymized copy of the organizer's file,
    committed next to the test. **Don't create a new content set just for
    testing;** content sets get published.
- **Equivalence check, the strongest one:**
  1. Hand-convert one or two days of the organizer's file to `room-grid`.
  2. Build each version.
  3. Diff the two `dance-schedule-dump.md` outputs.
  - They should be identical. Any difference is either a parser bug or a
    genuine mapping decision, which goes in the design doc.
- **No new e2e tests needed:** the pages only ever see the shared data model.

## 7. Wire up the event and review

1. In `content/<event>/config.yaml`, set `danceSchedule.format: <format>`.
2. Run `pnpm build`, or `CONTENT_SET=<event> pnpm dev`.
   - Fix everything in the aggregated error list.
   - Data errors go back to the organizer with the exact source labels.
3. **Review `content/<event>/data/dance-schedule-dump.md`** against the
   organizer's file, day by day. It's the human-readable record of what the
   parser understood, and it's committed, so each future resend shows up as a
   reviewable diff.
4. Spot-check the Room, Dance and Caller Schedule pages, using `?now=<time>` to
   see the current-time line on any day.

## 8. Document

- **`docs/design/dance-schedule.md`:** a decision entry for the format, with the
  mapping table from step 3, the decisions on gaps and ambiguities, and the
  source-label format.
- **`docs/adding-a-new-event.md`:** add the format to "Dance-schedule input
  format" in Step 2, with its file name and a short authoring guide for
  organizers.
- **`CLAUDE.md`:** mention the new parser where `dance-schedule-parsers/` is
  described, if it adds anything beyond "another implementation".
- **`docs/known-issues.md`:** anything deferred, e.g. a field the format can't
  express yet.

## When the organizer resends

1. Drop the new file into `data/`, keeping the previous original in `scratch/`.
2. Build, and read the `dance-schedule-dump.md` diff. It should show only the
   changes they intended.
3. If the build fails on the *format* (a new column, a renamed header), decide
   whether to extend the parser or ask the organizer to keep the layout stable.
   Extend the parser's tests with the new case either way.
