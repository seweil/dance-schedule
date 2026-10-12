# Shared dance-schedule validation — out of the room-grid parser, into one implementation

## Context
Commit `3cc5f1d` made dance-schedule parsing pluggable (`dance-schedule-parsers/`).
Rules about the *data model* still live inside the one format's parser
(`src/lib/parseDanceScheduleSheet.ts`):
- caller double-booking;
- room double-booking;
- level codes must be known values.

Any second parser would silently skip them unless it duplicated them, and
duplicates drift. This is the urgent item at the top of `docs/known-issues.md`.

**Goal:** a single validator over every parser's output, run by the shared loader,
with error messages that still pinpoint the source (sheet + cell today). The
room-grid parser keeps only rules about its own *format* (grid syntax, header,
ditto marks, `ROOMS:` syntax, time-range parsing).

**Decided with the user:** the grid-only check ("`ROOMS:` claims room X, but its
cell isn't blank") is **dropped**. That clash becomes an ordinary room conflict from
the shared validator, with no suppression plumbing between parser and validator.

## Design

### 1. Sessions carry a build-time source location
- New type, defined next to the validator so `src/lib` doesn't import from the
  repo-root `dance-schedule-parsers/`:
  ```ts
  // src/lib/validateDanceSessions.ts
  export interface SourcedDanceSession {
    session: DanceSessionData
    // Where the parser found it, in the format's own terms — the prefix of any
    // error about this session, e.g.
    // 'Sheet "Thursday July 2", cell C2 (time "12:30p-1:30p", room "Ballroom East")'.
    source: string
  }
  ```
- `DanceScheduleParseResult.sessions` (`dance-schedule-parsers/types.ts`) becomes
  `SourcedDanceSession[]`. `source` is **required**, so every parser must say where a
  session came from.
- `loadDanceScheduleData` strips `source` before returning `DanceSessionData[]`, so
  it never reaches `virtual:dance-schedule` or the content-sets date ranges.

### 2. `parseDanceScheduleSheet` changes (`src/lib/parseDanceScheduleSheet.ts`)
- **Remove:**
  - the fourth pass (`ROOMS:` claimed-cell-not-blank) and `conflictedRoomsThisRow`;
  - the fifth pass (caller and room bookings);
  - `Booking`, `overlapsBooking`, `checkAndRecordBooking`, and the per-sheet
    `callerBookings`/`roomBookings`.
- **Add** `sources: string[]`, parallel to `sessions`, pushed at the one place
  sessions are pushed (the final `parsed.forEach`). Each entry uses the same prefix
  the existing `rowError` builds:
  `Sheet "…", cell X (time "…", room "…")`.
  - Parallel arrays rather than wrapping each session keep the 60-odd existing
    `sessions` assertions in its test file untouched.
  - `roomGrid.ts` zips the two into `SourcedDanceSession[]`.
- **Level codes:** the parser keeps rejecting an unknown level as a *syntax* error
  for that cell, which drops the session. It now does so through the shared helper
  below instead of its private `isValidLevel`/`LEVEL_ALIASES`.

### 3. Shared level-code helper — new `src/lib/levelCodes.ts` (+ test)
- `isLevelCode(value: string): value is LevelCode`.
- `normalizeLevelCode(raw: string): string` applies the alias map, currently
  `Advanced` → `A2`. The `LEVEL_CODES` comment in `src/types/danceSchedule.ts`
  points at the alias map, so update that pointer.
- Used by the room-grid parser now, by any future text-based parser, and by the
  validator's invariant check. One definition of what a valid level is.

### 4. The validator — new `src/lib/validateDanceSessions.ts` (+ test)
`validateDanceSessions(sessions: SourcedDanceSession[]): string[]` is pure and
format-agnostic. It processes sessions in source order: the first booking wins,
and the conflict is reported on the later one, matching today.

- **Caller double-booking:**
  - Each headline caller (`session.callers`, de-duplicated per session) may not
    overlap themselves.
  - GCA credits are excluded, as today.
  - Overlap is half-open, so back-to-back sessions are fine, as today.
- **Room double-booking:** each `located` room (de-duplicated per session) may not
  overlap itself.
- **Level invariant:** every structured session's levels pass `isLevelCode`. This
  is a safety net for a parser that casts. For room-grid it never fires, because
  the parser already rejected those cells.
- **Message shape:**
  `${later.source}: caller "Vic Ceder" is already booked by ${earlier.source}`,
  and the same for `room "…"`.
  - Both ends are full source labels. That's format-neutral and still unambiguous
    if a conflict ever spans two sheets.
- **Comparison uses absolute datetimes, not per sheet.** Different days still can't
  conflict, because the times carry dates. As a side benefit, a session running
  past midnight is now checked against the next day's early sessions, which the
  per-sheet check couldn't do.

### 5. Wire into the loader (`dance-schedule-parsers/index.ts`)
`loadDanceScheduleData`:
1. calls `parser.parse`;
2. then runs `validateDanceSessions` on the sessions it returned;
3. puts both error lists in one array, the parser's first;
4. throws the same aggregated `Failed to parse <file> — N error(s)` message.

A cell that failed to parse is never in `sessions`, so it can't cause a knock-on
conflict, same as today.

## Behavior changes (intentional, all build-time error reporting only)
- **Wording:** the double-booking messages now name the earlier session by its
  full source label (e.g. `…already booked by Sheet "Thursday July 2", cell B2 (time …, room …)`)
  instead of `…already booked in cell B2 (time …)`.
- **`ROOMS:` clash:** it's now reported as a room conflict on the *other* cell (the
  later one in source order), not as "claims room X, but its cell isn't blank" on
  the `ROOMS:` cell.
