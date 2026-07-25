# Dance schedule display page

## Context

`data/dance-schedule.xlsx` is parsed at build time into `virtual:dance-schedule`
(`DanceSessionData[]`, see `docs/design/dance-schedule.md`), and today the only thing
rendering it is `RawDanceScheduleTable`/`RawDanceScheduleDebugPage` — an intentionally
disposable, desktop-only debug table at `/debug/dance-schedule`, not linked from nav.
The data model now also supports a session spanning multiple rooms and a session with
no room at all (`location: SessionLocation`, added in the previous phase), with one real
example of each already in the spreadsheet.

This phase builds the **real, user-facing** display: a new page, reachable from the
nav, rendering the dance schedule as a room-column × time-row calendar grid (matching
the shape of the original paper convention schedule), with:
- a date combo-box (a small, fixed number of dates — currently 3),
- a dual-thumb slider filtering sessions by a min/max **skill level** range,
- a checkbox to show/hide the GCA-caller line,
- room columns that disappear when every session in that room is filtered out,
- a multi-room session rendered as one block spanning its rooms' columns,
- a roomless session (e.g. lunch) rendered as a block spanning **every** visible room
  column at its correct time position,
- and a layout that works on both desktop and mobile.

The debug table/page stay as-is — still useful for troubleshooting raw parse output,
separate from this real page.

## Decisions

### Level order for the slider: a real skill hierarchy, not `LEVEL_CODES`'s declared order
`LEVEL_CODES`'s array order (`SSD, MS, Plus, Advanced, C1, C2, C3A, C3B, C4, A1, A2, Intro,
Various`) doesn't reflect the real square-dance skill progression. The slider uses a
separate ordered scale: `SSD < MS < Plus < A1 < A2 < C1 < C2 < C3A < C3B < C4`.
`Advanced`, `Intro`, and `Various` aren't points on this scale — a session whose only
level(s) are among these (or a freeform session with no level at all) is **always
shown**, regardless of the slider. A multi-level session (e.g. `"C1, C2"`) stays visible
if **any** of its levels is in range, not all of them.

### GCA checkbox: display-only, not a filter
Unchecking "show GCA" hides just the GCA name from a session's card; it never hides a
whole session. Visibility is controlled only by date + level range.

### Grid layout: a time-proportional calendar grid, not a simple stacked list
Rooms are columns; the vertical axis is real clock time (15-minute units — the GCD of
the 30/45/60-minute slot lengths seen in the real data), so simultaneous sessions across
rooms line up and a session's height is proportional to its duration.

**Desktop vs. mobile is the same grid, not two layouts.** Room columns get a
touch-friendly minimum width (~150px); the grid container scrolls horizontally when
wider than the viewport — true on both a narrow phone and a desktop window with many
rooms. The time-axis column stays `position: sticky; left: 0`, the room header row
stays `position: sticky; top: 0`, and the corner cell is sticky on both axes (a real
"frozen row + frozen column" CSS pattern — the main implementation risk in this plan,
but it avoids maintaining two separate grid implementations).

### Room order and column visibility: derived per date, not hand-maintained
Room order isn't stored explicitly anywhere — only implied by each sheet's header row,
which `buildDanceSchedule`'s chronological sorting doesn't preserve as a standalone list.
Derived instead from **first chronological occurrence across that date's full,
unfiltered session list**: walk sessions in order, and for each `located` session
append any of its rooms not already seen (in the order its `rooms` array lists them,
which — because of how the parser builds it — already reflects left-to-right column
order for both the default single-room case and a ditto-chained multi-room case).
Column visibility (which rooms currently have a column) is computed separately, from
the **currently level-filtered** session list, so a room only disappears once nothing
in it is visible — but the *order* is always computed from the full unfiltered list, so
columns never reshuffle as filters change, only appear/disappear. The grid's time
bounds (earliest start → latest end) are likewise computed from the full unfiltered
list, so the grid's vertical proportions don't jump as the level filter changes.

### Multi-room and roomless sessions: placements, not a 1:1 session→cell mapping
A session can now require more than one visual position:
- **Roomless** (`location.kind === 'roomless'`): one block spanning every *currently
  visible* room column, at its correct time position — same mechanism as a multi-room
  span, just claiming every column instead of a named subset.
- **Multi-room, contiguous** (its rooms are consecutive in the current visible column
  order — true for the one real example, "All Callers Dance" spanning `Ballroom Centre`
  + `Ballroom East`): one block spanning that column range.
- **Multi-room, non-contiguous** (a `ROOMS:` list naming rooms that aren't next to each
  other — parsing deliberately doesn't forbid this, see `docs/design/dance-schedule.md`):
  falls back to one block **per named room**, each showing the same session content.
  Not pretty, but correct and safe — a spanning visual claim across a gap would
  misleadingly cover rooms the session doesn't occupy.

So the layout computation produces a list of **placements** (session + row range +
column range), not one entry per session — most sessions produce exactly one.

### Dual-thumb slider: `@radix-ui/react-slider`, not hand-rolled
A dual-thumb range is a genuinely hard widget to get right from scratch — the common
"two overlapping native `<input type=range>`" trick has real known issues (z-index dead
zones when both thumbs are near the same value, no proper ARIA slider semantics, fiddly
touch-drag behavior). `@radix-ui/react-slider` is headless/unstyled (fits the CSS
Modules approach) and handles multi-thumb a11y/touch correctly out of the box — the
project already accepts one focused UI dependency (`yet-another-react-lightbox`), so
this adds one more.

### Date picker: a native `<select>`
Only a handful of dates exist (3 today) — a native `<select>` is fully accessible for
free and needs no extra widget.

### Shared formatting extracted to a third location
`formatDanceScheduleMarkdown.ts` and `RawDanceScheduleTable.tsx` each have their own
near-duplicate detail/level/GCA/room formatting. This page is a third consumer, crossing
the project's "don't abstract until a third call site appears" threshold — a shared
`src/lib/formatDanceSession.ts` is extracted and the two existing call sites refactored
to use it (behavior-preserving).

## Files touched

**New:**
- `src/pages/12 dance-schedule.tsx` — thin default-export wrapper (`export {
  DanceSchedulePage as default } from '../components/DanceSchedulePage'`), same pattern
  as `src/pages/10 schedule.tsx`. Picked up automatically by `vite-plugin-pages` and
  `buildNavTree`, appearing in nav as "Dance Schedule" at `/dance-schedule`.
- `src/lib/levelOrder.ts` (+ test) — the `LEVEL_ORDER` scale, plus a helper implementing
  "any listed level in range, unordered levels always pass."
- `src/lib/filterDanceSessions.ts` (+ test) — pure function: all sessions + a selected
  date + a level index range → the sessions to show for that date.
- `src/lib/computeDanceScheduleLayout.ts` (+ test) — the core of this feature: derives
  room order + visible columns (per the Decisions above), day time bounds, and produces
  the placement list (`{ session, rowStart, rowSpan, columnStart, columnSpan }[]`),
  including the contiguous/non-contiguous multi-room fallback and the roomless
  full-width case. The file to test most thoroughly — table-driven fixtures covering
  30/45/60-minute slots, a contiguous multi-room session, a deliberately non-contiguous
  one, a roomless session, and column disappearance under filtering.
- `src/lib/formatDanceSession.ts` (+ test) — shared formatting helpers extracted from
  the two existing call sites (see Decisions).
- `src/hooks/useDanceScheduleFilters.ts` (+ test) — owns `selectedDate`, the level
  range, and `showGca` state; derives `dates`, the date-scoped session lists, and the
  layout via the lib functions above — keeps `DanceSchedulePage` presentational, per
  `CLAUDE.md`'s "push data-fetching/side effects into hooks" convention.
- `src/components/DanceSchedulePage.tsx` (+ test) — top-level page, wires the hook's
  output into `DanceScheduleFilters` and `DanceScheduleGrid`.
- `src/components/DanceScheduleFilters.tsx` + `.module.css` (+ test) — date `<select>`,
  the Radix dual-thumb level slider (with level-name labels), and the GCA checkbox.
- `src/components/DanceScheduleGrid.tsx` + `.module.css` (+ test) — the sticky-header/
  sticky-time-column scrollable grid; placements positioned via CSS custom properties
  set inline (`--row-start`/`--row-span`/`--col-start`/`--col-span`) consumed by static
  grid-placement rules in the CSS module (exact placement is per-instance/data-driven,
  can't be a static CSS Modules rule). Roomless placements get distinct styling (e.g. a
  muted, centered banner) so they read differently from a normal room card. A
  session-card sub-component may be split out during implementation if this file gets
  unwieldy — not committing to that split up front.
- `e2e/dance-schedule.spec.ts` — Playwright coverage (see Verification).

**Modified:**
- `src/lib/formatDanceScheduleMarkdown.ts` and `src/components/RawDanceScheduleTable.tsx`
  — refactored to use the new shared `formatDanceSession.ts` instead of their own copies.
- `package.json` / `pnpm-lock.yaml` — add `@radix-ui/react-slider`.
- `src/index.css` — add a `--color-border` token (currently `#ddd` is hardcoded in two
  places; this page becomes a third, natural point to promote it to a shared token).

