# Oregon Mid-Winter Festival 2027 (PDF parser, cuers, round-dance phases)

## Context

The next event is the **2027 Oregon Mid-Winter Festival** ("Diamond
Cir-Q-L8 and Roll"), January 29–31, 2027, Linn County Fair & Expo Center,
Albany, OR — site: <https://midwinterfestival.org/2027/>. Featured staff:
Ted Lizotte (caller), Pam & Jeff Johnson (round dance cuers), Trevor DeWitt
(clogging).

Its only schedule source is the organizer's published one-page PDF,
<https://midwinterfestival.org/2027/assets/documents/MWF27-Master-Schedule.pdf>
— **no original spreadsheet is available**. It differs from every prior
event (`docs/design/dance-schedule.md`) in ways that need both a new parser
and new features:

- **One grid for all three days**, not a sheet per day: rows are `Day` +
  `Times`; dates appear only in the title (`"January 29, 30, 31 2027"`),
  plus a Thursday row (the 28th) for the pre-event Trails In dance.
- **Columns are programs, not rooms**: six column groups — MainStream –
  Extended Application, Plus, Relaxed Mainstream – Standard Application,
  Advanced, Round Dance, Clogging — each with its own room in a second
  header row (Willamette South (Hall A), Willamette North (Hall C),
  Conference Room 1, Holiday Inn, Conference Room 3/4, Comfort Suites), and
  `Event` / `Caller` / `Cuer` sub-columns. Level comes from the column, not
  the cell (cells mostly just say `Dance`).
- **A second staff role, the round dance cuer**, on square-dance sessions
  alongside the caller.
- **Round dancing** is its own program, with its own phase scale
  (`ph 3-4`, `Teach Ph 5`, `Intro to Rounds`), and is a primary audience
  alongside square dancers.
- **Clogging** has no levels and only a few multi-hour blocks.

## Sub-problems

- [x] Source format: PDF vs. re-entry — see Decisions
- [x] Who appears in the staff (caller-columns) view — see Decisions
      (featured-staff detection still open, below)
- [x] How a session shows its cuer — see Decisions
- [x] MS vs. MS Extended — see Decisions
- [x] Round-dance phase filtering — see Decisions
- [x] Clogging — see Decisions
- [x] PDF layout extraction: column bands, row bands, wrapped lines
      (e.g. `"Bruce Lowther/Ron Bell-"` + `"Roemer"`), merged multi-row and
      multi-column cells — see "The parser" in Decisions
- [x] Date derivation: title date list + weekday column, incl. the
      Thursday row outside the listed dates — see "The parser"
- [x] Time quirks: `"11:00-12:00 PM"`, end-of-day marker rows, overlapping
      rows, in-cell times — see "The parser"
- [x] Name separators: `/` vs. `&`, a cuer in a Caller cell — see "The
      parser"
- [x] Event-type vocabulary → session kinds — see "The parser"
- [x] Data model for cuers, round dancing, clogging, MSX — see Decisions
- [x] Cuer double-booking — see Decisions
- [x] Featured-staff detection — see Decisions
- [x] `Challenge` in the Advanced column — see Decisions
- [x] Clogging instructor attribution — see Decisions
- [x] Level-columns view and round-dance phases — see Decisions
- [x] Names: MS Extended code, content set — see Decisions
- [ ] Off-site rooms: Advanced is at the Holiday Inn and Clogging at Comfort
      Suites — different buildings, not halls at the fairgrounds. Show a
      venue/address anywhere?
- [ ] Staff view label ("By staff" / "Staff Schedule" vs. "Caller
      Schedule") — per-set or global
- [x] Dump: cuers and phases — see Decisions (hour summary still counts
      only square-dance levels and callers)
- [ ] Page UI: cuer line on cards, second (phase) slider and phase columns,
      featured-only staff view, Challenge grouped with Advanced, MSX label
      "MS Ext", round/clogging card colors — decided above, not built yet
- [ ] Confirm the data questions in "Open questions" with the organizer
- [ ] Content pages (Callers & Cuers, Information,
      Dining & Lodging, Youth, ...), making it `defaultContentSet`
- [x] Keeping `docs/adding-a-new-event.md` in sync — its "Dance-schedule
      input format" section lists `pdf-program-grid`

## Decisions

### Parse the published PDF directly (2026-11-18)
**Decision:** a new `DanceScheduleParser` (working name `pdf-program-grid`,
selected by `danceSchedule.format`) reads the PDF committed as the content
set's `data/` file, at build time like every other parser.
**Why:** The organizer can't provide the original spreadsheet, and
re-keying ~150 cells into the room-grid format by hand would have to be
redone on every schedule revision — they republish the PDF, not a diff.
**Feasibility, verified on the real file** with `pdfjs-dist` (a probe, not
committed): it's a real text PDF, not a scan — 689 positioned text items on
one 792×612 page, one item per line within a cell (cells don't run
together the way a plain-text dump suggests), plus 110 filled rectangles
(cell backgrounds) and per-item fill colors — enough to recover the red
"featured" text and the green special-event highlight if needed. The
parser maps items to cells by position: column bands from the two header
rows' x ranges, row bands from the `Day`/`Times` column's y positions.
**Fail loud**, like every other parser: an item that lands in no cell, or a
layout that no longer matches the expected header, fails the build with
the row/column named — a republished PDF with a changed layout must not
silently produce a wrong schedule.

### Staff view shows only featured callers and cuers (2026-11-18)
**Decision:** for this event, the caller-columns view's columns are the
featured staff only (Ted Lizotte; Pam & Jeff Johnson), cuers included —
not every one of the ~30 callers in the PDF.
**Why:** Direct product decision. It's the question attendees actually ask
("when is Ted calling?"), and 30+ columns would be unusable on a phone.
How "featured" is determined: see "Featured staff come from config" below.

### A session's cuer shares its card, like GCA (2026-11-18)
**Decision:** a square-dance session's cuer goes on the same card as its
caller(s), as a secondary line — the same treatment the optional `GCA:`
line gets (`docs/design/dance-schedule.md`'s "Callers are a list; GCA is a
separate, distinctly-triggered field"). Data model: a new optional
`cuers?: string[]` on `StructuredSessionData`, a separate field from
`callers` like `gca` is, so nothing that reads `callers` (incl. the
caller-columns derivation) changes meaning.
**Why:** Direct product decision; reuses an existing, already-understood
presentation instead of inventing one.

### MS and MS Extended are distinct levels (2026-11-18)
**Decision:** a new level code for "MainStream – Extended Application",
distinct from `MS`, sorted between `MS` and `Plus` in `LEVEL_ORDER`. "Relaxed
Mainstream – Standard Application" maps to the existing `MS`.
**Why:** Direct product decision — they're different programs dancers pick
between. Code `MSX`, label "MS Ext" (see "Names" below). The `Relaxed` →
`MS` mapping is an assumption to confirm.

### Round-dance phases get their own second slider (2026-11-18)
**Decision:** round-dance sessions carry a phase range (phases 1–6,
parsed from `Ph 3-5`, `Teach Ph 4`, ...), a separate field from square
`levels`, filtered by a **second** range slider alongside the existing
level slider. Each slider filters only its own kind of session; a round
session with no stated phase (`Showcase Practice`, `ORDTA Mtg`, `Review
Teaches`) is always visible, like `Intro`/`Various` today.
**Why:** Both square dancers and round dancers are primary audiences, and
phases are an independent scale, not more rungs on the SSD…C4 ladder —
folding them into `LEVEL_ORDER` would make one slider mean two unrelated
things. Open detail: whether the second slider is hidden for events
with no round sessions (it should be — no existing event has any).

### Clogging is its own always-visible column, like Registration (2026-11-18)
**Decision:** clogging sessions stay in their own room column (Comfort
Suites) and are not filtered by either slider — the same treatment as
freeform sessions such as Registration (`REGISTRATION_DESCRIPTIONS`,
`recognizedSessionKeywords.ts`), which keep their own time range on the
card since their span doesn't line up with the grid's slots (e.g.
`7:30-9:30 Programmed Dance`). In the data model they're structured
sessions with `danceForm: 'clogging'` and no levels, not freeform, so they
can carry their instructor (below); a session with no ordered level is
already always visible (`isSessionInLevelRange`), so no filtering change
was needed.
**Why:** Direct product decision. Clogging has no level scale to filter
on and only a few multi-hour blocks, so a third slider would be pure
ceremony.

### Featured staff come from config, not the PDF's red text (2026-11-18)
**Decision:** a per-set list of featured staff names in `config.yaml`
(key name TBD, e.g. `danceSchedule.featuredStaff`) drives the staff view's
columns. The parser may cross-check it against the red text and fail loud
on a mismatch, but never derives it from color alone.
**Why:** Color is presentation — a republished PDF could change or drop
it, and a missing featured caller would vanish from the staff view
silently. An explicit list is also how every other per-event product
choice is expressed (`docs/design/content-config.md`).

### `Challenge` is labeled C1 but grouped with Advanced (2026-11-18)
**Decision:** the one `Challenge` session (Saturday 4:00–5:00 PM, Randy
Dibble, Holiday Inn) gets level `C1`, so it's labeled honestly, but it's
grouped with the Advanced track for filtering and for the level-columns
view — no C1 column or slider stop of its own.
**Why:** Direct product decision: one session doesn't justify its own
column or slider stop, and dancers who'd attend it are already looking at
Advanced. Proposed mechanism (to confirm in implementation): reuse the
existing `LevelSlot` merge machinery (`levelOrder.ts`; `combineA1A2`/
`combineC3BC4` in `docs/design/dance-schedule.md`) — `A1`, `A2`, `C1` are
adjacent in `LEVEL_ORDER`, so a per-set merge into one "Advanced" slot fits
it without new filtering code. A per-session override was the rejected
alternative: more special-casing for the same outcome.

### Clogging instructor is attributed from config (2026-11-18)
**Decision:** Trevor DeWitt, named on the festival site but nowhere in the
PDF, is added to the clogging sessions from `config.yaml` rather than left
unattributed.
**Why:** Direct product decision — he's featured staff, and an
unattributed block reads as incomplete. Key shape TBD; it should be the
same featured-staff config as above where possible, not a second list.

### Level-columns view gets phase columns; a session shows if it matches either slider (2026-11-18)
**Decision:** the level-columns view gets round-dance phase columns
alongside the square-dance level columns, and both sliders appear there
too. A session is visible if it falls in **either** range.
**Why:** Direct product decision — round dancers are a primary audience, so
their view of the schedule shouldn't be second-class. Every session in
this PDF has either square levels or round phases, never both, so "either"
and "each slider filters its own kind" give the same result today. They'd
only diverge for a session that has both, which has never come up. Flagged
by the user for hands-on testing and further discussion once it's running,
especially how phase columns and two sliders fit on a phone.

### Names (2026-11-18)
**Decision:** MS Extended's level code is `MSX`, labeled "MS Ext". The
content set is `content/MidWinter2027/`.

### The parser: `pdf-program-grid` (2026-11-18)
**Decision:** `dance-schedule-parsers/pdfProgramGrid.ts` reads
`data/dance-schedule.pdf` with `pdfjs-dist` (pinned exactly to 4.10.38: the
line extraction depends on pdfjs 4's `constructPath` argument layout, which
5.x changed). It recovers two things: the **stroked gridlines**, by walking
the page's drawing operators (fills are cell backgrounds and are ignored),
and the **positioned text**. Both go to the pure
`src/lib/parseProgramGridPdf.ts`, which has no PDF dependency and is
unit-tested on synthetic grids. Layout rules, all verified on the real file:
- **Columns.** The vertical lines that reach the table's top edge separate
  column groups. The first group is #/Day/Times; each other group is one
  program. Its name is in the first header row, its room in the second, and
  its Event/Caller/Cuer sub-columns are named in the third. A group with a
  single unlabeled column (Clogging) treats that column as Event.
- **Rows** are the bands between horizontal lines in the Times column.
- **Merged cells.** In a program column, a cell runs to the next horizontal
  line that crosses that column. The export leaves out lines inside a merged
  block, so a 3-hour clogging block covers three rows. A program's cells
  that start on the same row make one session, spanning to the furthest
  row any of them reaches.
- **Strict.** Every text item in the data area must land in a cell, or the
  build fails. An unknown program header or sub-header also fails it.
- **Wrapped text.** A cell's lines are joined with a space, except after a
  trailing `-` ("Ron Bell-" + "Roemer" → "Ron Bell-Roemer").
- **Dates.** The title row's `"January 29, 30, 31 2027"` gives the dates.
  Each row's weekday maps to the listed date with that weekday, or else to a
  date in the week before the first one (Thursday the 28th, for Trails In).
- **Times.** `parseTimeRange`'s existing meridiem inference already reads
  `"11:00-12:00 PM"` as 11 AM to noon. A row with no range (`"10:30"`,
  `"2:00 PM"`) is an end-of-day marker that holds no sessions; content in
  one fails the build, except `Closed`. A time written in the cell
  (`9:00-12:00`, `1:30-4:30 PM`) overrides the row's. With no AM/PM on either
  side, it takes whichever reading starts nearest the row's time. Minutes
  are required, so `Ph 3-5` never matches.
- **Names.** `/` separates co-callers and `&` never splits (`Pam & Jeff
  Johnson` is one entry). Any name that appears in a Cuer column anywhere in
  the grid counts as a cuer, even when it's written in a Caller cell.
  `programStaff` from config fills in a session that names nobody.
- **Event types.** `Dance`, `Featured`, or the program's own name
  (`Advanced`) mean the default type. A fixed set of non-dance events
  (Committee Picture, Ceremonies, Education, ORDTA Mtg, State Meeting,
  Showcase of Rounds/Practice), and any cell with a blank Event, become
  freeform sessions. `Closed` produces no session. Any other text is kept as
  the event type (`Trails Out`, `MS WkShop`, `Summer Fest 27 Promo`). A
  round event matching `[Type] Ph N[-M]` sets its phases.
- **Source labels** read `Row 14 (Saturday 10:00-11:00 AM), Plus
  (Willamette North (Hall C))`, matching the row numbers printed in the
  PDF's first column.

**Why this approach:** gridlines are what define merges in the exported
PDF. Text position alone can't tell a 3-row block from a 1-row cell, since
the text sits wherever the exporter put it. Cell colors were deliberately
not used (see featured staff above). On the real file: 99 sessions, zero
errors, and the shared validator found no double-booking.

### Data model: cuers, dance forms, phases, MSX (2026-11-18)
**Decision:** `StructuredSessionData` gains optional `cuers`, `danceForm`
(`'round' | 'clogging'`, absent for square dancing) and `phases`. Round and
clogging sessions have `levels: []`, so existing filtering already treats
them as always visible, which is the interim behavior until the phase
slider exists. `MSX` sits between `MS` and `Plus` in `LEVEL_ORDER`, but it's
an **optional level**: `getLevelSlots` leaves it off the slider unless the
event uses it (`usesOptionalLevels`). Otherwise every other event would
gain a dead MSX stop mid-slider, which `getPresentLevelIndexRange` can't
trim because it only trims the ends. `BASE_LEVEL_ORDER` is the slider order
without it, which existing tests use.
**Why:** this keeps every existing event's data, slots and dump
byte-identical. A full `pnpm build` regenerated no other set's dump.

### Cuers are double-booking-checked along with callers (2026-11-18)
**Decision:** `validateDanceSessions` checks callers and cuers against one
shared per-person booking map. A cuer can't be in two rooms at once, and
nobody can call in one room while cueing in another. GCA is still exempt,
as before. One session naming the same person in both roles isn't a
conflict.
**Why:** a cuer is really present in the room, unlike a GCA credit.

## Open questions

- **Data questions for the organizer**, found while parsing:
  - "Michael Kious" (Plus, Fri 3:00 and Sun 11:00) and "Mike Kious" (MS, Sat
    7:30) — probably one person. Left as printed, but the staff view and the
    double-booking check treat them as two people.
  - Round Dance "Teach Ph 5" (Sat 10:00) is a merged cell spanning 10:00
    AM–12:00 PM, a 2-hour teach. Is that intended?
  - "Showcase of Rounds" (Sat 6:00–7:30 PM) is printed in the Plus columns,
    so it's placed in Willamette North (Hall C), while the green band runs
    across every program. Is it in Hall C?
  - Clogging spells both "Workshop" and "WorkShop"; kept as printed.

- Two sliders and either-range matching — revisit after hands-on testing
  (see the level-columns decision above).
- `pdfjs-dist` would be a new build-time dependency; confirm it stays out
  of the client bundle (it's only imported from `dance-schedule-parsers/`,
  Node-side).
