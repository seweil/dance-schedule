# Known issues / follow-ups

Bugs and flakes found in passing, not yet worth fixing inline. Not
architectural decisions (see `docs/design/` for those) — just a running list.

## `combineA1A2` silently defaults to `false`, opposite of the documented recommendation

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`vite-plugin-content-config.ts`'s `DEFAULT_CONTENT_CONFIG` (used when
`config.yaml` is absent) and its missing-key fallback (`?? false`) both
default `features.combineA1A2` to `false`. But `docs/adding-a-new-event.md`
explicitly documents skipping `config.yaml` entirely as producing "sensible
defaults," and its own example recommends `combineA1A2: true` ("set to true
unless yours genuinely needs A1 and A2 kept separate").

**Impact:** any new event that follows the guide and omits `config.yaml` (an
explicitly encouraged shortcut) silently gets the *opposite* of the
documented default — a split A1/A2 slider stop instead of combined — with no
warning anywhere.

**Fix direction:** flip both defaults in `vite-plugin-content-config.ts` to
`true`, matching the docs.

## No month/day bounds validation before `Date.UTC()` in `parseEventDate`

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

None of `parseEventDate.ts`'s four date-construction branches (ISO,
`SLASH_DATE`, `LONG_DATE`, and their no-year variants) validate that month is
1–12 or day is valid for that month before calling `Date.UTC()`, which
silently normalizes out-of-range components into a different, wrong-but-
valid date instead of throwing.

**Failure scenario:** a volunteer enters `15/8/2026` meaning Aug 15, 2026
(day/month order). `SLASH_DATE`'s regex matches (month=15, day=8), and
`Date.UTC(2026, 14, 8)` silently rolls into March 8, 2027 — no error, no
build failure, just a wrong event date shipped, contradicting the pipeline's
stated goal that bad input "fails the build with the offending row
identified."

**Fix direction:** validate month ∈ [1,12] and day ∈ [1, days-in-that-month]
(accounting for leap years) in each branch before constructing the `Date`,
throwing the same kind of named error as the existing "unrecognized format"
paths.

## Dance-schedule row parsing silently drops cells beyond the header's width

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`parseDanceScheduleSheet.ts`'s per-row cell scan iterates only over `rooms`
(derived from the header row's own width) — a data row with *more* filled
cells than the header row silently never reads, parses, or reports the
extra ones.

**Failure scenario:** header row is `['Time', 'Ballroom Centre']` (1 room)
but a data row has content typed one column too far right, e.g.
`['12:30p-1:30p', 'SSD : Dancing - Vic Ceder', 'Plus : Dancing - Kris
Jensen']`. The whole session in the extra column silently vanishes with no
error, even though the project's design goal is that anything unparseable
fails the build with the offending cell identified.

**Fix direction:** after building `rooms`, also check each data row's own
length against the header width and raise a named error (sheet/row/column)
for any populated cell beyond it.

## Level taxonomy is hardcoded to modern western square dance only

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`src/types/danceSchedule.ts`'s `LEVEL_CODES` (and `levelOrder.ts`'s
`LEVEL_ORDER`/`getLevelSlots`) hardcode the square-dance skill taxonomy
(SSD/MS/Plus/A1/A2/C1–C4) with no config-driven way for a new event to
define a different one. Compounding this, `getLevelSlots`'s `combineA1A2`
branch hand-duplicates `LEVEL_ORDER`'s items as a second literal array
instead of deriving them from it.

**Failure scenario:** both existing real events' own home-page copy
advertises "square and round dancing," but a round-dance session entered
with a real round-dance level (e.g. `Bronze` or `Phase 4`) fails
`isValidLevel` and breaks the entire build with "Unrecognized level code" —
that content can't be represented at all without a code change. Separately,
inserting a new level into `LEVEL_ORDER` (e.g. a `C3C`) is easy to forget to
also add to `getLevelSlots`'s combined-mode list, silently dropping it from
every `combineA1A2: true` event's slider/filter range with no build error.

**Fix direction:** derive the combined-mode slot list from `LEVEL_ORDER`
programmatically (e.g. a config-driven merge-pairs list) instead of a
hand-duplicated array. Making the taxonomy itself content-set-configurable
(for a genuinely different dance form) is a bigger design question — worth
a `docs/design/` entry of its own if a real round-dance or contra event is
ever added, rather than a quick fix here.

## Blank/undefined dance-schedule header cell becomes the literal room "undefined"

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`parseDanceScheduleSheet.ts` builds room names via
`headerRow.slice(1).map((cell) => String(cell))` — an empty/undefined
header cell becomes the literal string `"undefined"` (or `"null"`) instead
of being rejected.

