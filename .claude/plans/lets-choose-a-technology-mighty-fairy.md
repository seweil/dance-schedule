# Dance schedule: room-spanning and roomless sessions (data model + parsing)

## Context

Before building the real dance-schedule display page (a room-column × time-row grid —
already discussed and deferred, see "Next phase" at the end of this doc), the data
model and parser need to support two kinds of sessions the real display will eventually
need to render:

1. **Room-spanning sessions** — one session that covers 2+ rooms at once (e.g. a
   combined general session across two adjacent ballroom sections).
2. **Roomless sessions** — a block of calendar time not tied to any specific room at
   all (e.g. a lunch break).

Today's data model has exactly one `room: string` per session, and nothing in
`data/dance-schedule.xlsx` represents either case yet. This phase extends the type,
the parser, and every existing consumer to support both, and adds real example rows to
the actual spreadsheet so the whole pipeline is exercised end-to-end, before any
display work begins.

## Decisions (confirmed with the user)

### Authoring convention: a `ROOMS:` text line inside the cell, not merged Excel cells
Confirmed by research: `read-excel-file` (the library already parsing this data) has
**zero merged-cell support** — its return type is a bare `(CellValue|null)[][]` matrix
with no merge/span metadata anywhere in its API, and this isn't a version gap, it's
architecturally out of scope for the library. Switching to a library that does support
merges (e.g. `exceljs`) would mean replacing the foundation the whole data pipeline is
built on, for this feature alone — too big a change.

Instead, a session's room(s) are declared with a `ROOMS:` line inside the cell text,
exactly mirroring the existing `GCA:` line convention:

```
SSD : Combined Dance - Vic Ceder
ROOMS: Ballroom Centre, Ballroom East
```

entered once, in **one** of the spanned rooms' cells for that time row; the other
spanned rooms' cells for that same row are left blank.

### Ditto mark (`"`): spatial shorthand for the common contiguous-room case
For the common case — a session spanning rooms that sit right next to each other as
columns — typing out `ROOMS: A, B` is more ceremony than a spreadsheet author should
need. A cell whose entire (trimmed) content is a single `"` (ditto mark, the familiar
paper convention for "same as before") means "this room is part of the same session as
the cell **immediately to its left** in this row":

```
Ballroom Centre        Ballroom East   Ballroom West
SSD : Combined Dance    "               (blank)
- Vic Ceder
```

No `ROOMS:` line is needed for this case — the parser builds the room list itself from
the content cell plus every contiguous run of ditto cells to its right. Scoped strictly
**horizontal/left-neighbor** for now (not a general "   repeat the cell above" convention —
that's a different, unrelated idea and out of scope here).

Rules, kept simple and fail-loud:
- A ditto cell with no real content immediately to its left (row start, or the
  immediately-preceding cell is blank) → parse error (dangling ditto).
- A ditto chain must be contiguous — a blank cell breaks the chain; a later ditto after
  a gap has nothing valid to attach to → error.
- A content cell that has **both** an explicit `ROOMS:` line **and** ditto cells pointing
  at it from the right → error (ambiguous — pick one mechanism, not both).
- The explicit `ROOMS: <list>` convention still exists for the case ditto can't express:
  non-adjacent rooms, or an author who just prefers to type it out.

### Roomless sessions: `ROOMS: NONE`, a distinct sentinel — not "all rooms"
A roomless block (lunch, a break) has **no** room association at all — it is not the
same thing as "spans every currently-known room." `ROOMS: NONE` is its own explicit
value, entered in any single cell for that time row (the choice of which column doesn't
matter semantically once `NONE` is used):

```
* Lunch Break
ROOMS: NONE
```

### Room list validation: must be complete and must include the cell's own room
`ROOMS: <list>` must name every room the session occupies, **including** the room the
cell is physically sitting in — no implicit "plus wherever it's typed" behavior. Two new
parse errors, in addition to existing ones:
- A room named in `ROOMS:` that doesn't exist in that sheet's header row → error
  (probably a typo).
- The cell's own room is missing from its own `ROOMS:` list → error (the list must be
  complete, not "additional rooms besides this one").

### Cross-room content collision: still validated (this is not the adjacency question)
For a `ROOMS:` list with more than one room, every other room named must have a **blank**
cell in that same row — if a spreadsheet author accidentally puts content in more than
one of the spanned rooms' cells for the same row, that's a real ambiguity and fails the
build with a descriptive error (sheet, row, the conflicting cell). This is a distinct,
narrower check from adjacency (below) — it's about duplicate/conflicting content, not
about column order.

### Adjacency of spanned rooms: not validated in this phase
Whether the rooms named in a `ROOMS:` list end up next to each other as columns is a
concern for the future *display* phase (rendering a visual span only makes sense across
contiguous columns) — this phase stores the room list exactly as given, with no
adjacency check. Revisit if/when the display phase needs it.

### Parser restructuring: metadata lines extracted generically, before branching
Today, `parseCell` only recognizes an optional second line as a `GCA:` line, specific to
structured sessions. Both `GCA:` and the new `ROOMS:` line need to work as **generic
trailing metadata lines**, applicable to structured *and* freeform cells alike (a
roomless lunch break is freeform + `ROOMS:`, not structured). New approach: scan lines
from the bottom of the cell text; while the last remaining line matches `GCA:` or
`ROOMS:` (case-insensitive), pop and classify it (at most one of each; either order).
Whatever's left after that is the "main content," parsed exactly as before (freeform
`"* "` prefix, or `Level(s) : Type - Caller(s)`). No `ROOMS:` line present → default
behavior unchanged: `{ kind: 'located', rooms: [<the cell's own room>] }` — so all 151
existing real sessions parse identically to today.

