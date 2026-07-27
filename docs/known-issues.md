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

**Fix direction (undecided):** either let cards grow taller than their
strict time-proportional row span when their content demands it (breaks
the "vertical position exactly encodes time" property elsewhere in the
grid, needs a real design decision, not a quick tweak), or tighten
font-size/line-height/padding further specifically for very short
sessions, or accept truncation with a `title` tooltip showing the full
text on hover/tap. Decide the intended UX before implementing.
