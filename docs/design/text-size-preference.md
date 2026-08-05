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

This doc's own decisions accumulated several viewport breakpoints of their
own along the way (the landscape-phone dropdown/title logic, the
narrow-portrait tick-shortening) — see `docs/design/responsive-breakpoints.md`
for a consolidated catalog of every breakpoint in the app, not just the
ones that originated here.

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

**Follow-up — those trims are now scoped to the one case that needs them,
not applied everywhere:** reported live as looking "ugly" — cramped and
uneven — once there was more horizontal room to spare (Normal/Large at any
orientation, or a landscape phone even at Extra Large), since the tight
values above were unconditional. Restored `.dateGcaRow`'s gap and
`.select`'s padding to their pre-trim `var(--space-sm)` defaults, and
bumped `.checkboxField`'s own gap up to match `.dateGcaRow`'s (previously
mismatched — `var(--space-sm)` outer gap next to a tighter checkbox-to-label
gap read as lopsided rather than evenly spaced). The tight values move into
a `@media (orientation: portrait) and (max-width: 480px)` block, further
scoped with `:global(html[data-text-size='x-large'])` — the same
`NARROW_PORTRAIT_QUERY` condition as the level slider's own "A1/A2" → "A"
shortening (`DanceScheduleFilters.tsx`), just expressed directly in CSS here
since only property values change, not rendered text content, so no JS
hook was needed to gate it.

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

### In landscape, Nav.tsx's "Text size" becomes a dropdown menu item, not an always-visible row (superseded — see "Text size is always a dropdown menu item" below)
**Why:** Reported live: on a landscape phone/tablet — much less vertical
room to spare than a typical portrait one or a desktop monitor (always
landscape-shaped, but with plenty of height regardless of that) — the
always-visible "Text size" row below the tab bar felt like it was eating
into scarce vertical space specifically there. `Nav.tsx` now checks
`useMediaQuery('(orientation: landscape)')`: in landscape, "Text size"
becomes a top-level toggle beside the page-link tabs (styled to match
`.link`) that opens a dropdown containing the same three buttons on click;
everywhere else (portrait, including a wide portrait tablet ≥641px that
still shows this bar instead of `PageMenu.tsx`'s mobile version, and any
desktop monitor) it stays exactly as it was — always visible, no extra
click needed, since height was never the constraint there.

Extracted the open/close behavior (Escape-to-close-and-refocus, outside-
click-to-close) into a new shared `useDismissableMenu` hook
(`src/hooks/`), refactoring `PageMenu.tsx`'s own mobile dropdown to use it
too rather than duplicating that logic a second time — two real call sites
now sharing one tested implementation.

**Revised — the toggle lives inside `.list` after all, and the dropdown is
portaled instead of the toggle sitting outside it.** The first version put
the toggle + dropdown OUTSIDE `.list` as a flex sibling of `.listWrapper`,
specifically to dodge `.list`'s `overflow-y: hidden` (set for an unrelated
reason — see that rule's own comment — but it also clips anything that
tries to overflow downward out of the list, which a dropdown opening below
its own trigger needs to do). That traded away too much: reported live as
no longer reading like "one of the tabs" — it didn't scroll away with the
rest of the list, and didn't count toward `canScrollLeft`/`canScrollRight`
either, both real, visible differences from every other item beside it.

Fixed by keeping the toggle itself as an ordinary `<li>` inside `.list`
(scrolls with the rest, counts toward the scroll-affordance arrows exactly
like a page link would) and instead portaling just the DROPDOWN PANEL to
`document.body` via `createPortal`, sidestepping the clipping problem a
different way — the panel no longer has `.list` as an overflow-clipping
ancestor at all, regardless of where its trigger lives. Since the portaled
panel is `position: fixed`, its `top`/`left` are computed from the
toggle's own `getBoundingClientRect()` (a `useEffect` in `Nav.tsx`,
recomputed on open, on window resize, and on the list's own horizontal
scroll — the toggle's on-screen position moves whenever any of those
happen, even though the window itself didn't necessarily resize).

This reopened the outside-click-to-close question `useDismissableMenu`
already answered for `PageMenu.tsx`: a click inside a PORTALED dropdown
isn't a DOM descendant of `rootRef` (the toggle's own `<li>`), so the
hook's existing containment check would have seen it as "outside" and
closed the menu the instant someone tried to click inside it. Fixed by
adding a second, optional `portalRef` to the hook, checked alongside
`rootRef` in the same outside-click handler — `PageMenu.tsx`'s own
dropdown isn't portaled, so it simply never attaches that ref, leaving it
permanently `null` (a no-op in the containment check).

