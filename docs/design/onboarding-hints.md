# Onboarding hints (kebab-menu and level-slider discoverability)

## Context

Reported: new users might not notice `PageMenu.tsx`'s mobile "⋮" kebab
button at all — it was a bare icon with no visible text, only an
`aria-label` for screen readers, a well-known discoverability failure mode
for overflow menus in general and a real risk for this app's stated
audience (older users who may be less familiar with icon-only mobile UI
conventions — see `docs/design/text-size-preference.md`'s own Context for
the same audience concern). Two related asks: make the menu itself more
visible permanently, and show a temporary callout during a new user's first
few visits pointing at it. A broader "general help overlay/walkthrough"
idea was also raised; deliberately scoped down for now — see Open
questions.

## Sub-problems

- [x] Permanent discoverability fix — see "Visible 'Menu' label added, then
      removed in favor of a hamburger icon"
- [x] How to persist "how many times has this app been launched" — see
      "`useAppLaunchCount`: a global, once-per-page-load counter"
- [x] Reusable logic for "should THIS hint show right now" — see
      "`useFirstLaunchHint`: the reusable eligibility hook"
- [x] Presentation (the actual callout UI) — see "`HintBalloon`: the
      presentational half"
- [x] When the hint should dismiss — see "Dismissal: explicit only, three triggers"
- [ ] Whether to build a general multi-step walkthrough/tour engine — see
      Open questions (deliberately deferred, not decided against forever)
- [x] A second, genuinely different hint (the level slider) — see
      "`level-slider`: a second hint, and generalizing `HintBalloon`'s
      placement"
- [x] Tuning the level-slider balloon's own position/reading order once the
      ring grew wider — see "Center-placement tuning: clearing the wider
      ring, tip-left reading order"
- [x] Dimming the rest of the screen while a hint is showing — see
      "Screen-dimming `.backdrop`"
- [x] Keeping `RotateDeviceBanner` from colliding with a hint balloon — see
      "`RotateDeviceBanner` suppression, and `useFirstLaunchHint` going live
      across components"
- [x] Repositioning the kebab-menu balloon beside its icon, and enlarging
      both arrows — see "'end' placement moves beside the toggle; both
      arrows enlarged"
- [x] Replacing the CSS-triangle pointers with real, floating, angled arrow
      glyphs — see "Pointers become actual arrow glyphs: floating, angled,
      detached from the bubble"
- [x] Giving the arrows a solid, filled, pointed head and making both ends
      touch something real — see "Filled arrowheads, and both ends touching
      by construction"
- [x] Rebuilding the arrows around real, undistorted rotation — curved-base
      arrowhead, embedded tail, bolder shaft, and fixing a real bug where
      'center's touch point overshot the ring — see "Undistorted rotation,
      an embedded tail, and a curved-base arrowhead"
- [x] A quick way to re-trigger both hints for testing — see "`ResetHintsLink`
      on the home page fine print"
- [x] Fixing the shaft/arrowhead connection gap and thinning the shaft — see
      "Closing the shaft/arrowhead gap, and a thinner line"
- [x] Making sure a hint's own dimming never covers the REAL controls it's
      emphasizing, including under the OTHER hint's own dimming — a much
      harder problem than it first looked, with a real bug found and fixed
      along the way — see "The dim must never cover the real controls: two
      more bugs, both found by testing with an unmissable color"
- [x] Repositioning the level-slider balloon to the target's own left edge,
      fitting its message on one line, and a persistent set of arrow design
      rules this doc now records explicitly — see "Arrow design rules
      (persistent reference)" and "'center' moves to the target's left edge,
      fits on one line"
- [x] Correcting 'center's own arrow direction (it was backwards) and a
      real overflow bug found while fixing it — see "Two more corrections:
      arrow direction, and a real overflow bug"
- [x] A second, lighter weight/size reduction on both arrows, plus
      formalizing the "always reads left to right" and "tip tolerance"
      rules — see "Arrow design rules (persistent reference)" (updated) and
      "A second weight reduction, and formalizing the reading-order and
      tip-tolerance rules"
- [x] A genuinely viewport-relative margin for 'center' (not just relative
      to `.levelField`'s own, itself-variable, edge), and fixing a real
      OVERLAP bug that left `'center'`'s arrow with neither end actually
      to spec — see "'center' anchors to the true viewport edge, and a
      real OVERLAP bug fixed at both ends"
- [x] The very first tap anywhere, while a hint is showing, should dismiss
      it WITHOUT also triggering whatever it happened to land on (so a new
      user's first tap can't accidentally navigate them off the page they're
      meant to be reading) — except a tap on the hint's own real target,
      which should still do both — see "The first outside tap dismisses
      AND swallows its own click, except on the hint's own real target"

## Arrow design rules (persistent reference)
**Why this section exists:** these rules have been given, live, more than
once across this file's own history (see the "Decisions" entries below for
where each one first came from) — written down HERE, together, in one
place, specifically so they don't need re-explaining next time an arrow
changes. Treat this as the checklist to satisfy for ANY onboarding-hint
arrow, present or future, not just a record of what one specific arrow
happens to do today.

1. **Always at an angle.** Never perfectly vertical or perfectly
   horizontal — a diagonal is what makes an arrow read as "reaching
   toward" its target, not just sitting flush beside it.
2. **Always reads left to right — both the text-vs-control relationship
   AND the arrow itself.** The bubble (text) should read as coming BEFORE
   the target it's pointing at, left-to-right, the same direction English
   text itself reads — not the reverse. The arrow's own tail sits toward
   the LEFT, its tip toward the RIGHT, so tracing it also reads left to
   right, reinforcing the same direction rather than fighting it. (A hint
   whose target sits ABOVE the bubble rather than beside it still applies
   this on the horizontal axis alone: anchor the bubble/tail toward the
   target's own left side, and let the tip climb up AND right from there —
   see "'center' points up and right, not up and left" below for exactly
   this case, corrected live after an earlier version got it backwards.)
3. **A real, filled, pointed arrowhead with a CONCAVE (curved-in) back** —
   not open chevron strokes, and not a plain flat-backed triangle either.
   Drawn as a shaft plus a separate filled head; the head's own back edge
   curves TOWARD the tip (a quadratic Bézier, not a straight line between
   its two back corners).
4. **Moderate, refined line weight and arrowhead size — lighter than it
   first looks right, not heavier.** Every round of live feedback on this
   arrow's weight has asked for less, never more; when in doubt, go
   thinner/smaller rather than bolder. (Concretely, in this app:
   `stroke-width: 12.4` against this glyph's own 40-unit-tall local space,
   and the arrowhead's own height reduced to 30 of those 40 units,
   centered — both reached via two successive 25% reductions from an
   original, too-heavy first attempt.) Reducing the arrowhead/line weight
   is a purely VISUAL change — the glyph's actual REACH (how far it
   extends, tuned to touch the real target — rule 5) must stay whatever
   the real geometry requires; don't shrink the reach itself just because
   the weight is shrinking, or the tip will fall short.
5. **Both ends must connect to something REAL, not float freely:**
   - The **tail** must be genuinely INVISIBLE, sunk behind (not just
     touching the edge of) the bubble it emanates from — ideally reaching
     under the actual TEXT block, not just the bubble's own background, so
     there's no visible flat/square cap anywhere, under any rendering
     condition.
   - The **tip** must reach the real target — confirmed via
     `getBoundingClientRect()` measurement on the live page, not eyeballed.
     Landing a FEW PX PAST the target's own edge is fine (and safer than
     cutting it exactly at the boundary); falling short (not reaching it
     at all) is not. The tip must never extend back INTO the bubble's own
     box, though — that direction has no acceptable margin at all.
6. **Undistorted rotation only.** The glyph keeps its own true aspect ratio
   at every size — `height` is always computed FROM `width` (or vice
   versa) using the glyph's fixed ratio, never chosen independently — so
   `rotate()` only ever turns it, never stretches or skews it.
