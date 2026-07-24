# Detailed schedule (data model, parsing, storage)

## Context

The simple schedule page (`docs/design/schedule-page.md`) shows a flat
list of events grouped by date. The user wants a much richer "Detailed
Schedule" — a **new page/tab**, existing alongside the simple schedule
(which is untouched by this work) — modeled on a real multi-day dance
convention: multiple rooms running in parallel, skill-level tracks,
named callers, and standalone one-off events.

The user provided both a reference PDF (`scratch/Dance Schedule.pdf`,
kept for context) and the **actual real source spreadsheet**
(originally `scratch/Dance-Schedule.xlsx`, now `data/detailed-schedule.xlsx`)
for a real convention (Montreal Mix 2026). This phase covers **only the
data model, parsing, and storage** for that source file — no page,
route, nav/tab integration, or rendering yet; that's deliberately a
separate, later phase.

## Sub-problems

- [x] What does the real source file actually contain? — see Decisions
- [x] Parse the existing format vs. ask for re-entry into clean columns
      — see Decisions
- [x] How to determine each session's date (sheet names have no year)
      — see Decisions
- [x] How to model multi-level sessions (two different separators seen
      in real data) — see Decisions
- [x] Level code validation — see Decisions
- [x] How to model caller(s) vs. the optional "GCA" role — see Decisions
- [x] How to handle cells that don't match the expected pattern — see
      Decisions
- [x] Time format support (real data uses bare "a"/"p" with no "m") —
      see Decisions
- [x] Error message format, so a spreadsheet maintainer can find and fix
      a problem in Excel — see Decisions
- [x] Where the parsing/storage code lives — see Decisions

## Decisions

### The real source file's actual shape
**What we found** (inspected directly with `read-excel-file`, not
inferred from the PDF): **3 sheets, one per day** (`"Thursday July 2"`,
`"Friday July 3"`, `"Saturday July 4"`) — sheet names are weekday +
month + day, no year, and there's no date column anywhere. Each sheet is
a genuine grid: row 1 = room names (varies per sheet — Friday has no
"Salon 6/7" column), each following row = a time slot in column 0 (e.g.
`"12:30p-1:30p"`), each remaining cell = one compound-text session (e.g.
`"Plus : Dancing - Kris Jensen\nGCA: Tim Stephens"`) or empty. Extracted
from all ~150 real cells: level prefixes actually used are `SSD`, `Plus`,
`C1`, `C2`, `C3A`, `C3B`, `C4`, `A1`, `A2`, `Intro`, `Various`, plus
combined forms `"C1 & C2"` and `"A1/A2"` (two different separators);
exactly 2 cells have no colon at all (`"Intro to calling - Bill Eyler"`,
`"Country Western Dance - until 1am"`); the GCA line is optional; some
cells have two co-callers joined by `&` in the caller position (e.g.
`"Michael Kellogg & Terri Sherrer"`), the same character used for
multi-level.

### Parse the existing grid format directly
**Why:** ~150 real sessions already exist in this exact format. Asking
for manual re-entry into clean columns would be significant, error-prone
busywork for no real benefit — the parser can absorb the complexity
instead. Rejected alternative: re-enter everything into one-row-per-
session clean columns (simpler parsing, but throws away real, already-
correct data entry).

