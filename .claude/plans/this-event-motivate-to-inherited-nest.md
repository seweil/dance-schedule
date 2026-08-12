# Rationalize spreadsheet "magic keywords"

## Context

Both source spreadsheets (`event-schedule.xlsx`, `dance-schedule.xlsx`) rely on a
number of exact literal strings/tokens that trigger special parsing or rendering
behavior, beyond ordinary free-text cell content — column headers, cell-syntax
markers (`* `, `GCA:`, `ROOMS:`, `"`), recognized level codes, and a couple of
recognized *values* within already-parsed fields (an event-type string, two
caller-name placeholders). A full-codebase sweep (below) found these are already
each individually well-defined and mostly single-sourced, but:

1. Three "downstream classification" magic values — `DEFAULT_EVENT_TYPE`,
   `GCA_CALLER_SHOWCASE_EVENT_TYPE`, `ALL_HEADLINERS_CALLER_NAMES` — are scattered
   across three unrelated files by historical accident (each added at a different
   time, in whichever file happened to need it first), even though they're the
   same *kind* of thing: an exact-match literal recognized in already-parsed
   session data, not spreadsheet syntax itself. `ALL_HEADLINERS_CALLER_NAMES`'s own
   comment already explicitly cites `GCA_CALLER_SHOWCASE_EVENT_TYPE` as "same
   one-hardcoded-string-set precedent" — the code itself flags this as a repeated
   pattern, not a coincidence.
2. Several real, currently-recognized keywords are entirely undocumented in
   `docs/adding-a-new-event.md` (the user-facing authoring guide), so an event
   organizer has no way to discover them.
3. `docs/design/dance-schedule.md`'s own "Caller-columns view" decision section is
   now stale — it still says a callerless session is "skipped entirely, not
   floated," which was true before this session's "All Headliners" floating fix
   (commit `715bf59`) and is no longer accurate.

Goal: consolidate the three scattered classification constants into one
purpose-built module (a real code change, not just documentation), and fix the
doc gaps/staleness so the inventory below stays discoverable and accurate going
forward.

## The full inventory (for reference — this table is also given directly in chat)

| # | Keyword / token | Where (file, field) | Defined in | Documented in adding-a-new-event.md? |
|---|---|---|---|---|
| 1 | `Date`, `Start time - End time`, `Location`, `Description` | event-schedule.xlsx header row | `vite-plugin-schedule.ts` | Yes |
| 2 | Date formats (ISO/slash/long, year-optional) | event-schedule.xlsx `Date`; dance-schedule.xlsx sheet names | `parseEventDate.ts` | Yes |
| 3 | Time-range formats (`-`/`–`/`—`/`to`, meridiem-optional) | `Start time - End time`; dance-schedule.xlsx column A | `parseTimeRange.ts` | Yes (dash variants not called out) |
| 4 | Sheet name prefix `-` | dance-schedule.xlsx sheet/tab name | `parseDanceScheduleSheet.ts` (`NON_SCHEDULE_SHEET_PREFIX`) | **No** |
| 5 | Sheet name `Weekday Month Day` | dance-schedule.xlsx sheet name | `parseDanceScheduleSheet.ts` | Yes |
| 6 | Level codes `SSD,MS,Plus,C1,C2,C3A,C3B,C4,A1,A2,Intro,Various` | cell level portion | `types/danceSchedule.ts` (`LEVEL_CODES`) | Yes |
| 7 | Level alias `Advanced` → `A2` | cell level portion | `parseDanceScheduleSheet.ts` (`LEVEL_ALIASES`) | Yes |
| 8 | Level separators `&`, `/` | cell level portion | `parseDanceScheduleSheet.ts` (`LEVEL_SEPARATOR`) | Yes |
| 9 | `Intro`, `Various` unordered levels | cell level portion | `levelOrder.ts` (`UNORDERED_LEVELS`) | Partial (listed as valid codes; special "always visible" behavior not explained) |
| 10 | `:` splitting level from rest | cell content | `parseDanceScheduleSheet.ts` | Yes (via format `Level : Type - Caller`) |
| 11 | `' - '` splitting type from caller(s) | cell content | `parseDanceScheduleSheet.ts` | Implied by example, not stated as a strict rule |
| 12 | Caller separator `&` | cell caller portion | `parseDanceScheduleSheet.ts` | Yes |
| 13 | Freeform prefix `'* '` | cell content | `parseDanceScheduleSheet.ts` (`FREEFORM_PREFIX`) | Yes |
| 14 | `GCA:` trailing line | cell content, 2nd line | `parseDanceScheduleSheet.ts` (`GCA_PREFIX`) | Yes (case-insensitivity not noted) |
| 15 | `ROOMS:` trailing line | cell content, 2nd/3rd line | `parseDanceScheduleSheet.ts` (`ROOMS_PREFIX`) | Yes (case-insensitivity not noted) |
| 16 | `ROOMS: NONE` | value of `ROOMS:` line | `parseDanceScheduleSheet.ts` (`ROOMS_NONE`) | Yes (case-insensitivity not noted) |
| 17 | Ditto mark `"` | cell content | `parseDanceScheduleSheet.ts` (`DITTO_MARKER`) | Yes |
| 18 | `Dancing` (implied default event type) | cell content, omitted `Type -` | `types/danceSchedule.ts` (`DEFAULT_EVENT_TYPE`) | Yes |
| 19 | `GCA Caller Showcase Dance` | value of parsed `eventType` | `computeDanceScheduleHourSummary.ts` (`GCA_CALLER_SHOWCASE_EVENT_TYPE`) | **No** |
| 20 | `All Headliners`, `All Callers` | value(s) of parsed `callers` | `computeDanceScheduleCallerLayout.ts` (`ALL_HEADLINERS_CALLER_NAMES`) | **No** |
| 21 | Excel serial/native date cells | event-schedule.xlsx `Date` | `parseEventDate.ts` | Not called out (non-issue in practice) |