Row processing gets an extra pass on top of this, for the ditto mark: before parsing
non-ditto cells with the logic above, scan each row left-to-right and resolve ditto
chains (a run of `"`-only cells following a content cell) into room lists, per the
ditto rules above. A ditto cell is never itself passed through `parseCell` — it's pure
room-list plumbing, not a session of its own.

### Real example data: added to the actual spreadsheet now, not just synthetic fixtures
Two real edits to `data/dance-schedule.xlsx`, chosen from natural gaps/entries already in
the real schedule (verified against the current `data/dance-schedule-dump.md`):

1. **Room-spanning example** — Friday July 3, "All Callers Dance" (10:15–11:00 AM,
   currently only in the `Ballroom Centre` column, and `Ballroom East`'s cell for that
   row is already blank): put a ditto mark (`"`) in the `Ballroom East` cell for that
   row, leaving the existing "All Callers Dance" cell text untouched. A real, plausible
   edit — an all-attendee event happening in a larger combined space, and this is
   probably how a real spreadsheet author would actually do it (adjacent rooms, no need
   to type room names out) — low-risk since it only touches one currently-blank cell.
   The explicit `ROOMS: <list>` form (for non-adjacent rooms) is exercised by synthetic
   parser tests only, since no real non-adjacent multi-room session exists yet.
2. **Roomless example** — insert one new time-slot row on **Friday** (the
   11:00 AM–12:00 PM block is followed by a gap before 1:30 PM — insert `12:00p-1:30p`)
   and one on **Saturday** (11:00 AM–12:00 PM is followed by a gap before 2:00 PM —
   insert `12:00p-2:00p`), each with `"* Lunch Break\nROOMS: NONE"` in a single cell.
   This is a genuine new row, not just a text edit — riskier than (1), so it needs a
   write-capable library (`exceljs`, added temporarily the way it was for the earlier
   one-off `"* "`-prefix script) and careful before/after verification: re-parse and
   diff `data/dance-schedule-dump.md` to confirm *only* the intended new content
   appears, nothing else in either sheet shifted or changed.

## Data model changes (`src/types/danceSchedule.ts`)

Replace `room: string` in `SessionBase` with a discriminated `location`:

```ts
export type SessionLocation =
  | { kind: 'located'; rooms: string[] }  // 1+ rooms; length 1 is today's normal case
  | { kind: 'roomless' }                   // no room at all (lunch, breaks, etc.)

interface SessionBase {
  date: string
  startTime: string
  endTime: string
  location: SessionLocation
}
```

Applies identically to both the ISO-string `*Data` variants and the resolved
`Date`-object variants (`location` needs no date conversion, just passthrough in
`buildDanceSchedule.ts`).

## Files touched

- `src/types/danceSchedule.ts` — `room: string` → `location: SessionLocation` (above).
- `src/lib/parseDanceScheduleSheet.ts` (+ test) — the metadata-line restructuring above;
  `ROOMS:` parsing (`NONE` vs. comma-separated list); room-name validation against the
  header row; own-room-must-be-included validation; cross-room blank-cell validation.
  Existing tests should keep passing unchanged (default/no-`ROOMS:` behavior is
  identical); new table-driven cases cover: `ROOMS: NONE` on a freeform cell, a
  multi-room `ROOMS:` list on a structured cell, `ROOMS:` + `GCA:` together (either
  order), an unrecognized room name, a missing own-room, a content collision in a
  claimed-but-non-blank room, a 2-cell and a 3-cell ditto chain, a dangling ditto (row
  start / preceded by a blank), a ditto chain broken by a gap, and a cell with both an
  explicit `ROOMS:` line and trailing ditto cells (error).
- `src/lib/buildDanceSchedule.ts` (+ test) — pass `location` through unchanged instead of
  `room`.
- `src/lib/formatDanceScheduleMarkdown.ts` (+ test) and `src/components/
  RawDanceScheduleTable.tsx` (+ test) — Room column rendering: `located` → room names
  joined with `, `; `roomless` → an explicit placeholder (e.g. `—`) rather than a blank
  cell, so it's visually distinct from "forgot to fill this in."
- `data/dance-schedule.xlsx` — the two real edits above (one existing-cell edit, one
  new-row insertion per sheet), done via a one-off script, verified via a dump diff.
- `docs/design/dance-schedule.md` — this is the **same** living design doc as the
  original data-model/parsing phase (not a new file) — add new Sub-problems/Decisions
  entries here for room-spanning and roomless sessions, consistent with the "living doc,
  updated in place" convention.

**Not touched in this phase:** no display/rendering component, no room-order/adjacency
plumbing beyond what's described above, no `vite-plugin-dance-schedule.ts` structural
change (still emits `DanceSessionData[]`, just with the new `location` shape per
element).

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — existing + new parser/formatter tests.
- `pnpm build` — confirms the real (now-edited) `data/dance-schedule.xlsx` still parses
  cleanly, including the two new real examples, and regenerates
  `data/dance-schedule-dump.md` — diff it manually to confirm only the intended two
  changes appear (the `ROOMS:` addition to "All Callers Dance," and the two new lunch
  rows), nothing else shifted.

## Next phase (deferred, already discussed in this conversation)

Once this lands, the next phase is the real user-facing dance-schedule display page — a
time-proportional, room-columns grid with a date selector, a dual-thumb skill-level
slider (`@radix-ui/react-slider`), and a GCA show/hide checkbox — already designed in
detail earlier in this conversation. That design will be revisited and adjusted to
consume the new `location`-based data model (in particular, a `roomless` session
rendering as a full-width banner, and a `located` session with 2+ rooms rendering as a
column-spanning block) before being turned into its own plan.
