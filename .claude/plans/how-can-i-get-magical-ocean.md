# Tighten up the dance-schedule grid for small screens (mobile-only)

## Context

`src/components/DanceScheduleGrid.tsx`/`.module.css` renders the room-column ×
time-row grid inside a `.scrollContainer` div (`overflow: auto; max-height:
70vh`) — an inner scroll area, independent of the page. `.corner`/`.roomHeader`
(`top: 0`) and `.timeLabel`/`.halfHourTick` (`left: 0`) are `position: sticky`,
so today they pin relative to that inner 70vh box, not the real viewport. There's
a pre-existing logged issue (`docs/known-issues.md`) that `.roomHeader` isn't
also pinned during *horizontal* scroll of that inner box (no `left: 0`) — this
work doesn't fix that, see below.

The ask: on small screens, replace the inner scroll area with normal page
scrolling — the room headers should pin to the browser viewport's top edge as
the whole page scrolls (not just within a capped inner box), the nav and the
filter controls above the grid should scroll away normally (already true today
— neither has any `position: sticky`/`fixed` anywhere), and the grid should
span the full viewport width instead of sitting inset by the page's default
margin.

**Scoping correction worth flagging:** the user asked to scope this to mobile
only, matching `Nav.module.css`'s existing `max-width: 640px` breakpoint. But
the primary motivating case is explicitly **iPhone landscape** — and in
landscape, an iPhone's *width* (e.g. 844px for iPhone 13) is well past 640px;
a width-only breakpoint would silently miss the exact case this is meant to
fix. What actually makes the current 70vh cap feel cramped is short viewport
*height* (~390px in landscape), not narrow width. So the media query needs
both conditions — `(max-width: 640px)` for narrow portrait phones, OR
`(max-height: 500px)` for short landscape phones (500px comfortably separates
phones-in-landscape from tablets/laptops, which stay on today's desktop
behavior). Flagging this now since it changes the mechanics of what was
approved, but keeps the actual intent (iPhone, either orientation) intact.

## Change 1: `src/components/DanceScheduleGrid.module.css`

Add one new media query; no changes above it, no `.tsx`/component changes at
all needed — the existing `position: sticky` rules on `.corner`/`.roomHeader`/
`.timeLabel`/`.halfHourTick` automatically start resolving relative to the
real viewport instead of `.scrollContainer` the moment that container stops
being its own scrolling context (a sticky element's containing block for
stickiness is its nearest ancestor that actually clips/scrolls — remove that,
and the search continues up to the viewport, with zero other ancestor in this
app ever setting `overflow`/height in a way that would trap it, confirmed by
reading `index.html`/`main.tsx`/`src/index.css`/every component CSS file).

```css
@media (max-width: 640px), (max-height: 500px) {
  .scrollContainer {
    overflow: visible;
    max-height: none;
    /* Full-bleed regardless of the page's actual left/right inset (this repo
       has no body margin reset — see src/index.css — so this cancels out
       whatever the browser's default happens to be, without assuming a
       specific px value or touching that default for any other page). */
    margin-left: calc(50% - 50vw);
    margin-right: calc(50% - 50vw);
  }
}
```

Leave `.roomHeader` exactly as-is (`top` only, no `left`) — the user asked
specifically for vertical pin-to-top; horizontal pinning during a sideways
scroll is a separate, still-undecided question (see Change 3).

## Change 2: `e2e/dance-schedule.spec.ts` — rewrite the `mobile viewport` block

The existing single test in this block manipulates `.scrollContainer`'s own
`scrollLeft` and asserts the *page* never overflows horizontally — both
premises are now backwards below the breakpoint (the container no longer
scrolls itself; the page overflowing horizontally when there are more rooms
than fit is now the intended behavior). Replace it with tests covering what's
actually being verified now, using `devices['iPhone 13 landscape']` as the
primary case (the explicit motivating scenario — confirm this device key
exists in the installed Playwright version; fall back to manually swapping
`devices['iPhone 13']`'s width/height if not) alongside the existing portrait
`devices['iPhone 13']` case:

- Room header stays pinned at the top of the *viewport* as the page is
  scrolled down (scroll via `page.mouse.wheel`/`window.scrollBy`, then assert
  the first `.roomHeader`'s bounding box stays near `y: 0` while
  `document.documentElement.scrollTop` has actually increased and more
  session cards are visible).
- Nav and the filter controls scroll out of view once the page is scrolled
  down past them (bounding box no longer intersects the viewport, or
  `toBeVisible()` on the nav/filters returns false after scrolling).
- The grid sits flush with the viewport's left/right edges (no inset) — check
  `.scrollContainer`'s bounding box `x` is `0` (or within a hair of it).
- Keep a page-level-horizontal-overflow check, but inverted from today: when
  there are more room columns than fit, `document.documentElement.scrollWidth`
  now *exceeds* `clientWidth` (the page itself scrolls horizontally), instead
  of asserting it never does.

Exact assertions/thresholds need a real Playwright run (and a live
`claude-in-chrome` check against `pnpm build && pnpm preview` resized to
iPhone-landscape dimensions) to get pixel tolerances right — don't hand-write
these blind.

## Change 3: `docs/known-issues.md`

Update the existing "Mobile dance-schedule grid: room header doesn't stay
pinned during horizontal scroll" entry: the original bug was specifically
about `.scrollContainer`'s *own* horizontal scroll below the breakpoint, which
this change removes entirely (replaced by page-level scroll) — so the bug
report's original mechanism no longer exists. Reframe rather than delete: the
underlying open question survives in the new model (should `.roomHeader` also
get `left`-based pinning so it stays visible during a horizontal *page*
scroll?) — note this was deliberately left unresolved here since it wasn't
part of what was asked, so it doesn't read as an oversight.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` (unit suite shouldn't be affected
  — this is CSS/e2e-only).
- `pnpm build && pnpm test:e2e` — full suite including the rewritten mobile
  block; confirm desktop tests (everything outside `mobile viewport`) are
  completely unaffected, since the media query never applies above both
  thresholds.
- Live check via `claude-in-chrome` against `pnpm preview`: resize to iPhone
  13 landscape dimensions (844×390), confirm visually — page scrolls as one,
  room headers pin to the top on scroll, nav/filters scroll away, grid spans
  full width edge-to-edge. Repeat at portrait (390×844) to confirm the
  `max-width: 640px` arm still works. Also load at a plain desktop size (e.g.
  1280×800) and confirm nothing changed there (still the capped 70vh inner
  scroll box with its normal margins).