### Level slider gets a max-width, capping tick spacing at ~half an inch
**Why:** Reported live: `.levelField`'s `flex-grow: 1` (added long before
this doc's own history above — it fills whatever width is left in
`.filters`'s row) stretched the whole slider to fill however wide a
desktop monitor's window happened to be, spreading adjacent ticks far
enough apart that reaching a specific one — with a mouse, and especially
with touch — stopped feeling ergonomic. `DanceScheduleFilters.tsx` now
computes `maxLevelFieldWidthPx` from the actual `slots.length` (not a
single fixed constant, since `combineA1A2`/`combineC3BC4` change how many
ticks there are — fewer ticks means fewer, WIDER gaps for a given width, so
fewer ticks need a SMALLER cap to keep each individual gap in budget) and
applies it as an inline `style={{ maxWidth }}`, since a plain CSS rule has
no way to know that count.

Deliberately physical pixels (`MAX_TICK_GAP_PX`, the standard CSS
reference pixel's own inch at 96px/in — 48px/half an inch tried first,
bumped to 72px/three-quarters after that measured live as a bit too
tight), not `rem` — unlike nearly everything else in this app, ergonomic
tick spacing is a motor-control constraint, not a legibility one, so it
shouldn't get MORE generous just because someone prefers larger text
(`useTextSizePreference.ts`). This can still lose to `.levelField`'s own
`min-width` (`min(17rem, 100%)`) at larger text sizes on a wide-enough
screen — CSS resolves a `min-width`/`max-width` conflict in `min-width`'s
favor — which is the correct tradeoff here: the legibility floor that
keeps tick labels from overlapping should win over the ergonomic ceiling
on the rare screen that's simultaneously wide enough to hit the cap and
has Large/Extra Large selected, not the other way around.

**Follow-up — `flex-grow: 1` fought the new cap, leaving no room for
`.filters`'s own centering below the cap's own breakpoint.** Reported
live: on a desktop window narrower than the width where the cap actually
binds (confirmed live to be the common case, not a rare edge one — e.g. an
800px-wide window with 8 slots, below the 536px this cap resolves to
there), the whole Date/GCA/Level row read as "too tight" and oddly
positioned. Root cause: `.levelField` still had `flex-grow: 1` from long
before this cap existed, so it greedily filled 100% of whatever space was
left on its line UP TO the new cap — below that width, "whatever space was
left" was the WHOLE remaining row, leaving flush edges and zero margin for
`.filters`'s `justify-content: center` to visibly center anything against.
Fixed by changing `.levelField` to `flex-grow: 0` and setting `width` (not
just `maxWidth`) to the same computed value in `DanceScheduleFilters.tsx`
— that makes the cap the field's own PREFERRED size (its flex-basis)
instead of an upper bound on unlimited growth, so it renders at exactly
that width whenever there's room, leaving `justify-content: center` free
to center it consistently at every desktop width rather than only the
widest ones. `flex-shrink` stays at its default (1) — a narrow phone still
needs to shrink below this width, just never grow past it.

### TextSizeControl's own "Text size" heading is optional
**Why:** Reported live: `Nav.tsx`'s landscape dropdown (see that decision
above) shows a "Text size" toggle button, and opening it revealed
`TextSizeControl`'s own "Text size" heading right above the three size
buttons — the same two words twice in a row, once as the thing you already
clicked. `TextSizeControl` now takes an optional `showHeading` prop
(default `true`, so `Nav.tsx`'s own always-visible row and
`PageMenu.tsx`'s dropdown — neither has a preceding "Text size" label of
its own — are unaffected); the landscape dropdown passes
`showHeading={false}`. The heading itself is still rendered even when
`false`, just switched from `.heading` to a `.visuallyHidden` class instead
of being removed outright — `.control`'s `role="group"` gets its
accessible name via `aria-labelledby` pointing at that span, so removing
it entirely would leave the group unlabeled for screen reader users
instead of just not showing the redundant text to sighted ones.

### Landscape "Text size" dropdown clamped to the viewport's right edge
**Why:** A heuristic usability review (live, across the window-size ×
orientation × text-size matrix) found the landscape dropdown (see "In
landscape, Nav.tsx's 'Text size' becomes a dropdown menu item" above)
opening off-screen whenever its toggle sat near the tab bar's own right
edge — the realistic way to reach it at all, since "Text size" is
typically the last (rightmost) tab, reached by scrolling the tab list
right first. The existing position effect only ever set `{top: rect.bottom,
left: rect.left}` from the toggle's own rect, with no right-edge check.
Fixed with a second `useLayoutEffect` (not `useEffect`, so the correction
happens before the browser paints the freshly-opened dropdown, not as a
visible post-open jump) that measures the portaled dropdown's own rendered
width and clamps `left` down to `window.innerWidth - dropdownWidth - 8px`
whenever the toggle-aligned position would exceed it — guarded to only
ever move `left` when it's over that max (never increases it), so the
effect can't loop. Verified live at 844×390 (scroll tab list right, open
toggle): dropdown right edge now on-screen; the normal/unclamped case
(toggle nowhere near the edge) confirmed unaffected.

