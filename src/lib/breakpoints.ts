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
