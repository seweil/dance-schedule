# Text-size preference (Normal / Large / Extra Large)

## Context

Many of this app's users are older and may have trouble reading fine
print or small text. A live visual audit (the real running app, desktop
and mobile viewports) plus a codebase survey found several small-text
spots (GCA lines on schedule cards, the level-slider's tick labels — both
`0.75rem`-`0.8rem`, ~12-13px) that are legible but small, and confirmed
the app installs as a standalone PWA (`display: 'standalone'`,
`vite.config.ts`'s manifest), where standalone home-screen web apps
typically lose the browser's native pinch-zoom/text-size controls (a known
iOS Safari limitation) — so an in-app control is a real, needed
capability, not a duplicate of something already available. This is the
app's first settings/preferences UI of any kind.

## Sub-problems

- [x] Mechanism for scaling text app-wide — see "Root font-size scaling"
- [x] Discrete steps vs. a continuous zoom control — see "Three discrete steps"
- [x] Where the control lives in the UI — see "Nav/menu item, not a floating button"
- [x] How the preference stays in sync between `Nav.tsx` and `PageMenu.tsx` — see
      "A Context, this app's first"
- [x] localStorage key scoping (per-content-set vs. shared) — see "Unscoped storage key"
- [x] Whether to also fix `BuildInfo`/`EventsListPage`'s low-contrast fine print
      while auditing readability — see "The low-contrast fine print is
      intentional, not a bug"
- [x] Whether the dance-schedule grid's column widths should also scale with text
      size — see "Column widths now scale too (`rem`, not `px`)"
- [x] The level-slider's edge tick labels clipping at the viewport edge at larger
      text sizes — see "Level-slider edge padding scales with text size too"
- [x] No indication when the nav tab bar has more (now-wider) tabs scrolled out of
      view — see "Explicit scroll arrows for the nav tab bar, not a CSS scroll shadow"
- [x] The nav scroll arrows themselves being too subtle to read as a real button —
      see "Nav scroll arrows redesigned as solid circular buttons, not a bare glyph"
- [x] The level-slider's tick labels overlapping each other (not just clipping at
      the edge) once compressed below their own text's width at larger sizes — see
      "Level slider stays compressed-to-fit, not made to scroll — abandoned the
      scrolling approach"
- [x] Date select + GCA checkbox wrapping onto separate lines at Extra Large on a
      narrow phone — see "Date + GCA checkbox trimmed to still share one line at
      Extra Large"
- [x] Selecting a size in `PageMenu.tsx`'s mobile dropdown left the dropdown open,
      unlike every other menu item — see "TextSizeControl closes PageMenu on
      selection"
- [ ] Whether this needs Playwright e2e coverage — deferred, see Open questions.

## Decisions

### Root font-size scaling via a `data-text-size` attribute, not per-component edits
**Why:** Every font-size in the app (confirmed by exhaustive grep across
`src/components`) is already `rem`/`em` — zero hardcoded `px` font-sizes
anywhere — and the two spacing tokens (`--space-sm`/`--space-md`,
`src/index.css`) are `rem` too. This means scaling the root (`<html>`)
element's `font-size` proportionally enlarges *every* text element (and
most spacing) app-wide in one place, including every small-text spot the
audit found, without hand-editing each component's CSS individually.
`src/index.css` gets `:root[data-text-size="large"] { font-size: 125%; }`
and `:root[data-text-size="x-large"] { font-size: 150%; }` — no attribute
at all (`textSize === 'normal'`) means today's unchanged 100%, applied by
`useTextSizePreference.ts` deleting the attribute rather than setting it
to `"normal"`.

### Three discrete steps — Normal / Large / Extra Large, not a continuous stepper
**Why:** Simple, predictable, and easy to visually verify nothing breaks
at each step — matches how iOS/Android system text-size settings already
work, a familiar pattern for the target audience. A continuous +/− stepper
is more flexible but harder to guarantee every screen still looks right at
an arbitrary scale. Direct product decision.

### Nav/menu item, not a floating button
**Why:** A persistent floating button (mirroring `ScrollToTopButton`'s
existing pattern) was considered — always visible, one tap away regardless
of page — but rejected in favor of a nav-menu item to avoid adding
permanent floating UI. Direct product decision.

