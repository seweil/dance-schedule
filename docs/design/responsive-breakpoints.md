# Responsive breakpoints & layout logic

## Context

Viewport-based responsive logic (phone vs. tablet vs. desktop, portrait vs.
landscape) has accumulated piece by piece across many components and
sessions — each addition well-reasoned and commented in its own file, but
with no single place that lists every breakpoint value in use, what each one
actually means, or how they relate to each other. `docs/design/schedule-page.md`'s
"Breakpoint strategy" decision flagged this back when there were only two
consumers of the `640px` value ("reconsider extracting a shared token once a
third component needs it") — there are now six-plus. This doc is a catalog
and cross-reference: each value below already has its own detailed rationale
in the file/doc it links to; this doc's job is to show them all in one place,
note where they interact or conflict, and (per the Decisions below) provide
the actual shared token that resolves the "reconsider" flag.

## Sub-problems

- [x] What breakpoint/orientation values are actually in use across the app,
      and which components use each — see Decisions, "The breakpoints"
- [x] Are any of them inconsistent with each other — see "Fixed inconsistency"
- [x] Is there other viewport-driven logic that isn't a `@media` query at all
      (JS-computed sizes, `useMediaQuery` hooks) — see "Non-`@media` responsive logic"
- [x] Should the repeated literal values be extracted into a shared token now
      that the "third consumer" threshold has been crossed — see "Shared
      breakpoint token: `src/breakpoints.css` + `src/lib/breakpoints.ts`"
- [x] What actually changes at each breakpoint, feature by feature (for
      someone who wants "what does phone vs. desktop even look like," not
      just the query values) — see "Feature-by-feature: what's active where"
- [x] A follow-up audit (this doc had drifted behind the code — two later
      queries, `PORTRAIT_PHONE_QUERY` and `PHONE_QUERY`, and a `(hover: hover)`
      check existed in the codebase but were never catalogued here) plus three
      real bugs found and fixed along the way — see "Follow-up audit and three
      bug fixes" below

## Decisions

### The breakpoints

| # | Query | Meaning | Used by |
|---|-------|---------|---------|
| 1 | `--phone` (`max-width: 640px`) / `--tablet-and-up` (`min-width: 641px`) | phone vs. tablet-and-up — the app's primary cutover | `Nav.module.css`, `PageMenu.module.css`, `HintBalloon.module.css` (its `'center'`-placement balloon repositions once there's room), `DanceScheduleFilters.module.css` (`.select` border), `ScheduleList.module.css`, `DanceScheduleGrid.module.css` (width half of #2 below); `PHONE_MAX_WIDTH_PX`/`TABLET_MIN_WIDTH_PX` on the JS side (feed #8/#9 below) |
| 2 | `--phone, (max-height: 500px)` | narrow-portrait **or** short-landscape phone (an OR, not just width) | `DanceScheduleGrid.module.css` |
| 3 | `(orientation: portrait) and (max-width: 480px)` | the single narrowest realistic phone width, portrait only | `DanceScheduleFilters.tsx` (`NARROW_PORTRAIT_QUERY`), duplicated in `DanceScheduleFilters.module.css` |
| 4 | *(removed)* `(orientation: landscape) and (min-width: 641px)` | historical — `PageHeader.tsx`'s old `WIDE_LANDSCAPE_QUERY`, visually hid the page `<h1>` in landscape at tablet-and-up width. Removed: `orientation: landscape` doesn't actually distinguish "landscape phone/tablet" from "an ordinary desktop browser window" — nearly every desktop window IS landscape-shaped, so this was unintentionally hiding the title on virtually all desktop visits, not just the narrow landscape-phone/tablet case it was written for. Per direct product decision, the title now always shows, at every width and orientation — see "Follow-up audit and three bug fixes" below. Listed here only because older commits/docs still reference it, same as #6. |
| 5 | `(prefers-reduced-motion: reduce)` | not a size breakpoint — an accessibility preference, listed for completeness | `Nav.module.css`, `PageMenu.module.css`, `ScrollToTopButton.tsx` |
| 6 | *(removed)* `(orientation: landscape)` alone, no width qualifier | historical — `Nav.tsx`'s old `LANDSCAPE_QUERY`, used to gate whether "Text size" was a dropdown or an always-visible row. Removed entirely once that control became a dropdown unconditionally (see `docs/design/text-size-preference.md`'s "Text size is always a dropdown menu item" decision) — listed here only because older commits/docs still reference it. |
| 7 | `(max-height: 500px)` alone, no width qualifier | vertical space is genuinely limited — deliberately width-agnostic, unlike #2's combined version: a narrow PORTRAIT phone has plenty of vertical room and shouldn't match this one | `PageHeader.module.css` (reduces the margin between the title/menu row and the page content below it) |
| 8 | `(orientation: portrait) and (max-width: 640px) and (pointer: coarse)` | a genuine portrait PHONE — width/orientation alone (the first two clauses) can't distinguish that from a desktop browser window simply resized narrow-and-tall, which reports `pointer: fine` (a mouse) rather than `coarse` (a finger); see "Follow-up audit and three bug fixes" for why the `pointer` clause was added | `src/lib/breakpoints.ts`'s `PORTRAIT_PHONE_QUERY` — `RotateDeviceBanner.tsx`, `useResetRotateBannerOnLandscape.ts` |
| 9 | `(max-width: 640px), (max-height: 640px)` | an orientation-agnostic "is this a phone" — matches EITHER dimension being phone-sized, so (unlike #8) it also matches a phone in landscape, whose width alone exceeds 640px while its height (its portrait width, unchanged by rotation) stays narrow. See `docs/design/onboarding-hints.md` for the full history. | `src/lib/breakpoints.ts`'s `PHONE_QUERY` — `FirstRunTextSizePrompt.tsx`, and read-only in `PageMenu.tsx`/`DanceScheduleFilters.tsx` (suppressing their own onboarding hints while that modal is visible) |
| 10 | `(hover: hover)` | a real mouse/trackpad, not a touchscreen (which reports `hover: none` even though it technically supports `:hover` via tap-and-hold) | `DanceScheduleFilters.module.css` (`ew-resize` cursor on the level-slider thumbs) and, as a JS-side twin of the same query, `DanceScheduleFilters.tsx`'s `supportsHover` (gates the hover-only ghost-preview marker on the slider track — see that file's own comment) |