### Level-slider thumbs enlarged for discoverability, not given a separate ghost hit-area
**Why:** The same usability review flagged the slider thumbs' touch target
as too small. Investigated "click anywhere on the track to jump the
nearest thumb there" first — confirmed live this already works (Radix
`Slider`'s own default behavior, not something this codebase built) — and
initially recommended relying on that plus, at most, an invisible enlarged
hit-area rather than changing the thumb's visible size. Corrected: click-
to-jump, while functional, isn't discoverable — nothing about a thin, flat
track visually suggests it's interactive, so a hidden affordance nobody
would think to try doesn't actually solve the reported problem. Revised to
enlarging the visible thumbs themselves — the standard, self-evident
slider-handle convention — approved and implemented: `.sliderThumb`'s
border-top/bottom (the CSS-triangle technique's height) grew from 8px to
11px, and `.sliderThumbMin`/`.sliderThumbMax`'s border-left/border-right
(the triangle's width/point) grew from 12px to 18px; `.sliderRoot`'s own
height grew from `1.25rem` to `1.5rem` to comfortably contain the taller
thumb box without clipping. Kept as raw `px`, not `rem`, matching this
doc's existing "Level slider gets a max-width" reasoning — touch/motor-
precision sizing is independent of the text-size preference, so it
shouldn't scale with it. Confirmed live Radix's own thumb-centering math
(`translateX`-based) adapts to the new width automatically, with no change
needed to the tick-position calc's own hardcoded inset. Verified clean (no
overflow, no crowding against the tick marks above) at Normal/Large/Extra
Large on both the 390px portrait reference width and a 844×390 landscape
width.

While verifying, also found (and fixed, though unrelated to the
thumb-size change itself) that `.sliderRoot`'s `min-width: 12rem` —
unchanged by the above, and predating it — overflowed `.levelField`'s own
right edge by ~19px at a 320px-wide viewport with Extra Large selected:
12rem resolves to 288px at 150% root font-size, wider than the ~257px
actually available inside `.levelField` at that width, and unlike
`.levelField`'s own `min-width: min(17rem, 100%)`, this floor wasn't
capped to the container's available space. Confirmed via HMR with the
thumb genuinely reverted to its old 12px/8px CSS (not just measuring the
same page) that the overflow was identical either way — a latent,
pre-existing issue unrelated to the thumb-size change, not a regression it
introduced. Fixed the same way `.levelField` already was: `min-width:
min(12rem, 100%)`. Not reproducible at this doc's established 390px
reference floor (no overflow there at any text size) either before or
after.

### Dropdown show/hide no longer transitions `visibility` (first attempt — insufficient on its own)
**Why:** Reported live: on an iPhone with the app installed as a standalone
PWA, tapping the Normal/Large/Extra Large buttons inside either dropdown
(`Nav.tsx`'s landscape one or `PageMenu.tsx`'s mobile kebab menu — both
share the identical show/hide CSS) did nothing at all — no visual reaction,
no size change. Both dropdowns fade in/out via `opacity`/`transform`, with
`visibility`/`pointer-events` toggled alongside to keep the closed dropdown
out of the accessibility tree and non-interactive — but `visibility` was
also listed in the `transition` property, and WebKit has a long-standing
bug where a *transitioned* `visibility: hidden -> visible` doesn't reliably
flip to visible at time zero the way the CSS spec requires (unlike Chrome/
Firefox), instead interpolating it across the transition's duration like
`opacity`/`transform`. A `visibility: hidden` element never receives
pointer events at all, regardless of what `pointer-events` is separately
set to — so on WebKit specifically, the dropdown could visually fade in
(via `opacity`) while remaining non-interactive for some or all of the
150ms transition, or longer if the bug is worse than that. Fixed by
removing `visibility` from both dropdowns' `transition` list — it's still
toggled on `[data-open]`, just as an ordinary, non-transitioned property,
so it flips instantly on the same style recalc as the attribute change in
every browser, with no animation of its own to race. Confirmed unchanged
behavior in Chrome (which already handled the transitioned version
correctly, so removing it changes nothing there); the iOS-specific fix
itself couldn't be verified live (no Safari/iOS device available in this
session's tooling) — flagged for the reporter to confirm after this
ships.

### Dropdown show/hide drops its `transform` slide entirely (the actual fix)
**Why:** The `visibility` fix above shipped but didn't resolve it — the
reporter confirmed the bug persisted specifically on the real device (not
the iOS Simulator, and not a plain Safari tab — only the installed
standalone PWA on real hardware). Diagnosed directly via Safari's Web
Inspector attached to the real iPhone (Develop menu, over a USB
connection): the button's actual touch-hit-testing box was rendering
BELOW where its text visually appeared once the dropdown was open —
confirmed by the reporter tapping the real (offset) hit-area, which worked
immediately. Both dropdowns' open animation was `opacity` fading in
together with `transform: translateY(-0.25rem) -> translateY(0)` (a subtle
4px slide) in the same `transition`. That offset (hit-testing sitting
BELOW the display, i.e. at the dropdown's PRE-transform position, since
`translateY(-0.25rem)` moves the box UP to reveal it) matches a
`position` + animated `transform` hit-testing desync specific to WebKit on
real hardware — not reproducible in the iOS Simulator (software-only,
no real touch hardware) or in Chrome, which is exactly why both earlier
rounds of testing in this session (Chrome, at multiple sizes, and the
Simulator) found nothing wrong. Fixed by dropping the `transform`
slide-in entirely from both dropdowns, leaving only the `opacity` fade —
removing the transform removes the desync outright rather than trying to
find some other transform value/technique WebKit would sync correctly.
Confirmed unchanged in Chrome (fades in identically, just without the
small slide, which was purely decorative).

### Text size is always a dropdown menu item, in every orientation — the always-visible row is gone
**Why:** Direct product decision, after the landscape-vs-portrait split
above had been live for a while: reported that the portrait/desktop
always-visible row read as "buttons sitting on top of every content page,"
not a menu item — inconsistent with landscape's own dropdown treatment,
and the wrong shape for a nav-level preference control. `Nav.tsx` no
longer branches on `useMediaQuery('(orientation: landscape)')` at all for
this decision — the toggle-plus-portaled-dropdown from the landscape case
above is now the ONLY treatment, unconditionally, regardless of
orientation or whether the window is a phone, tablet, or desktop monitor.
`LANDSCAPE_QUERY` and the `useMediaQuery` import were removed from
`Nav.tsx` entirely (no other use for them there); `.textSizeRow`
(`Nav.module.css`) was deleted as dead CSS along with it. Everything else
about the dropdown — the portal, the position-tracking effects, the
right-edge clamp, the opacity-only fade — is unchanged; only the
condition gating WHICH treatment shows disappeared, not the dropdown's own
mechanics. `PageMenu.tsx`'s mobile kebab-menu dropdown was already a menu
item in this same sense (never had an always-visible-row alternative), so
it needed no change here.

### PageHeader's page title visually hidden on a landscape phone (not just Nav's own controls)
**Why:** Reported live: on a landscape phone specifically, `PageHeader.tsx`'s
`<h1>` (the current page's own title, shown above every page's content) both
ate into the same scarce vertical space already flagged for `Nav.tsx`'s Text
size control (see the landscape decisions above) and duplicated information
already visible elsewhere — the current page's tab in `Nav.tsx` (bold +
accent-colored) or its selected item in `PageMenu.tsx`'s own dropdown. Scoped
to phone width specifically (`(orientation: landscape) and (max-width:
640px)`, matching `PageMenu.module.css`'s/`Nav.module.css`'s own 640px
breakpoint), not every landscape window — a landscape tablet or desktop
monitor has plenty of vertical room to spare, and the title reads as
ordinary page content there, not a redundant duplicate. Same "still there,
just visually hidden" approach as `TextSizeControl.tsx`'s own
`showHeading={false}`: the `<h1>` keeps rendering (via a new colocated
`.visuallyHidden` class in `PageHeader.module.css`, the same clip-based
technique already used elsewhere in the app) rather than being conditionally
unmounted, so the page keeps its one semantic heading landmark for screen
reader users even when sighted users on a landscape phone don't see it.

## Open questions

- Should this get Playwright e2e coverage? CLAUDE.md's e2e rule targets
  PWA-behavior regressions (offline/SW/caching), and a text-size preference
  is app-level UI state closer in kind to the level-range slider (unit-test
  only today, no e2e of its own) than to the install/offline flows that do
  get e2e coverage — but it's also the app's first real settings UI, an
  argument for holding it to a higher bar. Left undecided.
