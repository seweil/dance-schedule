# Onboarding hints (kebab-menu discoverability)

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
**Why:** A small dismissible callout — message + an upward-pointing arrow
+ a dismiss (×) button — kept deliberately UN-generalized on positioning:
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

### Dismissal: explicit only, three triggers
**Why:** The hint never auto-dismisses on a timer — it stays until one of
three things happens: tap the balloon's own dismiss button, tap the REAL
toggle it's pointing at (handled in `PageMenu.tsx`'s `handleToggleClick`,
which calls both `toggle()` and `dismissHint()` — tapping the real menu
means the hint already did its job), or **tap anywhere else on the page**.
That third path was added after the first two shipped — reported live that
only being able to dismiss via the × felt incomplete, the same "outside
click closes it" behavior this app's dropdowns already have via
`useDismissableMenu.ts`. Implemented directly inside `HintBalloon.tsx`
(a `pointerdown` listener on `document`, checking whether the event target
falls outside the balloon's own ref) rather than reusing that hook — a
hint isn't a reopenable toggle menu (no `isOpen`/Escape-to-refocus
behavior needed; once dismissed, it never reappears), so
`useDismissableMenu`'s shape doesn't fit. All three paths persist the same
dismissed flag, so any one of them permanently retires the hint; triggering
more than one for the same tap (e.g. the real toggle counts as "outside"
too) is harmless since dismissal is idempotent.

## Open questions

- **Should a general multi-step walkthrough/tour engine (highlighting a
  SEQUENCE of UI elements, "Next"/"Skip" controls, etc.) be built?**
  Deliberately deferred, not rejected outright — there is exactly one
  onboarding hint in the app today. This codebase's own convention
  (`CLAUDE.md`) is to avoid generalizing until a second real use case
  actually shows up; `useFirstLaunchHint`/`HintBalloon` above are shaped so
  a second hint is cheap to add (same hook, new `id`; a new
  `HintBalloon` placement if the anchor differs), but a full sequenced-tour
  engine is a materially bigger feature that nothing today actually needs.
  Revisit if/when a second, genuinely different onboarding need comes up —
  and especially once there's a concrete idea of what a *multi-step*
  walkthrough would even cover in this app, which nobody has proposed yet.