**Failure scenario:** an accidentally-empty header cell between two real
room columns (e.g. from a deleted column in Excel) produces
`rooms = ['Ballroom Centre', 'undefined', 'Ballroom East']` — a phantom
column literally labeled "undefined" renders in the UI, and content typed
under it parses successfully against that nonsense room name instead of
failing the build.

**Fix direction:** reject (throw a named, cell-identifying error for) any
header cell that's `null`/`undefined`/empty string before building `rooms`.

## Dance-schedule time range with no AM/PM on either side isn't cross-checked

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`parseTimeRange.ts`'s meridiem-inference only fires when exactly one side
of a range has AM/PM and the other doesn't. When *neither* side specifies
it, both parse as literal 24-hour values with no plausibility check.

**Failure scenario:** a volunteer enters `1-3` meaning 1:00 PM–3:00 PM
(afternoon session, meridiem omitted as "obviously" afternoon). Both sides
parse as literal 24-hour (1:00 AM, 3:00 AM); since 1am < 3am the
start-before-end check doesn't throw — the session is silently scheduled
at 1–3 AM instead of 1–3 PM, with no build error.

**Fix direction:** undecided — could require at least one side to specify
AM/PM when both raw hours are ≤12 (failing loudly instead), or restrict the
literal-24-hour fallback to hours that couldn't plausibly be 12-hour (13–23).
Needs a decision on which real-world inputs should still be allowed bare.

## `RESERVED_NAMES` omits `debug` and `clear-storage`

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`scripts/build-content-sets.mjs`'s `RESERVED_NAMES` (and the matching list
in `docs/adding-a-new-event.md`) protects against a content set colliding
with `assets`/`icons`/`index.html`/`manifest.webmanifest`/`sw.js`/
`workbox-*`, but omits `debug` and `clear-storage` — both real routes
hardcoded into every build via `src/App.tsx`'s `debugRoutes`/`utilityRoutes`.

**Failure scenario:** a future event named `content/debug/` (a plausible
name for a staging/preview set) produces its own `dist/debug/index.html`,
which is a real static file that permanently shadows the root-mirrored
build's client-side `/debug` → `/debug/dance-schedule` redirect at that
exact URL — the root build's own debug page becomes unreachable with no
build-time error, the same class of silent corruption the existing
reserved-name check exists to catch.

**Fix direction:** add `debug` and `clear-storage` to `RESERVED_NAMES` and
to the doc's matching list.

## Dance-schedule header room names aren't trimmed before `ROOMS:` validation

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

Room names built from the header row (`parseDanceScheduleSheet.ts`) are
never trimmed, so an invisible trailing space in a header cell breaks an
otherwise-correct `ROOMS:` reference to that same room.

**Failure scenario:** a header cell is typed as `Ballroom Centre ` (trailing
space, invisible in Excel). `allRooms` retains the trailing space verbatim,
but a `ROOMS: Ballroom Centre, Ballroom East` line trims each entry to
`Ballroom Centre` before checking `allRooms.includes(...)` — the check
fails and throws `names unrecognized room "Ballroom Centre"` even though
the room visibly matches in the spreadsheet.

**Fix direction:** `.trim()` each header cell when building `rooms`, same as
the `ROOMS:` line's own entries already are.

## Dance-schedule sheet-name weekday regex rejects a comma after the weekday

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`WEEKDAY_PREFIX` (`/^\w+day\s+/i`) requires whitespace immediately after the
weekday name, so a naturally-punctuated sheet name like `Thursday, July 2`
fails to have its weekday stripped, and the whole string then fails every
format `parseEventDate` accepts.

**Failure scenario:** a content author names a sheet `Thursday, July 2`
(comma after the weekday — a very natural way to write it, e.g. copy-pasted
from a calendar app). The regex doesn't match since a comma isn't
whitespace, so the unmodified string reaches `parseEventDate`, which has no
format expecting a leading weekday token at all and throws "Unrecognized
date format," failing that entire sheet.

**Fix direction:** allow an optional comma in `WEEKDAY_PREFIX`, e.g.
`/^\w+day,?\s+/i`.

## Duplicate dance-schedule header room names break `ROOMS:` conflict detection

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`rooms.indexOf(room)` (used when validating a `ROOMS:` line's other claimed
rooms) always resolves to the *first* matching header column, so two header
columns sharing the same room name silently break the "claimed room's cell
must be blank" check for the second occurrence.

**Failure scenario:** a header row accidentally has two columns both named
`Overflow` (e.g. a copy-paste mistake when adding a room). A `ROOMS:` line
elsewhere claims `Overflow`; `rooms.indexOf('Overflow')` always returns the
first column's index, so if that one is blank but the second `Overflow`
column has real, independent content in that time slot, the conflict is
never detected — that second room's actual session is silently dropped from
the row with no error.