### A Context, this app's first — to share state between `Nav.tsx` and `PageMenu.tsx`
**Why:** `Nav.tsx` (the desktop tab bar) is rendered once, globally, in
`App.tsx`. `PageMenu.tsx` (the mobile `⋮` dropdown) is rendered fresh
inside every single page's own `PageHeader` (see `PageHeader.tsx`) — not
reachable from `App.tsx` by prop-drilling without threading the value
through every page component that renders `PageHeader`, which is
essentially every page in the app. `src/hooks/useTextSize.ts` holds the
`TextSizeContext` object and the `useTextSize()` consumer hook (no JSX, so
no `react-refresh/only-export-components` conflict); `useTextSizePreference.ts`
holds the actual localStorage-backed state; `src/components/TextSizeProvider.tsx`
wires the two together into the Provider component `App.tsx` wraps around
everything — mirroring `ImageGallery.tsx`/`useImageGallery.ts`'s existing
split exactly (Provider component in `src/components/`, Context object +
consumer hook in `src/hooks/`), the one other Context this app has.

### Unscoped storage key, not `BASE_URL`-templated
**Why:** `useLastPagePersistence.ts`'s storage key is namespaced by this
build's own base path (`dance-schedule:last-page:${BASE_URL}`) because
every content set shares one origin/localStorage in production, and a
last-visited *page* genuinely differs per event. Text size is different —
it's a property of the person using the device, not of which event they
happen to be viewing right now — so `useTextSizePreference.ts` uses a
plain key, `dance-schedule:text-size`, matching `danceScheduleFiltersStorage.ts`'s
own (also-unscoped) key shape instead. A user's preference now stays
consistent across every event on one device.

### The low-contrast fine print (`BuildInfo`/`EventsListPage`) is intentional, not a bug
**Why:** `BuildInfo.module.css`'s `.buildInfo` (the Home page's footer —
build number, "Raw data" debug link, "All events" link) and
`EventsListPage.module.css`'s `.testTag` both hardcode `color: #888`,
which measures below WCAG AA contrast (~3.5:1 vs. the 4.5:1 minimum for
normal text). Initially flagged as a bug to fix alongside this feature,
but the user corrected that this is deliberate: admin-only fine print
(build info, debug tooling, test-fixture indicators), not content meant
for the general/older audience the rest of the app targets — its low
contrast is intentional visual hierarchy, not an oversight. Left exactly
as-is. It still grows under the text-size preference above, same as
everything else on the page — that's a different thing (an opt-in,
user-controlled scale-everything mechanism) from unilaterally recoloring
or enlarging it by default.

