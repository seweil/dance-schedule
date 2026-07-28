# Known issues / follow-ups

Bugs and flakes found in passing, not yet worth fixing inline. Not
architectural decisions (see `docs/design/` for those) — just a running list.

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