**Fix direction:** reject duplicate room names in the header row outright
(a named build-time error), same category as the existing reserved-name/
collision checks elsewhere in the pipeline.

## Flaky: "nav links to the schedule page, which renders events"

**Found:** 2026-07-26, same verification pass.

`e2e/app.spec.ts`'s basic schedule-nav test failed once when run for real
(`pnpm test:e2e` in a real terminal), but the identical flow (click Schedule
link → heading visible → list item visible) reproduced correctly every time
when walked through manually via browser automation against
`pnpm build && pnpm preview`.

**Suspected cause:** a timing/first-load race (e.g. service-worker
registration or the PWA update-prompt) rather than a real functional
regression.

**Next step:** re-run `pnpm test:e2e` a few times to confirm it's actually
flaky rather than a one-off fluke; if it recurs, look at SW registration
timing on that route.

## PWA manifest: icons never added, description still a placeholder

**Found:** 2026-07-26, while verifying the Amplify Hosting deploy
(unrelated to hosting — pre-existing; DevTools → Application → Manifest
surfaced it against the live Amplify URL).

Chrome's manifest audit reports:
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`
  all fail to load (404)
- "No supplied icon is at least 144px square" / "Most operating systems
  require square icons" — a consequence of the above, not a separate defect
- `description` field renders as the literal string
  `"TODO: one-line description of what this app does."`

**Root cause:** `public/manifest.webmanifest` references all three icon
paths correctly, but `public/icons/` only contains a `.gitkeep` — the actual
PNG files were never added (confirmed both in the source tree and in a local
`dist/` build). The `description` field is the unfilled placeholder text,
same wording as the still-TODO project-overview line in `CLAUDE.md`.

**Not just cosmetic:** per `CLAUDE.md`, PWA audit regressions are meant to
be build-breaking, not optional cleanup — a missing valid icon set is a real
installability gap (affects the actual "Add to Home Screen" / install
experience), not merely a "richer UI" nice-to-have.

**Fix direction:** design/export real 192×192, 512×512, and a maskable
512×512 icon (with safe-area padding per Chrome's maskable-icon guidance),
add them under `public/icons/`, and replace the `description` placeholder
with a real one-line summary once the project overview in `CLAUDE.md` is
also written (same TODO, two places).

**Lower priority (same audit pass, cosmetic only):** no manifest
`screenshots` entries with `form_factor: "wide"` (desktop) or without/other
than `wide` (mobile) — only affects the "richer install UI" presentation,
not installability itself. Worth doing once real screenshots exist, not
urgent.

## Future work: native "Install" button on Chrome/Android via `beforeinstallprompt`

**Raised:** 2026-07-26, while writing the Installation page's manual
instructions ("tap the ⋮ menu → Add to Home screen").

Chrome/Android (and other Chromium browsers) fire a `beforeinstallprompt`
event when the page is installable, which can be captured and deferred to
show a custom "Install" button that triggers the browser's native install
prompt directly — nicer than asking the user to find the menu item
themselves. iOS Safari has no equivalent API (no installability detection,
no programmatic prompt), so manual instructions stay required there
regardless.

**Why deferred:** manual instructions are correct and sufficient for now;
this is a UX polish item, not a gap. No standard package is worth adding for
it (surveyed in conversation — the install-prompt ecosystem is thin and
fragmented; the one community option, `pwa-install`, is an unofficial web
component and would mean handing install UI/copy to a third-party dependency
instead of this repo's hand-editable content).

**Direction when picked up:** a small custom hook (listen for
`beforeinstallprompt`, call `.preventDefault()`, store the event, expose a
`promptInstall()` that calls `event.prompt()`) — Android/Chrome only, ~15
lines, no dependency needed. Would need to live in a component (not the
plain-markdown Installation page), likely surfaced as a button in `Nav` or
on the Installation page itself once that page can host interactive
elements again.

## Dance-schedule cards: long wrapping text clips on very short (~30min) sessions

**Found:** 2026-07-26, live-measuring card content height while adding the
GCA-hidden row-compaction feature (`DanceScheduleGrid.tsx`'s
`UNIT_HEIGHT_PX_WITH_GCA`/`UNIT_HEIGHT_PX_WITHOUT_GCA`) — pre-existing,
unrelated to that change itself.

A session short enough to occupy only 2 row units (~30 minutes at the
grid's 15-min/unit granularity) can have a details line (event type +
caller name(s), or a roomless description) long enough to wrap to a second
line — measured live on the real Saturday data, e.g. "GCA Caller Showcase
Dance - Michael Maltenfort" and "Medallion Tip - Vic Ceder" both wrap and
get visibly cut off (`.card`'s `overflow: hidden` clips rather than
growing the card, since row height is fixed by time span, not content).
Confirmed via `contentScrollHeight` measurements exceeding the actual
rendered card height by 13-28px on real cards, and directly visually (a
caller's name cut off mid-word in a screenshot).

**Not related to the "Show GCA callers" toggle specifically** — these
particular overflowing cards don't have GCA data at all, so hiding GCA
doesn't reduce their content; they were already clipping before that
toggle existed. The new GCA-hidden compaction (a smaller shared per-unit
height, since `showGca` is a global toggle) does make this pre-existing
overflow marginally worse in absolute pixels for these specific cards
(measured: 20% worse at an initially-tried 16px/unit, ~10% worse at the
18px/unit value actually shipped) — factored into picking 18 over a more
aggressive 16, but not eliminated.

**Partial mitigation shipped 2026-07-27:** `src/lib/estimateCardFit.ts`'s
`shouldCombinePrimaryAndDetails` (word-wrap simulated via
`src/lib/estimateWrappedLineCount.ts`, real widths measured by
`src/lib/measureTextWidth.ts`'s Canvas 2D `measureText`) estimates whether
a card's level + details (+ GCA) lines will exceed its actual available
height and, if so, combines the level and details text onto one line
instead of two. Live-verified against the real Saturday data: of 57
cards, 16 still overflow and all 16 were correctly flagged and combined
(no false negatives) — combining fully resolved overflow for 1 of them
(e.g. "Medallion Tip - Vic Ceder"), while the remaining 15 (mostly "GCA
Caller Showcase Dance - <name>" cards, whose combined text still needs 3
wrapped lines in a 2-row-unit card) still clip, just by less than before.

**Fix direction for the remaining cases (undecided):** either let cards
grow taller than their strict time-proportional row span when their
content demands it (breaks the "vertical position exactly encodes time"
property elsewhere in the grid, needs a real design decision, not a quick
tweak), or accept truncation with a `title` tooltip showing the full text
on hover/tap. Decide the intended UX before implementing.

**Compounded by overlap lanes in the level-columns view (2026-07-28):**
`DanceScheduleLevelGrid.tsx`'s side-by-side lane rendering (see
`docs/design/dance-schedule.md`'s Overlap lanes decision) halves a card's
width whenever it shares a level at an overlapping time — the same
overflow mechanism as above, just triggered by less horizontal room
instead of less vertical room. Confirmed live: "Ballroom West Skirt Work
Hour - Wendy VanderMeulen" in a 2-lane SSD column still clips even after
the primary+details combine heuristic correctly triggers (its
`textWidthPx` estimate now correctly accounts for the halved width — see
below), because the combined text itself still needs more lines than a
75px-wide, 1-hour-tall card has room for. Same undecided fix direction as
above; no additional lane-specific mitigation attempted.

**Bug fixed same day:** the lane-split cards were initially rendering
wider than their actual lane (bleeding into the neighboring lane/column)
because `.card` had no `box-sizing: border-box` — an explicit percentage
`width` set content-width only, with padding added on top. Fixed by
adding `box-sizing: border-box` to `.card`/`.roomlessCard`
(`DanceScheduleGrid.module.css`) and correcting the lane-card
`textWidthPx` estimate to divide the column's track width by `laneCount`
before subtracting padding, rather than subtracting the (margin+padding)
overhead before dividing — the two aren't equivalent, and the old formula
overestimated available width, undertriggering the combine heuristic.

**Second bug fixed same day — the room-columns grid's primary label can
itself overflow horizontally:** reported live as "Jarry/Joyce" clipping
in the level-columns view's SSD column. Two compounding gaps, both fixed:
(1) `estimateCardFit.ts`'s `shouldCombinePrimaryAndDetails` hardcoded
`primaryLines` to 1 regardless of the primary text's own length — a safe
assumption for the room-columns grid's primary text (level codes, always
short) but not for the level-columns grid's (room names, sometimes long
enough to wrap on their own, e.g. "Drummond Ballroom") — now estimated via
`estimateWrappedLineCount` the same way `detailsLines` already was. (2)
Even so, "Jarry/Joyce" specifically has no space for the word-wrap
estimate (or the browser's default line-breaking) to break at, so it was
overflowing the card box horizontally and getting silently clipped by
`.card`'s `overflow: hidden` rather than wrapping — `overflow-wrap:
anywhere` added to `.levels`/`.details` so the browser can break
anywhere, including mid-word, when nothing else fits. Note the JS
estimate still can't predict *where* a mid-word break like this lands (it
only reasons about whitespace-delimited words), so a case like this can
still end up needing more vertical space than estimated — falls into the
same already-documented, accepted vertical-overflow category above, just
no longer silently clipped horizontally with no wrap at all.