Rows 4, 19, 20 are the real documentation gaps. Rows 18–20 are the three
scattered "downstream classification" constants being consolidated (row 4 is a
raw parser token, correctly staying put — see below).

## Code change: consolidate rows 18–20 into one module

**New file `src/lib/recognizedSessionKeywords.ts`**, with a top-of-file doc
comment explicitly framing it as the answer to "what spreadsheet-derived values
does the app treat specially, downstream of ordinary parsing" — the living
inventory, so a future 4th such value has one obvious place to join instead of
re-deriving the pattern a third time in a fourth random file. Contents (moved,
not duplicated):

- `DEFAULT_EVENT_TYPE` — moved from `src/types/danceSchedule.ts`. Update its
  import in `parseDanceScheduleSheet.ts` and `formatDanceSession.ts`.
- `GCA_CALLER_SHOWCASE_EVENT_TYPE` — moved from
  `src/lib/computeDanceScheduleHourSummary.ts`. Update its import in that file,
  `computeDanceScheduleCallerLayout.ts`, and `computeDanceScheduleHourSummary.test.ts`.
- `ALL_HEADLINERS_CALLER_NAMES` and `isAllHeadlinersSession()` — moved from
  `src/lib/computeDanceScheduleCallerLayout.ts`. Update its import there, and in
  `src/components/DanceScheduleCallerGrid.tsx` (currently imports
  `isAllHeadlinersSession` re-exported from the layout file — repoint it straight
  at the new module instead of through the layout file).

`types/danceSchedule.ts` keeps `LEVEL_CODES` (row 6) as-is — that's a type-level
vocabulary constant (`LevelCode` derives from it), a different kind of thing from
a plain recognized-literal flag, and moving it would touch far more call sites for
no discoverability benefit. Raw cell-syntax tokens (rows 4, 7–8, 10–17) stay in
`parseDanceScheduleSheet.ts` — they're already correctly single-sourced,
parser-internal, and genuinely coupled to the parsing logic that reads them
(unlike rows 18–20, which are read by multiple unrelated downstream consumers).

No behavior change anywhere — pure move + import-path updates. Existing tests for
all three files continue to pass unchanged except for import paths.

## Documentation fixes

**`docs/adding-a-new-event.md`** (step 4, "Cell format details" and "Checking
your work"):
- Document `GCA Caller Showcase Dance` as a recognized event-type value: what
  happens when you use it (omitted entirely from the Caller Schedule page; grouped
  separately as "showcase-only" on the hour-summary tabs/debug page).
- Document `All Headliners`/`All Callers` as recognized caller-placeholder values:
  what happens (floats as a full-width banner across every caller column on the
  Caller Schedule page, instead of getting/needing its own column) and that the
  match is exact and case-sensitive against just these two spellings — a
  differently-worded placeholder (e.g. "Everyone") won't get this treatment.
- Add a short caution against naming a real day-sheet starting with `-` (row 4) —
  reserved for internal generated/utility tabs.
- Note `GCA:`/`ROOMS:` prefixes and `ROOMS: NONE`'s value are matched
  case-insensitively (currently only shown capitalized in examples).
- State the `' - '` (space-hyphen-space) delimiter explicitly as the required
  separator between type and caller, not just implied by example.

**`docs/design/dance-schedule.md`** ("Caller-columns view" section):
- Correct the now-stale "A session with no caller is skipped entirely, not
  floated or given a dedicated 'Other' column" paragraph (~line 1283) — still true
  for freeform (callerless) sessions, no longer true for an all-headliners
  session, which now floats. Similarly correct "this grid needs no roomless-card
  treatment at all" (~line 1372–1383).
- Add a new decision entry after the caller-columns section (before "Sticky-scroll
  grid shell...") documenting the all-headliners floating mechanism: why a
  hardcoded recognized-name set rather than a room-count heuristic (a legitimate
  multi-room session can have one real, specific caller), reuse of the existing
  `slotIndex: null` floating mechanism (`assignLanes.ts`), and a pointer to the
  new `recognizedSessionKeywords.ts` consolidation.
- Add a short decision entry noting the `recognizedSessionKeywords.ts`
  consolidation itself and why (discoverability; the repeated-precedent comment
  that motivated it).

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — confirms the pure-move refactor
  didn't break anything (existing tests for hour-summary, caller-layout, and the
  caller-grid component all still pass with updated import paths only).
- Grep the repo afterward for the old constant locations to confirm no leftover
  duplicate definitions or stale imports.
- No `pnpm build`/e2e run needed — this is an internal reorganization plus docs,
  with no behavior change (already covered end-to-end by this session's earlier
  e2e verification of the all-headliners floating behavior itself).
