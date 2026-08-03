# Readability audit + a "text size" preference for older/low-vision users

## Context

Many of this app's users are older and may have trouble reading fine
print or small text. A live visual audit (real running app, both desktop
and mobile viewports) plus a codebase survey found:

- **`BuildInfo.module.css`'s `.buildInfo` (the Home page's footer — build
  number, "Raw data" debug link, "All events" link) and
  `EventsListPage.module.css`'s `.testTag` are hardcoded `color: #888`,
  small (`0.75rem`), and measure below WCAG AA contrast.** Investigated as
  a possible fix, but confirmed with the user this is **intentional,
  admin-only fine print** (build info, debug tooling, test-fixture
  indicators) — not content meant for the general/older audience the rest
  of the app targets, and its low contrast is deliberate visual hierarchy,
  not an oversight. **Out of scope — left exactly as-is.** (It will still
  grow under the Part 2 text-size preference below, same as everything
  else — that's an opt-in, user-controlled scale-everything mechanism, a
  different thing from unilaterally recoloring/enlarging it by default.)
- **Small (but adequately contrasted) text**: GCA lines on schedule cards
  and the level-slider's tick labels are `0.75rem`/`0.8rem` (~12-13px) —
  small, though at least dark-on-light (`var(--color-text)`, not gray).
- **Everything else checked reads fine**: the Installation page's iOS/
  Android steps, the desktop nav, and the mobile `⋮` menu all render at
  normal body size with good contrast.
- **Every font-size in the app is already `rem`/`em`** — zero hardcoded
  `px` font-sizes anywhere in `src/components` (confirmed by exhaustive
  grep) — and the two spacing tokens (`--space-sm`/`--space-md`,
  `src/index.css`) are `rem` too. This means a single root (`<html>`)
  font-size scale would proportionally enlarge *every* text element (and
  most spacing) app-wide at once, including every small spot found above,
  without hand-editing each component.
- **The app installs as a standalone PWA** (`display: 'standalone'`,
  `vite.config.ts`'s manifest) — standalone home-screen web apps typically
  lose the browser's native pinch-zoom/text-size controls (a known iOS
  Safari limitation), so an in-app text-size control is a real, needed
  capability, not a duplicate of something already available.
- **No settings/preferences UI exists anywhere in the app today** — this
  introduces the first one.

Confirmed with the user: the control lives as a **nav/menu item** (not a
floating button), offering **3 discrete steps — Normal / Large / Extra
Large** (not a continuous +/− stepper).

## Text-size preference (Normal / Large / Extra Large)

**Mechanism — root font-size scaling, not per-component edits:**
`src/index.css` gets `:root[data-text-size="large"] { font-size: 125%; }`
and `:root[data-text-size="x-large"] { font-size: 150%; }` (Normal = no
attribute = today's unchanged behavior; exact percentages adjustable while
visually verifying, not load-bearing). Since every font-size downstream is
`rem`/`em`, this one rule is the whole fix for every small-text spot found
above — no need to separately touch `DanceScheduleGrid.module.css`'s
`.gca`, `DanceScheduleFilters.module.css`'s `.tick`, or anything else.

**State + persistence:** new `src/hooks/useTextSizePreference.ts`, owning
`'normal' | 'large' | 'x-large'` state, setting
`document.documentElement.dataset.textSize` as a side effect, persisted via
the existing `src/lib/appStorage.ts` (`readStorageJson`/`writeStorageJson`)
— same low-level helper `danceScheduleFiltersStorage.ts` already uses.
Uses a **plain, non-`BASE_URL`-scoped key** (e.g. `'dance-schedule:text-size'`,
mirroring `danceScheduleFiltersStorage.ts`'s own key shape, *not*
`useLastPagePersistence.ts`'s `${BASE_URL}`-templated one) — text size is a
property of the person, not of which event/content-set they happen to be
viewing, so it should stay consistent across all of them on one device.
Wired in `src/App.tsx` so the attribute is set from first paint on every
page, not just after some specific page mounts.

**UI:** a new "Text size" control in both `src/components/Nav.tsx`
(desktop tab bar) and `src/components/PageMenu.tsx` (mobile `⋮` dropdown) —
three selectable options, styled to match whichever existing list-item
treatment those two components already use for page links, so it doesn't
look bolted on. Exact widget (radio-style list vs. a small segmented
control) is an implementation-time call, not a planning-level decision.

**Deliberately deferred tradeoff — flagging, not solving, in this pass:**
the dance-schedule grid's column width (`ROOM_COLUMN_WIDTH_PX` and its
level/caller-view equivalents, in `computeDanceScheduleLayout.ts`/
`computeDanceScheduleLevelLayout.ts`/`computeDanceScheduleCallerLayout.ts`)
is a fixed **pixel** value, not `rem` — so at a larger text size, columns
stay the same physical width while their text grows, meaning card text
wraps/clamps more than today. The card grids' line-clamp truncation is
already designed to degrade gracefully (not a new failure mode), so this
pass leaves column widths fixed and verifies visually that Extra Large
still reads acceptably, rather than also scaling column widths (a bigger
change — those constants feed inline `grid-template-columns` styles
computed in TS, not pure CSS, so scaling them would need the current
text-size value threaded into layout code, not just a CSS rule).

**New design doc**, `docs/design/text-size-preference.md`, following this
repo's established convention (context, decisions-with-rationale, open
questions) — records the root-font-scaling approach, the storage-key
scoping choice, the nav/menu-not-floating-button placement, and the
deferred column-width tradeoff above, so a future reader doesn't have to
re-derive any of this.

## Files touched

- `src/index.css` (new `[data-text-size]` rules)
- New: `src/hooks/useTextSizePreference.ts` + colocated `useTextSizePreference.test.ts`
- `src/App.tsx` (wire the hook)
- `src/components/Nav.tsx`/`Nav.module.css`, `src/components/PageMenu.tsx`/`PageMenu.module.css` (new control)
- New: `docs/design/text-size-preference.md`

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — the new hook gets a unit
  test mirroring `danceScheduleFiltersStorage.test.ts`'s shape: persists/
  reads back each of the 3 values, falls back to `'normal'` on missing or
  malformed storage.
- **Visual, live** (per CLAUDE.md's UI-change rule): `pnpm dev`, cycle
  through all three sizes on Home (fine print now legible *and*
  appropriately larger), the three dance-schedule grids (GCA lines/tick
  labels scale; confirm Extra Large doesn't over-clamp cards into
  illegibility — the deferred tradeoff above), Installation, and both
  desktop nav and the mobile `⋮` menu on a narrow viewport. Also confirm
  the BuildInfo footer/EventsListPage test-tag still look like fine print
  at Normal size (out of scope, per Context above) but do grow along with
  everything else at Large/Extra Large.
- **Open question, noted in the new design doc rather than decided here**:
  should this get Playwright e2e coverage? CLAUDE.md's e2e rule targets
  PWA-behavior regressions (offline/SW/caching), and a text-size preference
  is app-level UI state closer in kind to the level-range slider (unit-test
  only today, no e2e of its own) than to the install/offline flows that do
  get e2e coverage — but it's also the app's first real settings UI, an
  argument for holding it to a higher bar. Left open rather than decided
  unilaterally.