- **Error order:** validation errors come after all parse errors, instead of
  interleaved per row.
- **Unchanged:** the parsed data, for any valid schedule. The committed
  `dance-schedule-dump.md` files must stay byte-identical.

## Tests
- **Moved:** `parseDanceScheduleSheet.test.ts`'s "double-booking" describe block
  and the two "isn't blank" cases leave that file. Their scenarios move to
  `validateDanceSessions.test.ts`, built from plain `SourcedDanceSession` fixtures
  with no spreadsheet rows. Cases:
  - same caller at the identical time in two rooms;
  - same caller at overlapping, non-identical times;
  - back-to-back sessions are fine;
  - different callers are fine;
  - a duplicated co-caller name within one session is fine;
  - a duplicated room in one `ROOMS:` list is fine;
  - GCA is ignored;
  - room conflict across rows;
  - a ditto-spanned room conflicting later;
  - the former `ROOMS:` clash;
  - an unknown level code;
  - a conflict reported on the later session in source order;
  - a past-midnight session overlapping the next day.
- **New in the parser's tests:** `sources` lines up with `sessions` and carries the
  sheet/cell/time/room label. The duplicated-name and duplicated-room cases stay as
  parse tests, which check that the session is produced at all.
- **End to end:** one `dance-schedule-parsers/index.test.ts` case where a stub
  parser returns two overlapping sessions. It checks that the validator's error
  reaches the aggregated message, that parser errors come first, and that the
  returned data has no `source`.
- **`levelCodes.test.ts`:** alias normalization, known and unknown codes.

## Docs
- `docs/known-issues.md`: remove the urgent item. Its history moves into the design
  doc.
- `docs/design/dance-schedule.md`:
  - "Double-booking" decision: now enforced by the shared validator, on absolute
    times rather than per sheet, with the new message shape.
  - "Pluggable parsers": the required `source`, and the loader running
    validation; remove its "known gap" bullet.
  - "Where the code lives": add `validateDanceSessions.ts` and `levelCodes.ts`.
- `docs/adding-a-new-event.md`: if it quotes the double-booking or "isn't blank"
  messages, update the examples to the new wording.

## Verification
- `pnpm typecheck && pnpm lint && pnpm test`.
- `pnpm build`: no `content/*/data/dance-schedule-dump.md` changes in `git status`.
  That proves the parsed data is identical for every set.
- Manual: temporarily add a double-booked caller to `content/test/data/dance-schedule.xlsx`
  via a copy, or check with a unit-level fixture instead of editing a workbook.
  Confirm `pnpm build:test` fails with the new message naming both cells, then
  revert. Prefer the fixture route if editing the xlsx is awkward;
  `scripts/edit-test-data.mjs` exists for programmatic edits.
- `pnpm test:e2e` (run by you, since this session's sandbox blocks Chromium). Data
  is unchanged, so this is a regression guard only.