### Dates come from the sheet name + year inference
**Why:** No spreadsheet changes needed. Strip the leading weekday word
(`/^\w+day\s+/i`) from the sheet name (`"Thursday July 2"` → `"July 2"`)
and feed the remainder to the existing `parseEventDate` (`src/lib/`),
whose year-inference heuristic (assume current year, roll to next if
that's >6 months in the past at build time) already handles a year-less
date. Reused unchanged from the simple schedule's parser.

### Multi-level sessions: one record with an array of levels
**Why:** Faithful to reality — it's one session serving two levels, not
two sessions. The level-portion (text before the first `:`) is split on
`/[&/]/` to support **both** real separators (`"C1 & C2"` and
`"A1/A2"`), each piece validated against a fixed `LEVEL_CODES` list
(`src/types/detailedSchedule.ts`) — an unrecognized code fails the
build. `LEVEL_CODES` includes `MS`/`Advanced` preemptively (present in
the convention's printed legend but not in this 3-day excerpt's actual
data) alongside everything actually observed, including the informal
`Intro`/`Various` tags — easy to adjust later if the taxonomy turns out
to need it.

### Callers are a list; GCA is a separate, distinctly-triggered field
**Why (a real correction made mid-design):** initially assumed a co-
caller joined by `&` (e.g. `"Michael Kellogg & Terri Sherrer"`, no
separate GCA line) should be split into `(caller, gca)`. That's wrong —
a session can have **multiple primary callers**; `&` there just joins
co-teachers. `callers: string[]` always holds the primary caller(s).
`gca` is populated **only** when an explicit line starting with `GCA:`
follows the main description — never inferred from an `&` in the caller
position. This is why `levels` and `callers` are separate array fields
using the same `&`/`/` characters, but resolved independently by parse
*position* (level-portion is only the text before the first `:`;
caller-portion is only the text between the type's `-` and either the
end of the first line or a following `GCA:` line) — never by a single
whole-string split.

### Non-conforming cells: an explicit `"* "` prefix, otherwise fail loud
**Why:** A cell whose text starts with `"* "` is treated as a literal
freeform description (`FreeformSessionData`, no structured parsing
attempted). Anything else that doesn't match `"Level : Type - Caller(s)
[GCA: Name]"` **fails the build** — consistent with this project's
fail-loud philosophy for spreadsheet data (`docs/design/schedule-page.md`).
The 2 real non-conforming cells found got the `"* "` prefix added
directly (`data/detailed-schedule.xlsx`), rather than having the parser
guess at an unstated pattern.

### Time format: reused, extended to accept bare `a`/`p`
**Why:** The real data uses `"12:30p-1:30p"` — no trailing `m` at all.
`src/lib/parseTimeRange.ts`'s `TIME_PATTERN` regex was updated to make
the `m` optional (`([ap])\.?(?:m\.?)?` instead of requiring `m`), so
`"12:30p"`/`"12:30pm"`/`"12:30 PM"`/`"12:30 p.m."` all parse identically.
Table-driven test cases cover the bare form; all prior formats keep
working (verified — the full existing `parseTimeRange.test.ts` suite
still passes unchanged).

### Error message format: sheet + Excel cell reference + time + room
**Why:** The user explicitly needs a well-formatted error list so a
non-technical spreadsheet maintainer can find and fix a problem in
Excel. Each error names the sheet tab, the literal Excel cell address
(e.g. `F3`, computed from the row/column index) *and* the human-readable
time-slot and room labels, so it's findable either via Excel's Name Box
or by eye. `parseDetailedScheduleSheet` (`src/lib/`) doesn't throw
per-cell — it returns `{ sessions, errors }`, letting
`vite-plugin-detailed-schedule.ts` aggregate errors across all 3 sheets
into **one** thrown error listing everything at once:

```
Failed to parse data/detailed-schedule.xlsx — 1 error(s):

  Sheet "Thursday July 2", cell F2 (time "12:30p-1:30p", room "Hemon"):
    Unrecognized level code "C5" in "C5 : Dancing - Vic Ceder"
```

(This exact message was produced by a real end-to-end test: temporarily
corrupting one real cell and confirming the build/parse failure showed
this precise format, then restoring the real file.)

### Where the code lives
- `src/types/detailedSchedule.ts` — `LEVEL_CODES`/`LevelCode`, the
  `StructuredSessionData`/`FreeformSessionData` discriminated union
  (`DetailedSessionData`) crossing the virtual-module boundary as ISO
  strings, and the Date-object `DetailedSession` equivalent.
- `src/lib/parseDetailedScheduleSheet.ts` (+ colocated test, using real
  examples from the actual cell catalog) — the pure matrix-walking
  parser for one sheet.
- `src/lib/buildDetailedSchedule.ts` (+ test) — converts ISO-string data
  to Date objects, sorted chronologically; mirrors `buildSchedule.ts`'s
  pattern exactly.
- `vite-plugin-detailed-schedule.ts` — resolves `virtual:detailed-schedule`
  (typed via `src/types/virtual-detailed-schedule.d.ts`) by reading
  **every sheet** via `read-excel-file`'s default export (`readExcelFile`,
  not the schema-based `readSheet` — this file's matrix shape doesn't
  fit the row-per-object schema model the simple schedule uses) and
  calling `parseDetailedScheduleSheet` per sheet. Mirrors
  `vite-plugin-schedule.ts`'s build-time-only, dev-file-watching
  structure. Registered in `vite.config.ts` alongside `schedulePlugin()`.

**Verified end-to-end** (not just unit tests): the real
`data/detailed-schedule.xlsx` parses all **151** real session cells with
**zero errors**; spot-checked the trickiest real cases directly
(multi-level via `&`, multi-level via `/`, co-callers with no GCA, both
`"* "`-prefixed freeform cells, and correct date resolution for all 3
days) against the actual parsed output.

## Open questions

(none yet — rendering is a deliberately separate, later phase)