### Shared breakpoint token: `src/breakpoints.css` + `src/lib/breakpoints.ts`

**Why:** Breakpoint #1 above had six-plus consumers (well past
`schedule-page.md`'s own "reconsider once a third component needs it"
threshold) and — see "Fixed inconsistency" below — two of them had actually
drifted apart by one pixel. Extracted into an actual shared source of truth
rather than left as a documented convention, since plain CSS custom
*properties* can't be used inside an `@media` condition at all (a real spec
limitation, not an oversight) — a `var(--breakpoint-phone)` inside `@media
(max-width: var(--breakpoint-phone))` is simply invalid CSS, in every
browser. Two separate mechanisms, one per language, kept in sync by hand
across the two files since neither can express the other's half:

- **CSS side** — `src/breakpoints.css` defines
  `@custom-media --phone (max-width: 640px);` and
  `@custom-media --tablet-and-up (min-width: 641px);`, using the
  [PostCSS Custom Media] plugin (`postcss-custom-media`, `postcss.config.js`)
  to resolve `@media (--phone) { ... }`/`@media (--tablet-and-up) { ... }`
  in any `.module.css` file into the real, literal media query at build
  time — zero runtime cost, same as CSS Modules itself. Custom media names
  are made available globally (no per-file `@import` needed) via
  `@csstools/postcss-global-data`, run before `postcss-custom-media` in
  `postcss.config.js` — `postcss-custom-media`'s own `importFrom` option
  handled this in older versions but was removed (v12); `postcss-global-data`
  is the currently-recommended replacement for exactly this "Modular CSS"
  case (each CSS Module file is processed independently, so a plugin can't
  otherwise see a `@custom-media` declared in a different file).