7. **Anchor the tail as a PERCENTAGE of the bubble's own width, not a fixed
   pixel value** — so the geometry keeps making sense if the bubble's own
   width ever changes (as it did in this app once already). As a starting
   point/guideline: keep the anchor roughly within the middle half of the
   bubble's width (~25%–75% from either edge) — close enough to center to
   avoid looking like it's hugging one edge, without necessarily being
   exactly centered (there should almost always be SOME lean — see rule 1).
8. **The bubble's own placement needs a minimum buffer from the actual
   browser window edge — measured against the TRUE viewport edge, not
   against a nearby ancestor's edge that might itself drift.** Never let it
   sit close enough to the true viewport edge to feel cramped, even when
   it's deliberately anchored near one edge of its target rather than
   centered on it. Anchor the bubble's own EDGE (not its center) to the
   target when there's any doubt — centering on a point can push half the
   bubble off-screen if the bubble is wide or the target sits close to the
   real window edge; see "Two more corrections: arrow direction, and a real
   overflow bug" below for exactly this failure mode. If the bubble's
   nearest positioned ancestor isn't reliably close to the real viewport
   edge itself (e.g. it's centered within a wider row, so ITS OWN position
   drifts with content), anchoring N px off of that ancestor's edge doesn't
   actually bound the bubble's distance from the true window edge — anchor
   to the ancestor's CENTER instead (via `left: 50%` plus a `translateX`
   using `vw`, an absolute unit independent of any ancestor) if that center
   reliably tracks the viewport's own center; see "'center' anchors to the
   true viewport edge" below for a worked example. (Small caveat: `vw`
   includes the scrollbar gutter on some desktop browsers while `%`-based
   layout doesn't, so this technique's real margin can be off by roughly
   half a scrollbar's width there — not an issue on mobile's overlay
   scrollbars, this app's primary target.)
9. **Prefer fitting the message on a single line** when a reasonable width
   increase makes that possible, rather than accepting a multi-line wrap by
   default.

## Decisions

### Visible "Menu" label added, then removed in favor of a hamburger icon
**Why:** The permanent, everyone-benefits fix, independent of anything
else in this doc. First attempt: kept the existing "⋮" kebab icon and added
a visible `<span>` reading "Menu" next to it (`PageMenu.module.css`'s
`.toggle` as `display: flex`), removing the old `aria-label="Menu"` as
redundant once visible text provides the same accessible name automatically.

**Revised — reported live as looking bad.** Replaced the kebab dots
outright with a hamburger ("☰", three horizontal lines) glyph instead of
adding a label to them — a far more universally recognized "menu" symbol
than a kebab, so it reads as tappable on its own without needing
accompanying text at all. `aria-label="Menu"` came back on the button
(no more visible text to derive an accessible name from), and `.toggle`
reverted to its original non-flex layout (a single icon child again, no
label to lay out alongside it).

### `useAppLaunchCount`: a global, once-per-page-load counter
**Why:** "First 3 launches" needs a persisted count of how many times the
app has actually been opened — but incrementing on every component that
might care would overcount (e.g. `PageMenu.tsx` remounts on every in-app
route change, per its own file comment, so counting ITS mounts would treat
browsing five pages in one sitting as five separate "launches"). Instead,
`src/hooks/useAppLaunchCount.ts` is called exactly once, from `App.tsx`
(which mounts once per real page load/refresh/PWA launch, never on an
in-app route change), and increments a single persisted counter
(`dance-schedule:launch-count`, unscoped — like `useTextSizePreference.ts`'s
own key, this is a property of the device/browser, not of which content
set is being viewed). The increment happens in a lazy `useState` initializer
(runs exactly once per mount), not a `useEffect` (which can double-fire in
StrictMode/dev) — this hook's own comment covers why. Other components that
need the CURRENT count (`useFirstLaunchHint.ts`) read the same storage key
directly rather than consuming this hook's return value or a Context: by
the time any descendant's own render runs, `App.tsx`'s hooks (an ancestor)
have already completed for this render pass, so the persisted value is
already up to date — no Context needed for something that only changes
once, at the very start of the session.

### `useFirstLaunchHint`: the reusable eligibility hook
**Why:** The actual "framework" half of this — deliberately just this one
hook, not a bigger engine (see Open questions for why not more). Takes a
short, stable `id` (part of its own persisted dismissed-state key,
`dance-schedule:hint-dismissed:<id>` — kept independent of the hint's
current copy, so rewording a message later doesn't reset whether someone's
already dismissed it) and an optional `maxLaunches` (default 3, overridable
per hint). Returns `{ shouldShow, dismiss }`: `shouldShow` is true while the
launch count is still within the window AND the hint hasn't been
dismissed; `dismiss()` persists the dismissal permanently — once
dismissed, a hint never reappears, regardless of remaining launches. A
future second hint calls this exact same hook with its own `id`; nothing
about it is specific to the kebab-menu case that motivated it.

### `HintBalloon`: the presentational half
**Why:** A small dismissible callout — message + an upward-pointing arrow,
dismissed by tapping anywhere outside it (see "Dismissal" below; it
originally also had its own explicit × button, removed once that outside-tap
path made it redundant) — kept deliberately UN-generalized on positioning:
`.balloon`'s own CSS bakes in `position: absolute; top: 100%; right: 0`
(sit below and flush-right of whatever it's placed inside), matching
`PageMenu.module.css`'s own `.list` dropdown anchor exactly, since that's
the one real placement this needs today. A `className`/`placement` prop
for a hypothetically different future anchor was deliberately NOT added
speculatively — a second real caller with a different need is the moment
to decide how to generalize that, not before. No animated `transform` and
no transitioned `visibility` — this session found two separate,
confirmed-on-real-hardware WebKit bugs from exactly that combination in
`Nav.module.css`'s and `PageMenu.module.css`'s own dropdowns (see
`docs/design/text-size-preference.md`'s "Dropdown show/hide" decisions);
`HintBalloon` renders/unmounts outright based on `shouldShow` rather than
toggling a CSS state on an always-mounted element, so there's no
open/close animation to get wrong in the first place.

**Sizing bug found and fixed while verifying live:** `.balloon` originally
had only a `max-width: 14rem` ceiling, no explicit `width` — confirmed live
this rendered at ~65px wide (wrapping the message almost
character-by-character), because an absolutely-positioned box with no
explicit width shrink-to-fits against its own containing block
(`.nav`, `position: relative`), and `.nav`'s own width is just wide enough
for the toggle button, not the viewport or the balloon's own preferred
content width. `PageMenu.tsx`'s real `.list` dropdown doesn't hit this
because one of ITS children (the Text-size row) happens to be wide enough
to force sensible column-flex sizing — `HintBalloon` has no such sibling to
borrow width from. Fixed with an explicit `width: 12rem` instead of
`max-width` — 320px (this app's narrowest targeted phone width, see
`docs/design/responsive-breakpoints.md`) comfortably fits 192px with room
for margins, so no additional `min(..., 100%)` clamp was needed on top.

### Dismissal: explicit only, two triggers
**Superseded in part** — the "tap anywhere else" path below still dismisses
on `pointerdown` exactly as described, but as of "The first outside tap
dismisses AND swallows its own click" (near the end of this file), that same
tap's own default action is now ALSO swallowed unless it landed on the
hint's real target. The two-trigger dismissal logic itself (tap the real
target, or tap anywhere else) is unchanged; only what ELSE happens on the
"anywhere else" tap changed.

**Why:** The hint never auto-dismisses on a timer — it stays until one of
two things happens: tap the REAL toggle it's pointing at (handled in
`PageMenu.tsx`'s `handleToggleClick`, which calls both `toggle()` and
`dismissHint()` — tapping the real menu means the hint already did its
job), or **tap anywhere else on the page**. That second path was added
after the balloon originally shipped with its own explicit × dismiss
button — reported live that only being able to dismiss via the × felt
incomplete, the same "outside click closes it" behavior this app's
dropdowns already have via `useDismissableMenu.ts`. Implemented directly
inside `HintBalloon.tsx` (a `pointerdown` listener on `document`, checking
whether the event target falls outside the balloon's own ref) rather than
reusing that hook — a hint isn't a reopenable toggle menu (no
`isOpen`/Escape-to-refocus behavior needed; once dismissed, it never
reappears), so `useDismissableMenu`'s shape doesn't fit. Once the
outside-tap path existed, the × button was redundant (any tap not on the
real toggle already counted as "outside" and dismissed it) — removed
rather than kept as a second way to do the same thing. Both remaining
paths persist the same dismissed flag, so either one permanently retires
the hint; triggering both for the same tap (the real toggle counts as
"outside" too) is harmless since dismissal is idempotent.