**Not touched:** `RawDanceScheduleTable`/`RawDanceScheduleDebugPage`/`App.tsx`'s debug
routes, and the parsing/data-model layer (`parseDanceScheduleSheet.ts`,
`buildDanceSchedule.ts`, the `SessionLocation` type) — all already done in the previous
phase.

## Open questions (deferred, not blocking this phase)

- No color-coding or visual styling per skill level — plain text/badge for now.
- No "auto-select today's date" behavior — the combo-box defaults to the earliest date.
- A levels-as-columns alternate view is a known future direction but a genuinely
  different render path per earlier discussion — not designed here. The time-axis math
  in `computeDanceScheduleLayout.ts` is room-agnostic, so it's likely reusable; only the
  column-axis grouping would need a level-based equivalent.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — all new lib functions/components get
  colocated tests; `computeDanceScheduleLayout.test.ts` is the one to scrutinize most
  closely.
- `pnpm build` — confirms the new page's route/bundle builds and the real dataset
  (including the multi-room and roomless examples) flows through cleanly.
- `pnpm build && pnpm preview`, then check in a real browser (Chrome MCP tools, as used
  earlier this session): default date renders all its rooms; changing the date swaps
  the grid; dragging the level slider hides out-of-range sessions and their now-empty
  room columns disappear; unchecking the GCA checkbox hides GCA text without hiding
  sessions; the "All Callers Dance" session renders as one block spanning `Ballroom
  Centre`/`Ballroom East`; the lunch-break entries render as full-width banners at their
  correct time position; narrow the viewport to confirm the grid scrolls horizontally
  with the time column and room header staying pinned.
- `pnpm test:e2e` (new `e2e/dance-schedule.spec.ts`) — automates the manual checks
  above. Playwright's browser couldn't launch in this sandbox in earlier sessions (a
  sandbox permission issue, not a project bug) — if still the case, this step needs to
  run in the user's own terminal.