- **TS side** — `src/lib/breakpoints.ts` exports both `PHONE_MAX_WIDTH_PX =
  640` and `TABLET_MIN_WIDTH_PX = 641`, the same two literals, for
  `useMediaQuery()`/`usePinnedMediaQuery()` call sites that build a query
  *string* at runtime rather than writing a static `@media` rule —
  `PORTRAIT_PHONE_QUERY` (breakpoint #8) and `PHONE_QUERY` (breakpoint #9)
  are both built from `PHONE_MAX_WIDTH_PX`; `PageHeader.tsx`'s old
  `WIDE_LANDSCAPE_QUERY`, built from `TABLET_MIN_WIDTH_PX`, was the original
  (now-removed, see breakpoint #4) consumer that motivated exporting
  `TABLET_MIN_WIDTH_PX` in the first place.

Both are named as directly as possible (`--phone`/`--tablet-and-up`,
`PHONE_MAX_WIDTH_PX`/`TABLET_MIN_WIDTH_PX`) rather than something more
generic like `--breakpoint-1`, so a reader doesn't need this doc open to
guess what either one means.

### Narrow-portrait-or-short-landscape (`DanceScheduleGrid.module.css`) is deliberately an OR of two different dimensions, not the same 640px rule

**Why:** An iPhone in landscape is wide but short — `max-width: 640px` alone
would miss it, since landscape phone widths (e.g. ~740-926px) are well above
640px. `max-height: 500px` catches that case on the OTHER axis — kept as a
plain literal (one consumer only, unlike breakpoint #1) but expressed as
`@media (--phone), (max-height: 500px)`, reusing the shared token for its
width half since it's the identical underlying value. Below this combined
breakpoint, `DanceScheduleGrid`'s header/body wrappers switch from one
shared scroll box to two independently-scrolling ones so the page itself
(not an inner box) owns vertical scroll — full rationale in
`docs/design/dance-schedule-mobile-scroll.md`. This is a genuinely different
kind of check from breakpoint #1 (a real OR across two CSS features, not
just a different pixel value), not simply "the same idea with different
numbers."

### `480px` + portrait (`DanceScheduleFilters.tsx`'s `NARROW_PORTRAIT_QUERY`) targets one specific, narrow combination

**Why:** Deliberately narrower than the `640px` mobile-menu cutover — that
one marks "narrow enough the desktop tab bar doesn't make sense," a much
more generous threshold than "narrow enough this one tick label needs to
shrink." Always paired with a *non-viewport* signal, `useTextSize() ===
'x-large'`, in both consumers (the `tickText()` "A1/A2" → "A" abbreviation
in the `.tsx`, and the `.dateGcaRow`/`.select` spacing trim in the
`.module.css`, expressed as `:global(html[data-text-size='x-large'])`
rather than threaded through JS since only property values change there,
not rendered text) — Normal/Large text already fits fine at this same
narrow width, confirmed live, so the extra trim only applies to the one
combination that actually needs it. Single consumer — kept as a plain
literal, not folded into the shared token above.

### `PageHeader.module.css` reduces the menu-to-content margin below `max-height: 500px`
**Why:** Direct product decision: when vertical space is genuinely tight,
the fixed `margin-bottom` between the title/menu row and the page's own
content below it should shrink too, the same instinct behind several of
this doc's other "vertical space is short" decisions. Deliberately
width-agnostic — no `--phone`/`max-width` condition alongside it, unlike
breakpoint #2's combined version — since a narrow PORTRAIT phone still has
plenty of vertical room and this margin doesn't need to shrink just because
the screen is narrow. Reuses the same `500px` literal
`DanceScheduleGrid.module.css` already established for its own "short
vertical space" check (breakpoint #2) rather than inventing a new number,
even though the two conditions aren't identical (this one drops the width
half) — this is only the second consumer of that specific `500px` value,
still below the "reconsider extracting a token" threshold this doc's own
`640px`/`641px` pair crossed.

### Non-`@media` responsive logic (JS-computed, not CSS breakpoints)

Not every viewport-dependent behavior is a `@media` query — a few places
compute a size in JS instead:

- **`MAX_TICK_GAP_PX` (72px) / `maxLevelFieldWidthPx`** (`DanceScheduleFilters.tsx`)
  — caps the level slider's tick spacing at roughly three-quarters of an
  inch on a wide desktop monitor, computed from the actual slot count (fewer
  ticks need a smaller cap for the same per-gap budget). Deliberately raw
  `px`, not `rem` — an ergonomic/motor-control constraint that shouldn't
  grow just because a user picked a larger text size
  (`useTextSizePreference.ts`), unlike nearly everything else sized in this
  app. See `docs/design/text-size-preference.md`'s "Level slider gets a
  max-width" decision.
- **`.levelField`'s `min-width: min(17rem, 100%)` and `.sliderRoot`'s
  `min-width: min(12rem, 100%)`** (`DanceScheduleFilters.module.css`) — the
  opposite instinct from the point above: these ARE `rem`-based (so they
  scale with text size) but capped with `min(…, 100%)` so the floor can
  still shrink below its own nominal size on a viewport narrower than that
  floor, rather than overflowing it. `.sliderRoot`'s own `min(12rem, 100%)`
  cap was added after a real, confirmed overflow bug at 320px+Extra Large —
  see `docs/design/text-size-preference.md`'s "Level-slider thumbs enlarged
  for discoverability" decision for how that was found and fixed.
- **Column widths** (`ROOM_COLUMN_WIDTH_REM` and siblings, `computeDanceScheduleLayout.ts`
  and its level/caller equivalents) — `rem`, so they scale with the text-size
  preference, but that's a text-size axis, not a viewport-width axis; listed
  here only because it interacts with the width breakpoints above (a wider
  column at Extra Large leaves less room before a header needs to truncate,
  independent of which width breakpoint is active).
- **`usePinnedMediaQuery` vs. `useMediaQuery`** (`src/hooks/`) — every query
  in the table above is evaluated through `useMediaQuery`, which re-subscribes
  to the real `MediaQueryList`'s `'change'` event and stays LIVE for the
  rest of that mount: resize the window, rotate the phone, and the app
  reacts immediately. `PHONE_QUERY` (breakpoint #9) is the one exception —
  its three consumers (`FirstRunTextSizePrompt.tsx`, and the read-only
  copies in `PageMenu.tsx`/`DanceScheduleFilters.tsx`) all use
  `usePinnedMediaQuery` instead, which reads `matchMedia` once at mount and
  never updates again. Per direct product decision: `PHONE_QUERY`'s own
  width-or-height OR already makes it orientation-invariant for a genuine
  phone (true at mount, stays true through a rotation, live-tracked or not)
  — the only thing live-tracking that one specific query actually did was
  let a DESKTOP user's window resize make `FirstRunTextSizePrompt.tsx`'s
  modal pop up (or vanish again, un-dismissed) mid-session, which pinning
  removes without weakening the phone-rotation case at all. See
  `docs/design/onboarding-hints.md`'s own "`PHONE_QUERY` pinned at mount"
  decision for the full history.

### Fixed inconsistency: `ScheduleList` used to say `min-width: 640px`, one pixel off `Nav`'s true complement

**What it was:** `Nav.module.css` hid the desktop tab bar at `max-width:
640px` (i.e. AT exactly 640px, already hidden), but `ScheduleList.module.css`
gated its own desktop-style grid layout on `min-width: 640px` — meaning at a
viewport of exactly 640px, `ScheduleList` would already show its grid layout
while `Nav`'s own bar had just gone `display: none` (`PageMenu`'s kebab menu
showing instead). `schedule-page.md`'s own "Breakpoint strategy" decision
already admitted this was "duplicating `Nav`'s literal" rather than sharing
an actual token, so the two were never guaranteed to line up.

**Fixed** as part of extracting the shared token above: `ScheduleList.module.css`
now uses `@media (--tablet-and-up)` (`min-width: 641px`), the true complement
of `Nav`'s `--phone`, eliminating the 1px gap. A real device is very unlikely
to land exactly on 640px, so this was always more a correctness nit than a
visible bug — but sharing one token makes this kind of drift structurally
impossible to reintroduce, not just unlikely.

### Follow-up audit and three bug fixes

**Why the audit:** Before fixing three reported desktop bugs, this doc was
re-checked against the actual current code (`grep` across every
`useMediaQuery`/`usePinnedMediaQuery`/`@media` call site) rather than
trusting its own prior contents — it had genuinely drifted: `PORTRAIT_PHONE_QUERY`
(breakpoint #8) and `PHONE_QUERY` (breakpoint #9), both added in later
sessions, were never added to the breakpoints table; `HintBalloon.module.css`'s
own `--tablet-and-up` use wasn't listed under breakpoint #1's consumers;
`(hover: hover)` (breakpoint #10) wasn't catalogued at all; and
`RotateDeviceBanner.tsx`/the first-run text-size prompt weren't in the
feature-by-feature table even though both are squarely "features that
depend on window or device." All fixed above, alongside the three real bugs
below, found BECAUSE this audit forced re-reading every consumer's actual
current behavior instead of trusting the existing catalog.

**Bug 1 — the page title was hidden on virtually all desktop visits, not
just landscape phones/tablets.** `PageHeader.tsx`'s old `WIDE_LANDSCAPE_QUERY`
(`(orientation: landscape) and (min-width: 641px)`, former breakpoint #4)
was written to avoid the title duplicating `Nav.tsx`'s own already-highlighted
current tab on a landscape phone/tablet, where vertical space is also scarce
— but `orientation: landscape` doesn't actually mean "phone or tablet": it's
simply width > height, true of nearly every ordinary desktop browser window
too. Reported live as "title hidden above 950px" — that's just wherever a
particular desktop window happened to already be wider than it was tall,
which is normally true immediately. Per direct product decision, the
title now always shows, at every width and orientation, full stop —
`WIDE_LANDSCAPE_QUERY` and the `isWideLandscape`/`useMediaQuery`
conditional removed entirely from `PageHeader.tsx`, along with the now-dead
`.visuallyHidden` CSS class that rule used. The original "duplicates Nav's
current tab" concern is accepted as a real but lesser cost than hiding the
page's own heading — the title and the highlighted nav tab can coexist.

**Bug 2 — the nav tab bar showed a native horizontal scrollbar underneath
its own custom `‹`/`›` arrow buttons.** `Nav.module.css`'s `.list` has
always needed `overflow-x: auto` to actually be scrollable (see that rule's
own comment) — which, by default, also paints the browser's OWN scrollbar,
redundant with (and visually competing against) the explicit
`.scrollButton` affordance built specifically because the native scrollbar
alone was "too easy to miss" (see that rule's own comment, further up this
same file). Fixed by hiding the native scrollbar
(`scrollbar-width: none` for Firefox; `::-webkit-scrollbar { display: none }`
for Chromium/WebKit) while leaving `overflow-x: auto` itself unchanged —
the list stays genuinely scrollable (mouse wheel, trackpad swipe, the arrow
buttons' own `scrollTo()`, keyboard), just without a second, visually
competing scroll indicator.

**Bug 3 — the rotate-to-landscape suggestion could be triggered by a
resized desktop browser window, not just a real phone.**
`PORTRAIT_PHONE_QUERY` (breakpoint #8) was purely shape-based
(`(orientation: portrait) and (max-width: 640px)`) — a desktop user
resizing their browser window narrow-and-tall (or a snapped half-screen
portrait-shaped window) matched it exactly the same as a genuine phone,
even though "rotate your phone" makes no sense for a mouse-and-keyboard
device that can't physically rotate. Fixed by adding `(pointer: coarse)` to
the shared query — a coarse (finger) pointer is the actual signal for "this
is a touchscreen device," independent of window shape; an ordinary desktop
browser reports `pointer: fine` (a mouse) regardless of how its window is
resized. Fixed at the shared `PORTRAIT_PHONE_QUERY` constant
(`src/lib/breakpoints.ts`), not locally in `RotateDeviceBanner.tsx` alone,
so its other consumer (`useResetRotateBannerOnLandscape.ts`) gets the same
correction automatically — both already shared this one query specifically
so a fix like this wouldn't need to be applied twice.

## Feature-by-feature: what's active where

Every UI element/behavior in this app that changes based on the breakpoints
above, grouped by feature rather than by breakpoint — useful for "what does
this actually look like on a phone vs. a desktop," not just the query
values. Screenshots aren't included here (this doc is text-only), but every
row names the exact component/file to look at directly.

| Feature | ≤640px (phone, either orientation) | ≥641px (tablet/desktop) |
|---|---|---|
| **Top-level navigation** | `PageMenu.tsx`'s hamburger ("☰") button, opening a dropdown with every page link plus "Text size" — shares a row with the page's own title (`PageHeader.tsx`), in every orientation. `Nav.tsx`'s own bar is `display: none`. | `Nav.tsx`'s horizontal tab bar (one `<a>` per page, current page bold + accent-colored + "merged into" the page below), plus a "Text size" toggle as the last tab. `PageMenu.tsx`'s `.nav` is `display: none`. |
| **"Text size" control** | Lives inside `PageMenu.tsx`'s hamburger dropdown, alongside the page links. | Its own top-level toggle in `Nav.tsx`'s tab bar, opening a small portaled dropdown panel below it (`Nav.module.css`'s `.textSizeDropdown`). Same three Normal/Large/Extra Large buttons either way (`TextSizeControl.tsx`) — only the surrounding menu shape differs. |
| **Page title (`PageHeader.tsx`'s `<h1>`)** | Always shown normally, in every orientation — `PageMenu.tsx`'s hamburger toggle is closed by default and shows no page name until tapped open, so the title is the only visible page identifier at this width; hiding it here was tried and reverted as a regression, not a fix (see `docs/design/text-size-preference.md`'s "Revised" note). | **Always shown now, every orientation** — the old landscape-only hiding (breakpoint #4) was removed; see "Follow-up audit and three bug fixes" below for why it was actually hiding the title on virtually all desktop visits, not just the narrow case it was meant for. |
| **Nav tab-bar horizontal scroll arrows** (`Nav.module.css`'s `.scrollButton`) | N/A — `Nav.tsx`'s whole bar is hidden here. | Shown only when `Nav.tsx`'s own scroll-position check confirms the tab list has more content in that direction (e.g. six tabs plus "Text size" not all fitting on one line) — a narrow desktop window can still trigger this even though it's "desktop." The list's own native browser scrollbar is hidden (`scrollbar-width: none` / `::-webkit-scrollbar { display: none }`) whenever it's actually scrollable, so these arrows are the only visible scroll affordance — see "Follow-up audit and three bug fixes" below. |
| **Rotate-to-landscape suggestion** (`RotateDeviceBanner.tsx`, breakpoint #8) | Shown only on the three dance-schedule grid pages (Room/Dance/Caller Schedule), only in portrait, only on a genuine touch device (`pointer: coarse` — see "Follow-up audit and three bug fixes" below for why that clause was added) — a desktop window merely resized narrow-and-tall no longer triggers it. Dismissible; resets the next time the device leaves and re-enters portrait (`useRotateBannerDismissed.ts`/`useResetRotateBannerOnLandscape.ts`). | Never shown — `pointer: coarse` alone already rules out an ordinary desktop browser regardless of window shape. |
| **First-run text-size prompt** (`FirstRunTextSizePrompt.tsx`, breakpoint #9) and its suppression of the kebab-menu/level-slider onboarding hints (`PageMenu.tsx`/`DanceScheduleFilters.tsx`) while it's visible | Shown once, on a genuinely fresh device's first launch (`PHONE_QUERY`, pinned at mount — see the "`usePinnedMediaQuery`" note above). Full design history, including the click-swallow bug this suppression fixes, in `docs/design/onboarding-hints.md`. | Never shown — gated out at desktop widths/aspect ratios by the same `PHONE_QUERY` check. |
| **Level-slider thumb cursor** (`DanceScheduleFilters.module.css`, breakpoint #10) | No special cursor — a touch device drags with a finger, not a mouse cursor. | `ew-resize` cursor on hover (`(hover: hover)`), plus a JS-driven hover-only "ghost" preview marker on the track (`DanceScheduleFilters.tsx`'s `supportsHover`). |
| **Menu-row-to-content margin** (`PageHeader.module.css`, breakpoint #7) | Not gated by this table's own width columns at all — purely a height check (`max-height: 500px`), independent of phone/tablet width or orientation. A short window of either width gets the smaller `var(--space-sm)` margin between the title/menu row and the page content below it; a taller one (even a narrow phone in portrait) keeps the normal, more generous `var(--space-md)`. | Same as the left column — this one row is genuinely width-agnostic, unlike every other row in this table. |
| **Events list layout** (`ScheduleList.module.css`) | Single flex column — date heading, then each event's time/location/description stacked. | 3-column CSS grid (time / location / description) aligned across every date section via `subgrid`, gated on `--tablet-and-up` (breakpoint #1) — a portrait iPad still gets the grid, since width (not orientation) is the actual signal for "room enough." |
| **`<select>` (Date picker) border** (`DanceScheduleFilters.module.css`) | No border/radius — native mobile `<select>` chrome mostly ignores it anyway. | Rounded 1px border, matching `.timeLabel`'s radius elsewhere in the dance-schedule UI. |
| **Dance-schedule grid scroll ownership** (`DanceScheduleGrid.module.css`, breakpoint #2) | The grid stops being its own scroll box; the whole page scrolls instead, room/level headers stay pinned via `position: sticky` against the real viewport, and the grid bleeds edge-to-edge. A **short landscape phone** hits this too (`max-height: 500px`), even though its width alone wouldn't. | The grid is its own bounded scroll area (`max-height: 70vh`), independent of page scroll. |
| **Level-slider "A1/A2" tick label** (`DanceScheduleFilters.tsx`, breakpoint #3) | **Only** at Extra Large text size on a narrow **portrait** phone (≤480px): shortened to "A" (full "A1/A2" still announced to screen readers via `aria-label`). Every other combination (any width at Normal/Large, or Extra Large in landscape/on a wider screen) keeps the full label. | Full "A1/A2" label always. |
| **Date + "Show GCA callers" row spacing** (`DanceScheduleFilters.module.css`, breakpoint #3) | **Only** at Extra Large text size on a narrow portrait phone: gaps/padding trimmed to keep both controls on one line instead of wrapping. | Normal, more generous spacing always. |
| **Scroll-to-top button visibility** (`ScrollToTopButton.tsx`) | Not breakpoint-gated directly — but relies on `Nav.tsx` being hidden at `--phone` (breakpoint #1) having already forced the `#page-top-sentinel` workaround in `App.tsx`, so the button behaves correctly on mobile specifically (its primary use case: scrolling the dance-schedule grid). | Same button/behavior; the workaround just matters less here since `Nav` is visible and would have worked as the intersection target anyway. |

[PostCSS Custom Media]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-custom-media

## Open questions

None currently — the one open question this doc previously tracked (whether
to extract a shared breakpoint token) is resolved above.