### Column widths now scale too (`rem`, not `px`)
**Why:** Originally shipped as an explicit deferred tradeoff (fixed pixel
widths, only the text growing) on the reasoning that threading the current
text-size value into the TS layout code would be a materially bigger
change than a CSS-only rule — but confirmed live to be a real problem, not
just a theoretical one: at Extra Large on a narrow phone, room/level/caller
column headers elided much harder than at Normal (e.g. "Ballroom Centre" →
"Ballroom …"), worse than before this feature existed at all. The
"threading text-size into layout code" framing turned out to be avoidable
entirely: the old `ROOM_COLUMN_WIDTH_PX`/`LEVEL_COLUMN_WIDTH_PX`/
`CALLER_COLUMN_WIDTH_PX` constants (`computeDanceScheduleLayout.ts`/
`computeDanceScheduleLevelLayout.ts`/`computeDanceScheduleCallerLayout.ts`,
plus each grid component's own `TIME_COLUMN_WIDTH`) fed inline `style`
values, but nothing required them to be `px` — renamed to
`ROOM_COLUMN_WIDTH_REM`/etc. (and `levelColumnWidthPx`/`callerColumnWidthPx`'s
lane-growth math to `...Rem`) and switched to `rem`, the browser itself
re-resolves them against the current root font-size on every paint, same as
any other `rem` value, with zero JS/React state threading needed. Same
physical size as before at the unscaled 100% (`9.375rem` = `150px`,
`4.375rem` = `70px`).

### Level-slider edge padding scales with text size too
**Why:** Confirmed live: at Extra Large on a narrow phone (iPhone 13
portrait), the level-slider's last tick label ("C3B+") was genuinely cut
off at the screen edge. Each tick is centered on an exact point (`left`
computed as a fraction of the track's width, then `transform:
translateX(-50%)`) so it lines up precisely under its slider thumb — at
larger text sizes the label text itself is wider, so more of it overhangs
past that centered point, eventually past the viewport edge, which nothing
was reserving room for. Fixed with `padding: 0 1.5rem` on `.levelField`
(`DanceScheduleFilters.module.css`) — `rem`, so the reserved room grows
right along with the label text doing the overhanging, keeping the same
proportional margin at every size instead of needing a value tuned per
step. Set on `.levelField` (the shared parent of both `.ticks` and
`.sliderRoot`), not on either child directly — this file's own prior
history already found that a child's own padding/min-width desyncs
`.ticks` and `.sliderRoot`'s widths from each other, breaking the
tick-to-thumb alignment math.

### Explicit scroll arrows for the nav tab bar, not a CSS scroll shadow
**Why:** The desktop tab bar (`Nav.tsx`) already silently scrolled
horizontally when tabs didn't fit (a narrow window) — confirmed live to get
meaningfully worse now that every tab is wider at Large/Extra Large, with
tabs scrolling out of view and nothing but an easy-to-miss native
scrollbar as a hint they existed at all. Tried a CSS-only "scroll shadow"
first (paired local/scroll-attachment background gradients, the standard
technique for this) — rejected after live testing: individual `<li>`/
`.link` elements (especially the *current* page's own opaque white
background) sit on top of `.list`'s shared background and cover it up
right at the edge, exactly where the shadow needs to be visible. Replaced
with explicit `‹`/`›` overlay buttons (`z-index` above the tab content, so
they can't be covered the same way), shown only when `Nav.tsx`'s own
scroll-position check (`scrollLeft`/`scrollWidth`/`clientWidth`, via a
`ResizeObserver` on the list — not just scroll/window-resize listeners,
since a text-size change alone doesn't fire either of those) confirms
there's really more content in that direction, and clicking one scrolls
all the way to that end.

### Nav scroll arrows redesigned as solid circular buttons, not a bare glyph
**Why:** The first version above was just a `‹`/`›` character sitting on a
transparent-fade gradient, no border or fill of its own — confirmed live
to be too subtle, reading as stray punctuation rather than an actual
control, easy to miss entirely. Redesigned as a solid white, bordered,
drop-shadowed circular chip (the standard "carousel arrow" affordance) —
unmistakably reads as clickable regardless of what tab content is behind
it, with a hover state (fills with `--color-accent`) confirming it's
interactive. Still shown only under the same scroll-position check as
before — this only changed the button's own look, not when it appears.

### Level slider stays compressed-to-fit, not made to scroll — abandoned the scrolling approach
**Why:** "Level-slider edge padding scales with text size too" above fixed
label clipping at the viewport's outer edge, but left a separate, worse
problem: confirmed live (Extra Large, iPhone 13 portrait, a true 390px CSS
viewport) that `.levelField`'s `min-width: min(17rem, calc(100% - ...))` —
added specifically to stop it overflowing the real viewport — was, as a
side effect, compressing the ticks/slider content below the width their
own (now-larger) label text needed, so adjacent tick labels visually
overlapped each other in the middle of the row, not just at the edges.

A first fix tried making the control scroll horizontally instead of
compressing (splitting `.levelField` into a scroll viewport plus an
uncapped-width `.levelInner`, mirroring `Nav.tsx`'s tab bar and the
dance-schedule grid's own columns) — implemented, verified overlap-free via
a desktop-browser iframe, and even given explicit scroll-arrow buttons
(reusing Nav's own solid-circular-chip design, via a
`useHorizontalScrollAffordance` hook shared between the two) once a
real-phone report found the desktop iframe's own always-visible overlay
scrollbar had been masking a real problem: mobile browsers commonly hide a
plain `overflow-x: auto` element's native scrollbar entirely, so there was
no visible sign the control could scroll at all.

**Abandoned that whole approach anyway, per direct product decision** —
scrolling (even with explicit arrows) was more machinery than the problem
warranted, when the control could instead be made to just fit outright.
Reverted to a single, viewport-capped element (`min-width: min(17rem,
100%)`, no scrolling), and closed the overlap gap three different ways at
once instead of one big structural change:
- `.levelField`'s own margin/padding shrunk to a sliver (`0.125rem`/
  `0.5rem`, down from `var(--space-sm)`/`1.5rem`) — every bit of edge
  reserve is width the ticks don't get, and clipping protection needs much
  less of it than the earlier, more generous value assumed.
- `.tick` gets `letter-spacing: -0.04em` — tightening the space BETWEEN
  characters narrows each label's own rendered width without shrinking the
  text itself (works on any font, unlike `font-stretch: condensed`, which
  most system-font stacks have no actual narrow face for), so the labels
  still scale with `useTextSizePreference.ts` exactly like everything else.
- `DanceScheduleFilters.tsx`'s own `tickText()` shortens just the visible
  "A1/A2" tick label to "A" — consistently the single widest label in the
  set (wider even than "C3B+"), and the biggest individual obstacle to
  fitting. Scoped to this component's own visible text only —
  `slot.label` itself (the React `key`, and `DanceScheduleLevelGrid.tsx`'s
  own column header, which has more room per column and isn't asked to
  abbreviate) stays "A1/A2" — and the tick `<button>` gets an explicit
  `aria-label={slot.label}` so a screen reader still announces the full
  "A1/A2," not the sighted-only "A" abbreviation.

**The "A1/A2" → "A" shortening is itself conditional, per direct product
decision** — only applied when `useTextSize()` reports `'x-large'` AND a new
`useMediaQuery('(orientation: portrait) and (max-width: 480px)')` hook
(`src/hooks/useMediaQuery.ts`, a small reactive wrapper around
`window.matchMedia`, generically useful beyond this one call site) reports a
narrow portrait viewport. Confirmed live that the full, un-abbreviated
"A1/A2" already fits without overlap in every OTHER combination — Normal/
Large at any orientation, and Extra Large on a wide/landscape viewport — so
shortening it there would only be losing information for no reason. 480px,
not `Nav.module.css`'s own 640px mobile breakpoint — that one marks "narrow
enough that the desktop tab bar doesn't make sense," a more generous
threshold than "narrow enough that this one label needs to shrink."

Confirmed live: every adjacent tick pair stays at least ~3px apart (the
tightest, "C3A"/"C3B+") at Extra Large on a real 390px phone with both
`combineA1A2`/`combineC3BC4` merges active — the worst case — with no
scrolling, no scroll-affordance buttons, and no clipping at either end. The
un-shortened "A1/A2" also confirmed live to fit at Large on the same 390px
portrait viewport (tightest gap ~8px) and at Extra Large on a landscape
viewport (tightest gap ~12px).

### Date + GCA checkbox trimmed to still share one line at Extra Large
**Why:** Confirmed live (same 390px-iframe technique as above): at Extra
Large on a narrow phone, the Date `<select>` and "Show GCA callers"
checkbox's combined content width came in a few px over what
`.dateGcaRow` had available, so they wrapped onto separate lines — a
regression report asking to "squeeze" them back onto one. Growing the
label text itself was never on the table (that's the entire point of this
feature), so the fix instead trims dead space around it: `.dateGcaRow`'s
gap (`var(--space-md)` → `0.25rem`), `.select`'s horizontal-only padding
(`var(--space-sm)` all sides → `var(--space-sm) 0.25rem`, keeping the
vertical padding that sets its touch-target height), `.checkboxField`'s
gap (`var(--space-sm)` → `0.25rem`), and zeroing the checkbox `<input>`'s
own browser-default margin (Chrome: ~3px/4px, previously uncontrolled by
any rule here). No single one of these closed the gap alone — confirmed
live only the combination did, with a few px of slack to spare. Still
falls back to `.dateGcaRow`'s existing `flex-wrap: wrap` gracefully if a
future change (a longer label, a wider font) reopens the gap.

### TextSizeControl closes PageMenu on selection
**Why:** Reported live: every other item in `PageMenu.tsx`'s mobile dropdown
(a page link) closes the dropdown when clicked, since navigating to a
different route unmounts and remounts `PageMenu` fresh (closed by
construction). Selecting a text size doesn't navigate anywhere, so nothing
else closed the dropdown the same way — an inconsistency once actually
pointed out, since a user could reasonably expect any tap in that menu to
dismiss it. `TextSizeControl` (shared with `Nav.tsx`'s desktop tab bar,
which has no dropdown to close) takes an optional `onSelect` callback, fired
after `setTextSize` on every click; `PageMenu.tsx` passes
`onSelect={() => setIsOpen(false)}`, `Nav.tsx` simply omits it.

## Open questions

- Should this get Playwright e2e coverage? CLAUDE.md's e2e rule targets
  PWA-behavior regressions (offline/SW/caching), and a text-size preference
  is app-level UI state closer in kind to the level-range slider (unit-test
  only today, no e2e of its own) than to the install/offline flows that do
  get e2e coverage — but it's also the app's first real settings UI, an
  argument for holding it to a higher bar. Left undecided.
