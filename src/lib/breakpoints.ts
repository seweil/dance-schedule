// The JS-side half of the app's shared "phone vs. tablet-and-up" breakpoint —
// mirrors src/breakpoints.css's `--phone`/`--tablet-and-up` custom media (the
// CSS side, resolved at build time via postcss-custom-media). The two can't
// share one literal directly: a plain CSS custom PROPERTY (unlike custom
// media) can't be used inside an @media condition at all, and this constant
// feeds a query STRING built at runtime (useMediaQuery()), not a CSS rule —
// so this value is kept in sync with breakpoints.css by hand across the two
// files/languages. See docs/design/responsive-breakpoints.md for the full
// breakpoint catalog both are part of.
export const PHONE_MAX_WIDTH_PX = 640

// The complementary half — mirrors src/breakpoints.css's `--tablet-and-up`
// (`min-width: 641px`). Kept as its own named constant, not
// `PHONE_MAX_WIDTH_PX + 1` computed inline at each call site, so a reader
// doesn't have to do that arithmetic themselves to recognize it as the
// other side of the same breakpoint.
export const TABLET_MIN_WIDTH_PX = 641

// Phone-width AND portrait, not just PHONE_MAX_WIDTH_PX alone — a landscape
// phone is already past PHONE_MAX_WIDTH_PX in practice (see
// docs/design/dance-schedule-mobile-scroll.md's own note that "an iPhone in
// landscape is past a naive 640px width check"), but being explicit about
// orientation here (rather than relying on that width-only coincidence) keeps
// this query correct even on a device where it doesn't hold. Extracted here,
// not left local to RotateDeviceBanner.tsx, once useResetRotateBannerOnLandscape.ts
// (App.tsx-global) became a second consumer needing the exact same query —
// same "reconsider once a second/third consumer needs it" reasoning this
// file's own PHONE_MAX_WIDTH_PX was originally extracted for.
//
// (pointer: coarse) — added per direct product decision: orientation/width
// alone can't tell a genuine portrait PHONE apart from a desktop browser
// window simply resized narrow-and-tall (or snapped to a portrait-shaped
// half-screen), which reported the identical match and suggested "rotate
// your phone" to someone on a mouse-and-keyboard device that can't
// physically rotate at all. A coarse (finger) pointer is the actual "this is
// a touchscreen" signal, independent of window shape — an ordinary desktop
// browser reports pointer: fine (a mouse) regardless of how its window is
// sized. See docs/design/responsive-breakpoints.md's "Follow-up audit and
// three bug fixes".
export const PORTRAIT_PHONE_QUERY = `(orientation: portrait) and (max-width: ${PHONE_MAX_WIDTH_PX}px) and (pointer: coarse)`

// Orientation-agnostic "is this a phone" — unlike PORTRAIT_PHONE_QUERY above,
// this also matches a phone in LANDSCAPE, whose width alone can exceed
// PHONE_MAX_WIDTH_PX (see that query's own comment on the same fact) while
// its height — its portrait width, unchanged by rotation — stays narrow.
// Matches if EITHER dimension is at most PHONE_MAX_WIDTH_PX: a portrait
// phone via width, a landscape phone via height, and (by construction) a
// tablet in neither orientation, since a real tablet's shorter physical
// dimension already exceeds this in both orientations (e.g. an iPad mini's
// 768px short side). First consumer: FirstRunTextSizePrompt.tsx (the
// first-run text-size prompt should show on a phone in EITHER orientation,
// see docs/design/onboarding-hints.md) — extracted here once PageMenu.tsx
// and DanceScheduleFilters.tsx needed the identical check too, to suppress
// their own onboarding hints while that prompt is visible (same "extract
// once a second/third consumer needs it" reasoning PORTRAIT_PHONE_QUERY
// itself was originally extracted for). One accepted false-positive: an
// unusually SHORT, WIDE desktop browser window (e.g. a snapped half-screen)
// also matches via the height clause — a real device-type check isn't
// expressible in pure CSS, and this is the same kind of viewport-shape
// heuristic every other breakpoint in this file already relies on.
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH_PX}px), (max-height: ${PHONE_MAX_WIDTH_PX}px)`
