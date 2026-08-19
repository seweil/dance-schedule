# First-run prompt for text-size preference

## Context

The app already ships a complete, iteratively-tuned text-size preference
system (`useTextSizePreference`, `TextSizeControl`, Normal/Large/Extra Large
via a `data-text-size` attribute — see `docs/design/text-size-preference.md`)
built specifically because many of this app's users are older and may have
trouble reading small text. But the control's own placement has drifted
away from easy discoverability over that feature's history: it started as
an always-visible row and ended up, per the doc's own final decision ("Text
size is always a dropdown menu item, in every orientation"), living
*exclusively* inside a dropdown — a "Text size" toggle in the desktop nav
tab bar, or inside `PageMenu.tsx`'s mobile hamburger menu. A low-vision
first-time visitor on a phone today has to: notice the small hamburger
icon, tap it, scan a dropdown list (rendered at default, unenlarged text
size) to find "Text size" among the other items, then tap a size — several
steps, at the smallest text they'll ever see in the app, before anything
gets bigger. That's the actual gap being closed: get this choice in front
of the user immediately, at first launch, rather than leaving it to be
discovered.

The app also already has a mature onboarding-hint mechanism
(`useAppLaunchCount`, `useFirstLaunchHint`, `HintBalloon` — see
`docs/design/onboarding-hints.md`) used today for two small, dismissible
arrow-and-callout hints (kebab-menu discovery, level-slider discovery).
Per discussion, this new experience is a *heavier* one-time prompt, not a
third `HintBalloon` — a small arrow pointing at a two-taps-deep menu item
undercuts "easy... up front" for exactly the audience being targeted here.
Decided approach: a centered, modal-style first-run prompt that lets the
user set their text size **directly, in place**, shown once on the very
first launch only.

## Approach

### New component: `src/components/FirstRunTextSizePrompt.tsx`

- Reuses `useFirstLaunchHint('text-size', 1)` for eligibility/dismissal
  persistence — same mechanism the two existing hints use, just with
  `maxLaunches: 1` (not the default 3): a modal is heavier-weight than a
  balloon, so it should show exactly once, on launch #1, and never again
  regardless of whether it was acted on or skipped — the always-reachable
  nav/menu control remains available afterward for anyone who wants to
  change it later.
- Renders `null` while `shouldShow` is false — same "no open/close
  animation to get wrong" pattern `HintBalloon`/`RotateDeviceBanner` use
  (mount/unmount outright, not a toggled CSS state).