### A dashed ring around the real toggle, extra reinforcement alongside the balloon
**Why:** The balloon points an arrow at the toggle, but on a small icon that
alone can still be easy to skim past. `PageMenu.tsx` passes `showHint` down
to the toggle `<button>` itself as `data-hint-visible`, and
`PageMenu.module.css`'s `.toggle[data-hint-visible='true']` rule adds a
dashed `outline` (not `border` — outline doesn't take up layout space, so
the icon doesn't shift when the ring appears/disappears) with
`outline-offset` opening a visible gap around the button rather than
hugging it flush, plus `border-radius: 50%` **only** in this state so the
ring reads as a circle around the icon rather than following the button's
own default 4px rounded-square shape. Static, not animated (e.g. a pulse) —
consistent with this app's general avoidance of animated dropdown/toggle
states after the repeated real-device WebKit bugs already documented
elsewhere in this codebase (`Nav.module.css`'s/`PageMenu.module.css`'s own
`.list` comments). Driven by the same `showHint` the balloon itself uses, so
the two always appear and disappear together with no separate state to keep
in sync.

### `level-slider`: a second hint, and generalizing `HintBalloon`'s placement
**Why:** New users weren't necessarily missing the level slider
(`DanceScheduleFilters.tsx`) itself so much as its purpose — reported as a
real risk that someone would notice the control but not realize dragging or
tapping it filters which levels' sessions show. Reuses
`useFirstLaunchHint('level-slider')` unchanged (its own `id` is independent
of the kebab-menu one, so dismissing either has no effect on the other) —
called once, inside `DanceScheduleFilters.tsx` itself rather than in each of
the three pages that render it (`DanceSchedulePage`, `DanceScheduleLevelsPage`
"Room Schedule", `DanceScheduleCallersPage` "Caller Schedule" — all three
share this one component, see `danceSchedulePageFilterContract.tsx`), so
seeing/dismissing the hint on whichever of the three a new user visits first
retires it on the other two as well, with no per-page wiring needed.
Dismisses on either of the two interactions its own copy ("Tap or drag to
filter dance levels") names — a tick `onClick` or the slider's
`onValueChange` — mirroring `PageMenu.tsx`'s `handleToggleClick` (using the
real control means the hint did its job), on top of `HintBalloon`'s own
built-in outside-tap dismissal.

**The ring encloses the whole field — tick labels included, not just
`Slider.Root`.** An earlier version targeted `Slider.Root` alone, on the
reasoning that the tick labels above it were secondary. Revised, live: the
ticks are real `<button>`s (`DanceScheduleFilters.tsx`), and — being much
bigger tap targets than the thumbs — are actually the EASIER of the two
interactions the hint's own copy names, not a lesser one; a ring that
stopped at the track undersold that they work too. The ring now wraps
`.levelField` as a whole (ticks + track + thumbs together).

**Implemented as a dedicated overlay `<span className={styles.hintRing}>`
with an explicit `inset`, not `PageMenu`'s own `outline`/`outline-offset`
technique (which the `Slider.Root`-only first version of this ring did
reuse).** `outline-offset` is a single value applied to all four sides
equally — fine for `PageMenu`'s roughly-square target, but this ring needed
asymmetric spacing: wider on the left/right (per direct product decision)
than top/bottom, where `.dateGcaRow` sits close above and the schedule grid
close below, leaving less room to push out without crowding them.
`inset: -8px -16px` (CSS's vertical/horizontal shorthand) expresses that
directly. Still needs no fixed pixel width despite `.levelField`'s own width
genuinely varying (present-level count, viewport, and text size all feed
into `maxLevelFieldWidthPx`, `DanceScheduleFilters.tsx`) — `inset` values on
an absolutely-positioned overlay are offsets from its nearest
`position: relative` ancestor's own edges (`.levelField` itself), so they
resolve correctly whatever that width turns out to be, the same "don't need
to know the real pixel width up front" property `outline` has, applied via a
different mechanism. `border-radius: 999px` still rounds a wide, short box
fully at each end into the stadium/"hot dog" shape. `pointer-events: none` —
purely decorative, must never steal a tap meant for the ticks/thumbs
beneath it. Rendered/unmounted outright alongside `showLevelHint`, not
toggled by a CSS class on an always-mounted element — same "no open/close
animation to get wrong in the first place" reasoning as `HintBalloon.tsx`'s
own comment.

**`HintBalloon` gained a `placement` prop (`'end' | 'center'`, default
`'end'`)** — the "second caller with a genuinely different placement need"
its own original comment predicted would be the point to generalize, rather
than doing so speculatively. The kebab toggle is small and right-aligned
within its row, so `HintBalloon`'s original `right: 0` anchor fit it
exactly; the level slider is centered within its own row and (per the width
discussion above) resizes, so a fixed right edge would drift off from its
actual visual center depending on how wide it rendered. `placement="center"`
switches the balloon itself to `left: 50%; transform: translateX(-50%)`
instead — centering on the anchor's own rendered center needs no more
knowledge of its actual width than the hint ring above does, for the
identical reason. (The pointer/tip's own position under `center` was revised
again shortly after — see the next section.) Only the horizontal anchor
varies by placement — `top: 100%` (sit below the target) stayed
unconditional, since both hints want that.

### Center-placement tuning: clearing the wider ring, tip-left reading order
**Why:** Two follow-up reports once the wider `.hintRing` (above) was live.
First: the pointer's tip was landing INSIDE the ring's own dashed boundary
instead of clearly outside it — the base `margin-top: var(--space-sm)`
(0.5rem/8px) was tuned back when this placement's only ring was
`PageMenu`'s tiny 1px `outline-offset`; `.hintRing`'s much bigger 8px
vertical `inset` meant the tip (`margin-top` minus the pointer's own 6px)
landed a couple px UNDER the ring's own bottom edge, not clear of it.
Fixed by giving `.balloon[data-placement='center']` its own bigger
`margin-top: 1.25rem`, confirmed live to leave a clean gap between the two.
Second, unrelated to the collision: per direct product decision, the tip
should sit toward the balloon's own LEFT edge rather than centered, so the
whole thing reads left-to-right — the eye lands on the tip first, then the
message starts right there, rather than a centered tip pointing outward in
both directions with the text an equal reach from either side.
`.pointer[data-placement='center']` moved from `left: 50%; transform:
translateX(-50%)` to a plain `left: 16px` (mirroring the base/`'end'`
variant's own `right: 16px`, just mirrored to the other edge), and
`.balloon[data-placement='center'] .message` picked up `text-align: left`
to match (previously inheriting the shared, centered `.message` rule) — the
tip alone moving left without the text following it would have undercut the
same reading-order goal. Net effect: the balloon itself stays horizontally
centered on `.levelField` (unchanged from the previous section), but the tip
inside it no longer points at the field's exact center — an accepted
trade-off, since the reading-order win was the explicit ask, not
pixel-precise pointing.

### Screen-dimming `.backdrop`
**Why:** Per direct product decision — dim everything else while a hint is
showing, so the balloon and whatever ring/outline its caller draws around
the real target read as the one thing to look at. Added inside
`HintBalloon.tsx` itself (a `position: fixed; inset: 0` `<div>` rendered as
a sibling of `.balloon`), not wired up separately by each caller — since
both hints already render `<HintBalloon>` exactly when they want this
effect, this makes dimming automatic for the current two callers and any
future one, with no per-caller opt-in. `pointer-events: none` — the backdrop
must never intercept a tap meant for the real target underneath it (tapping
it is how both hints expect to be dismissed, per "Dismissal" above) or the
document-level outside-tap listener. `z-index: 19`, just under `PageMenu`'s
own dropdown (`20`) and `.balloon` itself (`21`) — everything else in this
app sits well below that, so this reads as "in front of the page, behind
the hint UI." Confirmed this same ordering needed restating on the actual
highlighted targets, since a plain semi-transparent overlay would otherwise
dim them too, right along with the rest of the page: `PageMenu.module.css`'s
`.toggle[data-hint-visible='true']` picked up `position: relative; z-index:
21` (elevating the real button, since there's no separate decorative ring
element there to elevate instead), and `DanceScheduleFilters.module.css`'s
`.hintRing` picked up `z-index: 21` (elevating just the decorative ring,
deliberately NOT `.levelField` itself — see that rule's own comment for why
stopping at the ring, and leaving the real ticks/track/thumbs dimmed like
the rest of the page, was the simpler and more robust choice over a true
"spotlight cutout"). Each `<HintBalloon>` renders its OWN backdrop rather
than sharing one global instance — on a genuinely fresh device, both hints
can be showing at once (confirmed live — see the next section), briefly
stacking two dims into a slightly darker one; accepted as a minor,
first-launch-only cosmetic edge case rather than adding a shared singleton
just to avoid it.

### `RotateDeviceBanner` suppression, and `useFirstLaunchHint` going live across components
**Why:** Confirmed live on a genuinely fresh device: `RotateDeviceBanner`
(shown on the three dance-schedule pages below `PageHeader`) and the
kebab-menu hint balloon (anchored to that same header's toggle) can both be
visible at once and visually collide. `RotateDeviceBanner.tsx` now also
calls `useFirstLaunchHint('kebab-menu')` and `useFirstLaunchHint(
'level-slider')` itself (read-only — it never calls either `dismiss()`) and
renders nothing while either `shouldShow`s, on top of its own existing
portrait-and-not-dismissed check. Hardcodes both ids directly rather than a
registry other hints register into — there are exactly two hints in the app
today; revisit if a third one also needs to suppress this banner.

**This is also what pushed `useFirstLaunchHint.ts` itself from a private
`useState` to a `useSyncExternalStore` subscription.** Before this,
`dismissed` was seeded once, at mount, from storage — fine as long as
exactly one component both owned (called `dismiss()`) and read a given
hint's state, which was true of every caller up to this point. This is now
a genuinely different case: `RotateDeviceBanner` is a THIRD, read-only
consumer of state that a DIFFERENT component (`PageMenu.tsx` or
`DanceScheduleFilters.tsx`) owns and mutates — with the old private
`useState`, `RotateDeviceBanner`'s own copy would never learn about a
dismissal that happened elsewhere, staying suppressed for the rest of that
page session even after the real hint was long gone. `useFirstLaunchHint.ts`
now keeps a module-level, per-id set of subscriber callbacks; `dismiss()`
writes to storage and then notifies every subscriber watching that same id,
and every `useFirstLaunchHint(id)` call site (however many there are)
re-renders with the fresh value via `useSyncExternalStore`, not just the one
that called `dismiss()`. Confirmed live: dismissing both hints (e.g. by
tapping anywhere outside them) makes `RotateDeviceBanner` reappear
immediately, with no remount or extra plumbing needed.

### 'end' placement moves beside the toggle; both arrows enlarged
**Why:** Per direct product decision, confirmed live: the kebab-menu
balloon's original "below and flush-right" position (`top: 100%; right: 0`
— see "`HintBalloon`: the presentational half" above) read as floating
roughly mid-page rather than clearly attached to the toggle specifically,
especially once the level-slider hint (much lower on the page) could also
be showing at the same time. `.balloon[data-placement='end']` now sits
BESIDE the toggle instead — `right: 100%` (flush with `.nav`'s own left
edge, `.nav` being sized just to the toggle button) with `margin-right` for
the gap, and `top: 50%; transform: translateY(-50%)` to vertically center
against the toggle rather than starting below it — putting this hint in the
very top row of the page, immediately next to the icon it's about, as close
as it can physically get. The arrow direction changed to match: right-
pointing (▶, same border-technique as `DanceScheduleFilters.module.css`'s
own `.sliderThumbMin`) instead of upward-pointing, since the balloon is now
to the LEFT of its target instead of below it.

**Title-overlap fix: `width: 9rem`, down from the shared 12rem, for `'end'`
only.** `PageHeader.module.css`'s row is `justify-content: space-between`
between the page's own `<h1>` title and `PageMenu` — the repositioned
balloon now shares that row, and at the base 12rem width it reached far
enough left to visibly cover part of a real title ("Dance Schedule,"
confirmed live). A fixed width can't rule out overlap for every possible
title (titles are arbitrary-length content — `RawDanceScheduleDebugPage.tsx`
alone has a notably long one), but 9rem clears the common case while still
fitting "Tap here for menu" without awkward mid-word wrapping.

**Both arrows grew from 6px to 10px (the CSS triangle's own border-width),
regardless of placement.** Per direct product decision — a bigger, more
clearly "pointing" arrow reads more immediately as attached to a specific
target at a glance, independent of the 'end'-specific direction change
above; `.center`'s own upward-pointing arrow (the level-slider hint) grew by
the same amount for visual consistency between the two hints, not because
it had a functional problem of its own.

**Restructured the CSS itself: `.balloon`/`.pointer` now hold only shared
box styling, with EACH placement (`'end'` and `'center'`) defining its own
complete `top`/`right`/`left`/`margin`/`transform` set, rather than one
being "the base" the other overrides a few properties on top of.** The
previous shape (`'end'` as the implicit base, `'center'` overriding
`right`/`left`/`transform`) worked while the two variants only differed on
ONE axis (horizontal anchor, both still "below, pointing up"). Once `'end'`
needed a genuinely different anchor SIDE and arrow direction, layering
overrides on a differently-shaped base stopped being the simpler option —
two self-contained variants are easier to read correctly than reasoning
through which base properties a given override does and doesn't touch.

### Pointers become actual arrow glyphs: floating, angled, detached from the bubble
**Why:** A round of pure visual/design-language feedback, per direct
product decision, on top of the structural `'end'` reposition above.
`HintBalloon.tsx`'s `.pointer` was a solid CSS-border triangle (a 0×0 box
with one colored border side, the classic "CSS triangle" trick, also used
elsewhere in this codebase for `DanceScheduleFilters.module.css`'s slider
thumbs) touching the balloon's own edge — a filled wedge shape, not
something that reads as an "arrow" the way a shaft-plus-head glyph does.
Replaced with an inline `<svg>` (same convention as this app's other icons —
`PageMenu.tsx`'s hamburger, `RotateDeviceBanner.tsx`'s rotate glyph): a
single `stroke="currentColor"` path drawing a shaft with an open chevron
head, `color: var(--color-accent)` set on `.pointer` itself (not inherited
from `.balloon`'s own white text color). Drawn pointing right by default;
each `[data-placement]` variant supplies only its own position AND a CSS
`rotate()` — 'end' at `-25deg` (tilts the rightward glyph up, from the
balloon toward the icon above it), 'center' at `-60deg` (closer to vertical,
from the balloon up toward the ring, with a rightward lean toward its true
center) — rather than two entirely separate hardcoded shapes.

**Floats with a real gap on both ends, rather than touching the balloon.**
Both `.balloon[data-placement='end']`'s `margin-right` and
`.balloon[data-placement='center']`'s `margin-top` grew (to `2rem` each) to
open enough room for the arrow to sit somewhere in the MIDDLE of that gap —
`right: -34px` / `top: -34px` respectively — with visible clearance on both
sides: between the balloon and the arrow, and between the arrow and the
real target (icon / ring). The old triangle's base always touched the
balloon's own edge directly; this is the part of the change that makes the
arrow read as its own distinct, "pointing at something" element instead of
a decorative tail fused to the bubble.

**The `'end'` balloon itself also nudged down, off dead-center on the
icon.** Before this round it was `top: 50%; transform: translateY(-50%)` —
exactly centered on the toggle. An arrow between two things sitting on the
exact same horizontal line has nowhere to angle: it can only point
perfectly sideways. Changing to `translateY(-30%)` puts the balloon
slightly below the icon's own center, which is what actually gives the
`-25deg` rotation above something real to connect — per direct product
decision, arrows in this UI should always run at a diagonal, not straight
up or sideways, to more strongly read as "reaching toward" their target
rather than just sitting flush next to it.

**Confirmed live it's fine for the repositioned `'end'` balloon to overlap
the page title on a long one ("Dance Schedule").** An earlier version of
this same reposition (see "'end' placement moves beside the toggle" above)
had shrunk the balloon to `9rem` specifically to dodge that overlap;
reverted back to the shared `12rem` width once told the overlap itself was
an acceptable trade-off, not something worth a narrower/more cramped
balloon to avoid.

### Filled arrowheads, and both ends touching by construction
**Why:** A further round of live visual feedback on the arrow glyphs above,
per direct product decision, on two points: the shaft-plus-open-chevron
glyph still read as "just lines," not a proper pointed arrowHEAD; and the
previous round's floating position (`right: -34px` / `top: -34px` — round
numbers picked by eye, not derived from anything) didn't actually land
precisely on either the balloon's own edge or the real target's edge, just
somewhere in the visual neighborhood of both.

**The glyph itself: one diagonal path, drawn once, from a shared SVG's own
bottom-left corner to its own top-right corner — a thick round-capped shaft
plus a solid FILLED triangular `<path>` (not a stroked chevron) for the
head.** `preserveAspectRatio="none"` is what makes the second fix (below)
possible: a single fixed path can be stretched, non-uniformly, into
whatever box each `[data-placement]` variant supplies, rather than needing
a separately hand-drawn glyph per placement.

**Both ends now touch something real BY CONSTRUCTION, not by an eyeballed
offset.** For `'end'`: `.pointer[data-placement='end']` is `left: 100%`
(its own left edge exactly flush with the balloon's right edge — the
`.balloon[data-placement='end']` this box is a child of) and `width: 2rem`,
the SAME value as that balloon's own `margin-right`. Since `margin-right`
IS the real gap between the balloon and the toggle icon, a box that starts
flush at the balloon's edge and is EXACTLY that gap wide necessarily ends
flush at the icon's edge too — both ends touch without needing to know or
guess any absolute pixel position. `'center'` mirrors this vertically:
`bottom: 100%` (flush with the balloon's own top edge) and `height: 2rem`,
matching `.balloon[data-placement='center']`'s own `margin-top` (the real
gap up to `.hintRing`). The one dimension NOT derived this way for each —
`'end'`'s `height: 18px`, `'center'`'s `width: 18px` — is purely how
thick/emphasized the glyph itself reads, with no real edge on that axis to
match; positioned centered-ish (`'end'`: vertically centered on the
balloon via `top: 50%; translateY(-50%)`; `'center'`: `left: 16px`, keeping
the same near-left-edge anchor `'center'` has had since the "reads
left-to-right" work) rather than derived from a calculation.
`rotate()`-based positioning (the previous round's approach) was dropped
entirely for both — getting a ROTATED glyph's two ends to land on two
specific real points at once needs real trigonometry against exact pixel
values (the rotation angle and the glyph's own rendered length both have to
be computed together); stretching a fixed diagonal into a box whose OWN
size already equals the real gap sidesteps that math completely.

### Undistorted rotation, an embedded tail, and a curved-base arrowhead
**Why:** Direct product feedback that the `preserveAspectRatio="none"`
stretch above, while precise about WHERE both ends landed, looked
"primitive" — a stretched shaft doesn't read as a clean, deliberate line
weight (its own stroke gets thinner or thicker depending on how much a
given placement's box happens to stretch it), and the open-chevron head
still didn't read as a proper arrowHEAD. Four specific asks, addressed
together since they interact: a real filled/pointed head with a curved
(concave) base; a bolder shaft; the tail reading as fully embedded in the
balloon rather than a rounded cap "barely touching" it; and — the hard
constraint tying the rest together — no distortion from rotating.

**Went back to real trigonometry, this time computed and then VERIFIED via
`getBoundingClientRect()` on the actual rendered elements, not eyeballed.**
The glyph is drawn once, always at its own fixed 100:40 viewBox aspect
ratio; every `[data-placement]` variant computes a `width` and a `height`
that are ALWAYS in that same 2.5:1 ratio (height = width ÷ 2.5, not an
independent number) — so `rotate()` only ever turns the glyph, never skews
it, satisfying "must not distort" by construction rather than by hoping the
rounding stays small. The actual computation for each variant: a target
`(dx, dy)` — the real distance from the balloon's true touching point to
the real target — gives `angle = -atan2(dy, dx)` and `reach = √(dx² + dy²)`;
`OVERLAP` (10px, chosen so the tail is unambiguously behind the balloon's
own edge, not just at it) is added to `reach` for the final `width`, and
subtracted from the STARTING position via the SAME axis the glyph's own
local x-axis represents (see the `'center'` bug below for why that axis
specifically matters) — landing the tail 10px inside the balloon rather
than exactly at its edge.

**A real bug, caught by measurement, not by eye: `'center'`'s OVERLAP shift
went through `top` instead of `left`.** `top` is the box's THICKNESS axis
for this glyph (it controls how tall/emphasized the arrow reads, unrelated
to its reach), not its reach axis (`left`/`width`, the glyph's own local
x — always the reach axis, REGARDLESS of what rotation angle later gets
applied to the whole box, since rotation happens after layout positioning
and local axes are just screen axes prior to that). Shifting via `top`
moved the pivot toward the balloon without correspondingly extending the
glyph's own reach to compensate, which `getBoundingClientRect()` on the
live page showed landing the tip PAST `.hintRing`'s own boundary rather
than on it. A second, compounding error in the same rule: the target `dy`
had been set to this balloon's bare `margin-top` (32px) — but `.hintRing`
extends 8px OUTWARD past `.levelField`'s own edge on its own `inset`
(DanceScheduleFilters.module.css), so the real gap up to the RING's own
visible boundary is 24px, not 32px. Both fixed together — `left`-axis
overlap, `dy: 24` — and reverified the same way: computing the expected
tip position from the corrected numbers landed it comfortably inside the
ring's own rendered boundary on both axes, not past it.

**The arrowhead: a filled `<path>` with a quadratic Bézier for its back
edge, curving toward the tip (concave) instead of a straight line between
its two back corners** — the standard "pointy arrow" silhouette, not the
plain filled triangle from the previous round. **The tail: drawn to
overlap 10px INTO the balloon rather than stopping exactly at its edge** —
since `var(--color-accent)` is both the arrow's own fill/stroke color AND
`.balloon`'s own background, that overlap is invisible (same solid color
painting over itself), so the visible portion of the shaft simply appears
to emerge already-in-progress from inside the bubble, with no cap of any
shape (round or otherwise) ever visible at all. **The shaft: `stroke-width`
roughly doubled** (16 → 22, in the glyph's own 40-unit-tall local space),
and the arrowhead's own base widened to the glyph's full height — both
purely a boldness/emphasis change, not tied to any positioning math.

### `ResetHintsLink` on the home page fine print
**Why:** All of this round's tuning needed repeatedly clearing
`dance-schedule:launch-count` and both `dance-schedule:hint-dismissed:*`
keys by hand in devtools, then reloading, just to see a hint again — a real
enough friction during active design work to be worth a one-click fix.
`src/components/ResetHintsLink.tsx` hardcodes the same two hint ids
`RotateDeviceBanner.tsx` already hardcodes (see its own comment — there are
exactly two hints in this app today) and clears `launch-count` alongside
them, then calls `window.location.reload()` — a REAL reload, not a
client-side route change, since `useAppLaunchCount.ts`'s own increment only
runs once, in a lazy `useState` initializer at mount; a route change alone
wouldn't re-run it. Wired in via `BuildInfo.tsx`'s existing `extraLinks`
pattern (which already folds "Raw data" in before "All events" on Home
only) — added a symmetric `extraLinksAfter` prop for content that belongs
AFTER "All events" instead, and `App.tsx`'s `HomeBuildInfo` passes
`<ResetHintsLink />` through it. Home-only, like "Raw data" — a pointless,
confusing addition on the debug page, which also renders this same
`BuildInfo` component.

### Closing the shaft/arrowhead gap, and a thinner line
**Why:** Direct product feedback, live: the shaft and the concave
arrowhead weren't reading as one connected shape, and the shaft was too
heavy. The gap turned out to be a real geometry miscalculation, not just a
matter of taste: the arrowhead's path (`M50 0Q66 20 50 40L100 20Z`) draws
its back edge as a quadratic curve from `(50,0)` to `(50,40)` via control
point `(66,20)` — at the curve's own vertical center (`y=20`, exactly where
the shaft travels), the curve's actual X position is `50 + 32·t·(1−t)`
(from expanding the quadratic Bézier formula), which peaks at `t=0.5`,
giving `x=58` — NOT `x=50`. The shaft, ending at `x=55` (a value that
matched the nominal `x=50` back-corner plus a small margin, but not the
curve's own real excursion), fell 3 units short of where the arrowhead's
fill actually begins at that height, leaving a visible gap right at the
seam. Extending the shaft to `H62` clears it with room to spare.
`stroke-width` dropped from 22 to 16.5 (75% of the previous value, the
specific ratio asked for).

### The dim must never cover the real controls: two more bugs, both found by testing with an unmissable color
**Why:** Direct product feedback that the box-shadow spotlight technique
(see "Screen-dimming `.backdrop`" above) still, in practice, greyed out the
exact controls it was supposed to be emphasizing — reported as "the most
important, and the hardest" issue in this whole file. It took two rounds of
real bugs, both only fully exposed by swapping the real `rgb(0 0 0 / 50%)`
shadow for a deliberately garish, fully OPAQUE test color (`red`) via
`element.style.boxShadow` in devtools — a semi-transparent dim is subtle
enough that a bug reads as "looks a little grey," easy to dismiss as
expected; solid red made a real coverage bug impossible to miss or
rationalize away.

**Bug 1 — same-z-index ties, but now between the TWO HINTS' own protective
elements, not just against ordinary page content.** `PageMenu.module.css`'s
`.toggle[data-hint-visible]` and `DanceScheduleFilters.module.css`'s
`.hintRing` were both elevated to `z-index: 21` (see "Screen-dimming
`.backdrop`"), matching EACH OTHER — and on a genuinely fresh device, both
hints can show at once. Confirmed live: `.hintRing` (which always renders
LATER in the document than `PageMenu.tsx`'s own header, since
`DanceScheduleFilters` sits lower on the page) won that tie and visibly
dimmed the kebab-menu balloon AND the toggle icon underneath it —
same-z-index ties resolve in the later element's favor, full stop, with no
regard for which hint "owns" which shadow. Fixed by giving `HintBalloon.module.css`'s
`.balloon` and `PageMenu.module.css`'s `.toggle[data-hint-visible]` a
strictly higher `z-index: 22` — a strictly higher value always wins,
regardless of document order, so this doesn't depend on (or need to
reason about) which hint happens to render first. `.hintRing` itself
stayed at 21 — it already wins its own tie against the EARLIER-rendered
menu hint's shadow without help; see its own updated comment for the
asymmetry.

**Bug 2 — `z-index: 22` alone did not actually fix it, revealing a deeper
misunderstanding.** Even after Bug 1's fix, the toggle icon still looked
grey under the level-slider hint's shadow. The reason: `.toggle`'s own
`background` was `none` (transparent) — z-index only controls PAINT ORDER,
it says nothing about opacity. A transparent element painted at a numerically
higher z-index is still a no-op paint operation; whatever was painted
BELOW it (the lower shadow) remains exactly as visible as before. Elevation
only helps an element that has something OPAQUE to show at that elevated
level. Fixed with `background: #fff` alongside the z-index bump, on
`.toggle[data-hint-visible]`.

**The identical bug independently on the slider side, plus a THIRD bug this
time discovered before shipping it (elevating the wrong element).** The
first attempt at the slider-side fix elevated `.levelField` itself (both
`z-index` and `background: #fff`), reasoning it needed to protect its real
children (`.tick` is `background: none`, `.sliderRoot` has no background of
its own either) the same way `.toggle` did. Confirmed live, with the same
opaque-red test, that this made things WORSE, not better: giving
`.levelField` its own `z-index` turns it into a stacking context that
CONTAINS `.hintRing` — meaning `.hintRing`'s own shadow gets carried along
as part of that ONE elevated unit when compared against the rest of the
page. Since `.levelField` was elevated to the SAME `z-index: 22` as
`.toggle`, and `DanceScheduleFilters.tsx` always renders LATER in the
document, the tie (now one level up) resolved in `.levelField`'s — and
therefore `.hintRing`'s shadow's — favor, blotting the toggle out
completely rather than just tinting it. This is Bug 1, recreated one level
higher, by the very fix meant to prevent something like it.

The actual fix: elevate `.ticks` and `.sliderRoot` directly, as their OWN
independent stacking contexts (both already `position: relative`
unconditionally), NOT via a shared elevated parent — this protects the
real controls without dragging `.hintRing`'s shadow along with them.
`.hintRing` stays at its own unelevated `z-index: 21`, comparing normally
against the rest of the page exactly as it always has.

**The general lesson, worth restating because it's easy to re-break:**
protecting an element from a competing shadow needs BOTH an opaque
background AND a higher z-index than that shadow — z-index alone only
reorders transparent no-ops; opacity alone (without elevation) still paints
BELOW a higher shadow. And elevating a whole subtree to "protect" its
transparent children can backfire if that subtree also contains something
that itself casts a competing shadow — elevate the specific real content,
not a shared ancestor, when the two might not travel together safely.

### 'center' moves to the target's left edge, fits on one line
**Why:** Direct product feedback, live, applying most of the "Arrow design
rules" section above to the level-slider hint specifically.

**Balloon repositioned:** `.balloon[data-placement='center']` moved from
`left: 50%` (centered on `.levelField`) to `left: 1rem` — its own
horizontal CENTER now aligns with the target's own LEFT edge, plus a fixed
16px nudge so it doesn't sit flush against the actual browser window's own
left edge on a narrow phone (rule 7) — not a true viewport-relative clamp
(pure CSS can't express "N px from the ACTUAL screen edge" for an element
positioned relative to a arbitrarily-placed ancestor without JS
measurement), just a reasonable fixed buffer, confirmed live to leave
~54px of real clearance at this app's narrowest targeted width.

**Width grew to `16rem`** (from the shared `12rem` default) specifically so
this hint's own message ("Tap or drag to filter dance levels") fits on ONE
line (rule 8) — measured live: the text needs ~207.5px, comfortably inside
this width's own content area once `.balloon`'s padding is accounted for.

**The arrow's tail anchor became a percentage of the balloon's own width
(`left: calc(70% - 20px)`), not a fixed px value** (rule 6) — chosen so the
geometry keeps making sense if this width changes again, and landing
within the "roughly the middle half" band that rule also describes.
Because the balloon moved LEFT relative to the ring above it, the ring's
own nearest useful point now sits UP AND TO THE LEFT of that 70%-across
tail anchor, not up-and-right — the opposite lean from `'end'`'s own arrow,
and requiring a rotation past 90° (≈ `-133deg`) rather than a shallow tilt,
since the glyph's own default orientation points right. `OVERLAP` (how far
the tail sinks behind the bubble) grew from 10px to 20px specifically to
reach genuinely behind the now-centered, single-line TEXT block itself
(rule 4), not just this balloon's own background — confirmed live a
shallower overlap risked the tail's own flat-capped end poking out past
one side of the text.

**Text alignment reverted from `left` back to the shared `center` default**
— the original `text-align: left` for this placement was chosen back when
the tip sat at the balloon's own literal left edge (a since-superseded
version of this rule); with the tip no longer anchored at the literal left
edge (see the next section for exactly where it moved to, twice), and the
message fitting on one line regardless of alignment, there's no longer a
"reads toward the tip" reason to keep it off the shared default.

### Two more corrections: arrow direction, and a real overflow bug
**Why:** Direct product feedback, live, on the previous round's result:
the arrow was pointing the wrong way, its position still didn't feel
right, and — found while re-measuring to fix those — the balloon's own
new position had a genuine overflow bug on some content.

**Direction reversed:** the previous version anchored the tail at 70%
across this balloon (right-of-center) and rotated it to point UP-AND-LEFT,
reasoning (incorrectly) that `.hintRing` sat mostly to that anchor's own
left once the balloon moved toward the target's left edge. Corrected, per
direct product decision: this arrow should point up and RIGHT, matching
the reading direction of the text above it. The tail moved to the LEFT end
of the 25%–75% band instead (`left: calc(25% - 20px)`, down from `calc(70%
- 20px)`), and the rotation flipped from a near-180° `-133deg` (needed to
make a glyph that defaults to "pointing right" instead point mostly left)
to a shallow `-23.6deg` — a tilt in the same spirit, and now the same
SIGN, as `'end'`'s own `-17.35deg`, not an extreme rotation.

**The overflow bug, found while re-verifying the new position:** the
previous version of `.balloon[data-placement='center']` centered on the
target's own left edge via `left: 1rem; transform: translateX(-50%)`.
Confirmed live, on a date/level-range where `.levelField` itself renders
narrow and sits close to the real viewport edge, this pushed roughly HALF
this balloon's own box (now considerably wider than the original
12rem — see the previous section) past the true left edge of the screen —
precisely the "too close to the window margin" outcome the `1rem` nudge
was meant to prevent, just not far enough on its own. Fixed by dropping
`translateX(-50%)` entirely: this balloon's own LEFT edge (not its center)
now sits at `.levelField`'s own left edge plus that same `1rem`, extending
fully RIGHTWARD from there. This ties the balloon's own leftmost extent
directly to `.levelField`'s own position, which is ALREADY guaranteed to
stay within the viewport by its own responsive width capping
(`DanceScheduleFilters.tsx`'s `maxLevelFieldWidthPx`) — genuinely safe
regardless of how wide `.levelField` itself happens to render, at the
(accepted) cost of reading as "starts just right of the target's left
edge" rather than literally "centered on" it.

**This second change moved the tail's own absolute position by ~144px
(half the balloon's own width) to the right, which meant the arrow's own
`dx`/`dy`/angle needed a full recomputation, not just a re-sign** — the
previous round's numbers were tuned against the CENTERED version of this
balloon's position; measuring again against the new, left-edge-anchored
position (not reusing the old numbers with a flipped sign) is what the
final `dx ≈ 55px`, `angle ≈ -23.6deg` above actually reflect. Verified this
time by computing the tip's expected landing point from the CSS values
themselves and comparing against `.hintRing`'s own measured
`getBoundingClientRect()` — landed within 0.02px of the ring's own bottom
edge, not just "looked right" in a screenshot.

### A second weight reduction, and formalizing the reading-order and tip-tolerance rules
**Why:** A further round of direct product feedback, live, restating (and
in two cases, sharpening) rules this doc had already captured, plus one
genuinely new instruction: reduce the arrow's own visual weight by ANOTHER
25% on top of the previous round's reduction.

**Weight/size reduced again — `stroke-width` 16.5 → 12.4, arrowhead height
40 → 30 (both a further 75% of their previous value), for BOTH placements**
(the SVG glyph is shared — see `HintBalloon.tsx`). The arrowhead's own
back corners stayed centered on the glyph's own vertical middle (now
spanning local y: 5–35, not 0–40) precisely so the shaft/arrowhead
connection math ("Closing the shaft/arrowhead gap" above) stays valid
unchanged — that fix was about the concave curve's own X-position at the
GLYPH's vertical center, which centering preserves regardless of how tall
the arrowhead itself is.

**Deliberately did NOT shrink the `reach`/`width`/`height` CSS values (the
glyph's own rendered LENGTH) for either placement.** Those numbers are
computed from REAL geometry — the actual distance from each balloon to its
actual target — not a free stylistic size a percentage reduction can just
scale down; shrinking them without ALSO moving the tail's anchor point
closer to the target would make the tip fall short, violating "both ends
must connect" (a harder constraint than "make it smaller"). Verified live,
with the SAME `getBoundingClientRect()`-based measurement technique used
throughout this file, that both tips still land correctly after the
weight-only change — confirming the positioning math was untouched, only
the glyph's own visual heft changed.

**Two rules restated more precisely, now formalized in "Arrow design
rules" above as rules 2 and 5:** "the tip/text should always read left to
right" (both the text-vs-control relationship AND the arrow's own
direction — this is what the previous section's direction fix was already
converging on, now written down as a standing rule rather than something
to rediscover per-hint) and "landing a few px PAST the target is fine,
falling short is not, and extending back into the bubble is never
acceptable regardless" (a tolerance clarification — this app's own
`getBoundingClientRect()`-based verification had already been landing
within fractions of a pixel, well inside this tolerance, so no numeric
change was needed here, just the explicit permission written down for next
time).

### 'center' anchors to the true viewport edge, and a real OVERLAP bug fixed at both ends
**Why:** Direct product feedback, live, with an actual screenshot attached:
the level-slider balloon still didn't have a genuinely small margin from the
real browser window edge, and "both end[s] of [the] arrow[s]" still weren't
to spec.

**Balloon repositioned again — this time to the TRUE viewport edge, not
`.levelField`'s own edge.** The previous `left: 1rem` (relative to
`.levelField`, this balloon's containing block) assumed `.levelField`
itself stays close to the real window edge — false in general:
`DanceScheduleFilters.module.css`'s `.filters` centers `.levelField` via
`justify-content: center`, and `.levelField`'s own width is content-
dependent (`maxLevelFieldWidthPx`, varying by how many level slots are
present on the selected date), so its left edge drifts with both viewport
width and content. Fixed per rule 8 (updated above): `left: 50%; transform:
translateX(calc(-50vw + 16px))`. `left: 50%` (a percentage, resolved
against `.levelField`'s own width) anchors this balloon's left edge to
`.levelField`'s horizontal CENTER; `-50vw` (an absolute unit, unrelated to
any ancestor) shifts that left by exactly half the real viewport width,
landing at `.levelField`'s center minus half the viewport width — which is
close to 0 because `.filters` spans nearly the full viewport and is itself
horizontally centered on the page, so `.levelField`'s center (wherever
`justify-content: center` actually puts it) tracks the viewport's own
center regardless of `.levelField`'s width. The final `+ 16px` is then this
balloon's real, near-constant margin from the true window edge. Verified
live (`getBoundingClientRect`): landed at 16px on a scrollbar-less/mobile-
style viewport; ~8.5px on a classic-scrollbar desktop viewport (a ~7.5px
== half-scrollbar-width discrepancy between `vw` and `%`-based layout,
confirmed by comparing `window.innerWidth` against
`document.documentElement.clientWidth` — see rule 8's own caveat). Does NOT
reintroduce the earlier `translateX(-50%)` overflow bug ("Two more
corrections" above) — that version's position depended on `.levelField`'s
own WIDTH; this version's position is independent of it, tied only to a
fixed 16px offset from the real viewport edge, safe at any `.levelField`
width.

**A real OVERLAP bug, caught by the same `getScreenCTM()`-based live
measurement technique used throughout this file, applied to the rendered
arrow glyph itself (not just its CSS box): `'center'`'s pivot was never
actually shifted backward by OVERLAP — only lengthened by it.** The
previous version anchored the tail at a purely nominal point (`left: calc(
25% - 20px)`, `top: -16px` — centering the glyph's own box on that point,
not moving it anywhere) and then made the glyph OVERLAP (20px) longer
(`width: reach + OVERLAP`), expecting the extra length to bury itself
behind the balloon the way `'end'`'s `left: calc(100% - 10px)` already
does. It doesn't: with the tail pinned exactly at the nominal point and
only the tip free to move, all 20 of those extra px showed up at the TIP
instead. Measured live (`SVGPoint.matrixTransform` against each pointer's
own `getScreenCTM()`, cross-checked against `.hintRing`'s real
`getBoundingClientRect()`): the tip was landing ~20px — exactly
OVERLAP — beyond where the underlying trig actually aimed it, well inside
`.hintRing` rather than a few px past its edge (visually, overlapping the
tick labels/thumbs, which is what read as a confusing "double triangle" in
the attached screenshot); the tail sat exactly ON the balloon's own top
edge with nothing tucked behind it — a real flat `strokeLinecap="butt"` end
with no balloon background or text painted over any part of it, a small
visible square. `'end'`'s own arrow, re-measured the same way, was already
correct (tail 10px behind, tip landing at the toggle's edge within
sub-pixel rounding) — only `'center'` had this bug, since only `'center'`'s
OVERLAP was applied through a change in glyph LENGTH alone rather than
also shifting the starting position.

**Fixed by shifting the pivot itself backward, along the glyph's own
direction toward the target, by OVERLAP** — `pivot = nominal_anchor −
OVERLAP · (unit vector toward the target)` — so the tail genuinely sinks
OVERLAP px into the balloon (behind its background and centered text) while
the tip lands exactly `reach` px from the ORIGINAL nominal anchor,
unaffected by OVERLAP: the same invariant `'end'` already held. Recomputed
against the new balloon position above: nominal anchor still 25% across the
balloon; target `dx ≈ 50px` rightward, `dy ≈ 27px` upward (24px — margin-top
minus `.hintRing`'s own 8px outward inset, unchanged — plus 3px
deliberately landing past the ring's own edge, per rule 5's "never fall
short" tolerance); `reach ≈ 56.8px`; `OVERLAP` stayed 20px; glyph length
`≈ 76.8px`; `angle ≈ -28.4deg`. Verified live: tip landed within a couple px
of the intended target (inside `.hintRing`'s own boundary, not past its
ticks/thumbs), tail landed ~9.5px inside the balloon's own top edge —
comfortably behind both its background and its single-line text.

### The first outside tap dismisses AND swallows its own click, except on the hint's own real target
**Why:** Direct product feedback: on first launch, the goal is for a new
user to both notice the kebab-menu hint AND actually read the home page's
own content — but the home page has real links in it (e.g. "Installation"),
and the previous "tap anywhere else dismisses" behavior (see "Dismissal"
above) let that SAME tap's own default action go through too. A first-time
visitor whose very first tap happened to land on a link would be dismissed
AND immediately navigated away, without ever reading the page the hint was
shown on top of. The fix: that first outside tap should dismiss the hint
and be otherwise IGNORED — leaving the user exactly where they were, free
to actually tap something on purpose next.

**Needed a way to know "the hint's own real target" — a NEW required
`targetRef` prop on `HintBalloon`.** The swallow behavior above must NOT
apply to a tap on the control the hint is actually pointing at: `PageMenu.
tsx`'s `handleToggleClick` and `DanceScheduleFilters.tsx`'s tick `onClick`/
slider `onValueChange` already call the same `dismiss()` explicitly and
should still go on to perform their own real action (open the menu, move
the thumb) — using the real target IS the hint working as intended, not a
"wrong" tap to swallow. `targetRef` is `PageMenu.tsx`'s existing `toggleRef`
(from `useDismissableMenu`, already pointed at the toggle button — no new
ref needed there) and a new `levelFieldRef` on `DanceScheduleFilters.tsx`'s
`.levelField` div (the same element `.hintRing` already wraps).

**A real, confirmed-live discovery: canceling `pointerdown` does NOT
reliably suppress the browser's own follow-up `click`.** The first attempt
was `event.preventDefault()` on the SAME `pointerdown` event already used
for dismissal — reasoning from the Pointer Events spec's "compatibility
mouse events" language, which suggests a canceled `pointerdown` should
suppress the synthetic `click` that follows it. Confirmed live (and via
this component's own tests, which caught it before it shipped): this
doesn't happen in practice — the browser (and jsdom, used by this app's own
tests) still dispatches `click` afterward regardless, with
`defaultPrevented: false`. Whatever narrow cases that spec language
actually covers, an ordinary tap isn't reliably one of them.

**Fixed with a one-off, capture-phase `click` listener added directly to
`document` at the moment of the qualifying `pointerdown` — not a listener
owned by this component's own `useEffect`.** A `click` listener added the
"normal" way (inside the same effect, torn down on unmount) doesn't work
either: `onDismiss()` unmounts `HintBalloon` synchronously, before the
browser goes on to dispatch the `click` that follows this same
`pointerdown` — by then, this component instance's own listeners are
already gone. Adding the swallow listener straight to `document`, outside
any component's lifecycle, survives that unmount. Capture phase (not
bubble) is what makes `stopPropagation()` actually work here: it runs
before the event ever reaches the tapped element or any of its ancestors,
so the tapped link/button's own click handler never fires at all, not just
its default navigation. `{ once: true }` removes the listener once it
fires; a `setTimeout(..., 0)` companion removes it even if it DOESN'T fire
(the `pointerdown` turned into a scroll or drag instead of a tap) — without
that, a stale listener would sit on `document` indefinitely and incorrectly
swallow some later, unrelated click.

**A real, pre-existing test broke from this change, for the right
reason — fixed by pre-dismissing the hint, matching an established
pattern.** `ClearStorageAction.test.tsx`'s own "clicks the Clear button"
test renders a full `PageHeader` (via `ClearStorageAction.tsx`), which
includes `PageMenu`; on a fresh test device (this suite's own
`test-setup.ts` clears `localStorage` after every test) the kebab-menu hint
defaults to showing, and the test's own button click — landing outside both
the balloon and the toggle — was now correctly getting swallowed, exactly
as designed, just not anticipated by a test written before this behavior
existed. Fixed by pre-setting `dance-schedule:hint-dismissed:kebab-menu` in
`localStorage` before rendering, the same pattern `RotateDeviceBanner.
test.tsx`'s own tests already use to isolate their real behavior from this
same cross-cutting hint-suppression concern.

**Verified live, all three cases, on a fresh device:** tapping a real
"Installation" link on the home page while the kebab-menu hint was showing
dismissed the hint and left the page unchanged (no navigation); tapping
that same link again afterward navigated normally; tapping the real kebab
toggle itself dismissed the hint AND opened the menu in that one tap, same
as before this change.

## Open questions

- **Should a general multi-step walkthrough/tour engine (highlighting a
  SEQUENCE of UI elements, "Next"/"Skip" controls, etc.) be built?**
  Deliberately deferred, not rejected outright — there are two independent,
  single-target onboarding hints in the app today (kebab-menu, level-slider),
  each shown/dismissed on its own; nothing today sequences them into one
  guided walkthrough. This codebase's own convention (`CLAUDE.md`) is to
  avoid generalizing until a real use case actually shows up; the
  level-slider hint above confirmed `useFirstLaunchHint`/`HintBalloon` are
  in fact cheap to reuse for a second, differently-shaped hint (same hook,
  new `id`; one new `HintBalloon` placement value covered the new anchor), but
  a full sequenced-tour engine is still a materially bigger feature that
  nothing today actually needs. Revisit once there's a concrete idea of what
  a *multi-step* walkthrough would even cover in this app, which nobody has
  proposed yet.
