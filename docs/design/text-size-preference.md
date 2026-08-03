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
- [ ] Whether the dance-schedule grid's column widths should also scale with text
      size — deferred, see Open questions.
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

## Open questions

- Should the dance-schedule grid's column width (`ROOM_COLUMN_WIDTH_PX`
  and its level/caller-view equivalents, in `computeDanceScheduleLayout.ts`/
  `computeDanceScheduleLevelLayout.ts`/`computeDanceScheduleCallerLayout.ts`)
  also scale with the text-size preference? Currently a fixed **pixel**
  value, not `rem`, so at a larger text size, columns stay the same
  physical width while their text grows, meaning card text wraps/clamps
  more than at Normal. The card grids' line-clamp truncation already
  degrades gracefully (not a new failure mode), so this was deliberately
  left fixed for the first pass rather than also threading the current
  text-size value into the TS layout code that computes those widths (a
  materially bigger change than a CSS-only rule). Revisit if Extra Large
  turns out to clamp too aggressively in practice.
- Should this get Playwright e2e coverage? CLAUDE.md's e2e rule targets
  PWA-behavior regressions (offline/SW/caching), and a text-size preference
  is app-level UI state closer in kind to the level-range slider (unit-test
  only today, no e2e of its own) than to the install/offline flows that do
  get e2e coverage — but it's also the app's first real settings UI, an
  argument for holding it to a higher bar. Left undecided.