- Structure: a full-viewport backdrop (`position: fixed; inset: 0`) behind
  a centered dialog card — `role="dialog"` `aria-modal="true"`,
  `aria-labelledby` pointing at its own heading (`useId()`, matching
  `TextSizeControl`'s existing pattern), `tabIndex={-1}` and focused on
  mount via a `ref` so a screen-reader/keyboard user lands there
  immediately rather than on whatever was focused before.
- Content: a short, direct heading ("Make text easier to read?"), one line
  of supporting copy noting it's changeable later, the existing
  `<TextSizeControl onSelect={dismiss} />` embedded directly (reused
  as-is — the exact same control/visual language the user will see again
  later in the nav/menu, so there's nothing new to learn a second time),
  and a secondary "Continue with default text size" button that also calls
  `dismiss` for anyone who doesn't want to change anything.
- Dismiss triggers: the secondary button, selecting any size (via
  `TextSizeControl`'s `onSelect`), a backdrop click, and Escape.
- **Important distinction from `HintBalloon`:** this backdrop is genuinely
  modal (blocks/covers interaction with the rest of the page), unlike
  `HintBalloon`'s decorative, `pointer-events: none` dimming — so it does
  *not* need `HintBalloon`'s elaborate pointerdown/click-swallow-on-outside-tap
  machinery (that exists specifically because taps could fall through to
  real page content underneath; here the backdrop itself is what's
  clicked). A plain `onClick` on the backdrop, calling `dismiss`, with
  `event.stopPropagation()` on the inner dialog card, is enough.
- Since this fires before the user has chosen anything, its own heading/
  body copy must be legible independent of the text-size preference itself
  — explicit, generously-sized font-size and high-contrast text on the
  dialog's own copy (not relying on the `rem`-cascades-from-root mechanism,
  since `data-text-size` is still unset at this point for a first-time
  visitor), and the "Continue" button sized as a real, comfortably tappable
  target (contrast with `BuildInfo`'s deliberately low-contrast admin fine
  print — this is primary UI, not that).

### Colocated styles: `src/components/FirstRunTextSizePrompt.module.css`

- `.backdrop`: `position: fixed; inset: 0`, a solid-enough dim (e.g.
  `rgba(0,0,0,0.6)`), flex-centered, a z-index above `HintBalloon`'s
  highest (`22`) and `PageMenu`'s portaled dropdown (`20`) — this should
  sit above literally everything else in the app, since it's the first
  thing a fresh user sees.
- `.dialog`: a white, rounded, padded card, capped width (e.g. `26rem`,
  clamped to the viewport like `HintBalloon`'s own `min(..., 100%)`
  pattern), its own explicit larger `font-size`/`line-height` on the
  heading and body copy.

### `src/App.tsx`

Render `<FirstRunTextSizePrompt />` near the very top of the tree —
alongside `<Nav />`/`<UpdatePrompt />`, e.g. immediately after the
`#page-top-sentinel` marker and before `<Nav />`, so it's the first
interactive thing in the DOM and (being `position: fixed`) visually covers
everything else regardless of where else it's mounted.

### `src/components/ResetHintsLink.tsx` (+ its test)

Add `localStorage.removeItem('dance-schedule:hint-dismissed:text-size')`
to the existing hardcoded reset list, alongside `kebab-menu` and
`level-slider` — same "there are exactly N hints today, hardcoded rather
than a registry" convention already documented there.

### `RotateDeviceBanner.tsx` — no change needed

It hardcodes `kebab-menu`/`level-slider` specifically to avoid visually
colliding with those two *non-blocking* hint balloons. This new prompt is
a true blocking modal with an opaque backdrop — while it's showing nothing
else on the page (including `RotateDeviceBanner`) is visible or
interactable anyway, so there's no equivalent collision to suppress.

### Docs

Add a new decision entry to `docs/design/onboarding-hints.md` (its
established Context/Sub-problems/Decisions format) recording: why this is
a third `useFirstLaunchHint` id but a distinct, heavier presentation
(modal, not `HintBalloon`); the `maxLaunches: 1` choice; and the
backdrop-blocks-vs-decorative distinction from the existing two hints.

## Tests

New `src/components/FirstRunTextSizePrompt.test.tsx`, following the
existing patterns in `HintBalloon.test.tsx`/`useFirstLaunchHint.test.tsx`
(mocking/seeding `localStorage`'s `dance-schedule:launch-count` and
`dance-schedule:hint-dismissed:text-size` keys directly, same as those
files do):
- Renders the dialog with its heading on a fresh device (launch count 1,
  not dismissed).
- Does not render once already dismissed (`hint-dismissed:text-size` set).
- Does not render past launch 1 (launch count > 1, per `maxLaunches: 1`).
- Selecting a size (via `TextSizeControl`) calls dismiss and persists the
  dismissed flag.
- The secondary "Continue with default" button also dismisses without
  changing the persisted text-size preference.
- Backdrop click dismisses; click inside the dialog card does not.

## Verification

1. `pnpm typecheck && pnpm lint && pnpm test` (includes the new test file
   above).
2. `pnpm dev`, then in a phone-width viewport with devtools localStorage
   cleared (or via the existing `ResetHintsLink` on the Home page fine
   print, once wired up): confirm the modal appears immediately on first
   load, the heading/body are legible at default size, tapping a text size
   in `TextSizeControl` both applies it live (page text visibly grows) and
   closes the modal, and reloading afterward does *not* show it again.
3. Re-clear storage and confirm the "Continue with default text size" path
   and Escape/backdrop-click both dismiss without changing the applied
   text size.
4. Confirm it doesn't reappear on launch 2+ even if never interacted with
   in a prior session (simulate via `dance-schedule:launch-count`).
5. Spot-check at desktop width too (the modal isn't phone-specific, even
   though the motivating scenario is a phone).
