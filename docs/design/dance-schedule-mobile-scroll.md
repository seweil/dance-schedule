# Dance-schedule grid: small-screen scroll behavior

## Context

A prior change (`6040655`) made the dance-schedule grid's small-screen
behavior page-level: below `(max-width: 640px), (max-height: 500px)` (narrow
portrait phones, and short-but-wide landscape phones — an iPhone in
landscape is past a naive 640px width check, so both conditions are needed),
`DanceScheduleGrid.module.css`'s `.scrollContainer` stops being its own
scroll area (`overflow: auto; max-height: 70vh`) and instead lets the whole
page scroll. This correctly made room headers pin to the real viewport's top
edge as the page scrolls down (`position: sticky` inside a non-clipping
ancestor chain resolves against the viewport for free — no JS needed), and
let the grid bleed edge-to-edge.

It also had a side effect nobody wanted: because the grid's content can be
wider than the viewport (more room columns than fit), and the container no
longer clips that overflow locally, the **whole page** — nav, the "Dance
Schedule" heading, the filter controls, all of it — becomes horizontally
scrollable along with the grid. Scrolling right to see more rooms drags the
nav bar and filters off the left edge too.

The ask: only the grid's own content should pan horizontally. Nav, the
heading, and the filters should stay put horizontally (they already
correctly scroll away *vertically*, unaffected, and should keep doing that).

Two straightforward-looking CSS fixes were tried and both failed for
specific, verifiable reasons — see Decisions below. The real fix requires
splitting the grid into a separately-scrolling header and body.

## Sub-problems

- [x] Why doesn't `position: sticky; left: 0` on nav/heading/filters keep
      them in place? — see Decisions
- [x] Why doesn't giving `.scrollContainer` its own `overflow-x: auto` (so
      only the grid scrolls horizontally) work? — see Decisions
- [x] What architecture satisfies both constraints (locally-contained
      horizontal scroll *and* viewport-relative vertical sticky) at once? —
      see Decisions
- [x] How do the header and body stay column-aligned as two separate grids?
      — see Decisions
- [x] How does today's exact desktop behavior (one 70vh panel, its own
      scrollbar, normal page margins) stay completely unchanged? — see
      Decisions
- [x] How does the sticky corner cell / time-axis column keep working in
      both structures? — see Decisions
- [x] What row-index arithmetic changes once the body grid no longer
      reserves row 1 for the header? — see Decisions
- [x] Test plan — unit and e2e coverage, given this sandbox can't run
      Playwright — see Test plan section below

## Decisions

### Rejected: `position: sticky; left: 0` on nav/heading/filters
**Why it fails (confirmed live, not just reasoned about):** a sticky
element can only be repositioned *within its own containing block's box* —
it can never stick past where that box actually extends. Nav's containing
block is `body`, and `body`'s own layout width never changes because of a
deeply-nested descendant's overflow — CSS `overflow: visible` content
doesn't widen any ancestor's box, it just paints outside it; only the
*root* (`document.documentElement`) actually grows a scrollable region.
Nav is already essentially as wide as `body`'s own (un-widened) box, so
there's no slack for sticky to use when the page scrolls into the region
that only exists because the grid's ink overflow extends past `body`'s
edge. Verified directly: after applying this and scrolling the page
horizontally by 400px, nav's `getBoundingClientRect().x` moved by the full
400px — sticky had no effect at all, despite computed `position: sticky`
being correctly applied.

### Rejected: `overflow-x: auto` directly on `.scrollContainer`
**Why it fails (also confirmed live):** per the CSS Overflow spec, if one
axis's overflow is set to something other than `visible`, the browser
computes the *other* axis to `auto` too, even if you wrote `overflow-y:
visible` explicitly — confirmed in Chrome via `getComputedStyle` (setting
only `overflow-x: auto` produced computed `overflow-y: auto`). That makes
`.scrollContainer` a scroll-establishing box on both axes. `position:
sticky`'s "nearest scrolling ancestor" search stops at the first such box —
even one whose content never actually overflows it internally (which
`.scrollContainer`'s vertical axis doesn't, since nothing constrains its
height). A sticky element scoped to a container whose own internal scroll
offset never changes just sits at its static position and is carried along
by *outer* scrolling, exactly as if it weren't sticky at all — confirmed
live: with this in place, `.roomHeader`'s `y` went from `0` to `-203.6`
after a 400px page scroll, i.e. it stopped pinning entirely.

### The fix: split into a sticky `headerGrid` and a locally-scrolling `bodyGrid`
**Why:** the two failures above share one root cause — the *same* element
can't simultaneously (a) be a scroll-clipping box for horizontal overflow
and (b) have viewport-relative vertical stickiness pass through it. The
only way to get both properties at once is to put them on two different
elements: the header, and the body.

- **`headerGrid`** — contains exactly what `.corner` + `.roomHeader` render
  today, on its own `display: grid` with `gridTemplateRows: auto` (one
  row). Wrapped in a `headerWrapper` div that is `position: sticky; top: 0`
  (below the breakpoint) and `overflow-x: hidden` — clips its content
  horizontally, but has **no visible/user-operable scrollbar** (`hidden`,
  not `auto`); its horizontal position is driven entirely by JS (below),
  never by direct touch/scroll input on the header itself.
- **`bodyGrid`** — everything else (`.timeLabel`/`.halfHourTick`/session
  cards), on its own grid with `gridTemplateRows: repeat(totalRowUnits,
  ...)` (no leading `auto` row — see the row-index Decision below). Wrapped
  in a `bodyWrapper` div that is `overflow-x: auto` below the breakpoint —
  the real, user-interactive horizontal scroll area.
- **One-way scroll sync, attached via a callback ref, not `useEffect`:**
  `DanceScheduleGrid` has an early return (`if (placements.length === 0)
  return <p>...</p>`) *before* the wrapper divs — meaning when the filtered
  view has zero results, `bodyWrapper`/`headerWrapper` don't exist in the
  DOM at all, then come back once a filter change makes `placements` non-
  empty again. A `useEffect(() => {...}, [])` reading `bodyRef.current`
  once at mount would miss that transition — if the grid starts empty, the
  effect runs against a `null` ref and never re-attaches once content
  appears. A callback ref sidesteps this entirely: React invokes it exactly
  when the underlying DOM node mounts (attach the listener) and unmounts
  (`null`, detach it) — including across this exact empty ↔ non-empty
  cycle, without depending on effect re-runs at all.

  ```tsx
  const headerRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const handleBodyScroll = useCallback((event: Event) => {
    const header = headerRef.current
    const body = event.currentTarget as HTMLDivElement
    if (header) header.scrollLeft = body.scrollLeft
  }, [])

  const setBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current?.removeEventListener('scroll', handleBodyScroll)
      bodyRef.current = node
      node?.addEventListener('scroll', handleBodyScroll, { passive: true })
    },
    [handleBodyScroll],
  )
  ```

  `handleBodyScroll` has an empty dependency array (reads refs only, never
  stale), so `setBodyRef` is itself stable across re-renders — React won't
  spuriously detach/reattach on every render, only on genuine mount/
  unmount. `headerRef`/`bodyRef`/`handleBodyScroll`/`setBodyRef` must all be
  declared *before* the `placements.length === 0` early return (Rules of
  Hooks — hooks can't follow a conditional return), which the current
  function body's ordering already accommodates (the check comes after the
  `layout` destructure; the new hooks join it there).

  One-way only — `headerWrapper` is never independently touch-scrollable
  (`overflow: hidden` blocks that in every modern engine), so there's no
  echo/loop to guard against. Plain synchronous DOM property assignment in
  the handler, not routed through React state — this needs to track a fast
  swipe/fling smoothly, and a `setState`-per-scroll-tick would force a React
  re-render on every event for no benefit (nothing about the render output
  depends on scroll position).

- **Scroll position resets to 0 when the visible rooms change, not just on
  mount:** if a user scrolls right on Thursday, then switches to Friday
  (different room set) or narrows the level filter (fewer visible rooms),
  the old horizontal offset is no longer meaningful — worst case it's
  clamped to a different, arbitrary set of rooms with no obvious relation
  to where they were. `layout` (`useDanceScheduleFilters.ts`) is already
  `useMemo`'d on `[dateSessions, visibleSessions]` — a fresh reference
  exactly when the date or level range changes, and *not* on a `showGca`
  toggle (which doesn't change which rooms are visible, so shouldn't reset
  scroll). That makes `layout` the precisely-scoped dependency for a reset
  effect:

  ```tsx
  useEffect(() => {
    if (headerRef.current) headerRef.current.scrollLeft = 0
    if (bodyRef.current) bodyRef.current.scrollLeft = 0
  }, [layout])
  ```

  Safe to run even during the empty-state transition (refs may be `null`
  then; the guards no-op rather than throw).

`headerWrapper`'s own `overflow-x: hidden` doesn't affect *its own*
stickiness — only an element's **ancestors'** overflow matters for where a
sticky element's positioning resolves, never the element's own overflow
value. Since everything above `headerWrapper` (a wrapping `panelWrapper`,
`DanceSchedulePage`, `App`, `body`, `html`) stays `overflow: visible` below
the breakpoint, `headerWrapper`'s `top: 0` sticky correctly resolves against
the real viewport, exactly like `.roomHeader` already does today post-
`6040655` — this part doesn't change, it just moves up one level from the
room-header cells themselves to their new wrapper.

### Column alignment: header and body share one computed `gridTemplateColumns`
**Why:** `headerGrid` and `bodyGrid` are two separate CSS Grid containers
(a single grid can't span two DOM subtrees with independent scroll
behavior), so they don't align automatically the way rows within one grid
do. `DanceScheduleGrid` already computes `gridTemplateColumns` once today
(`${TIME_COLUMN_WIDTH} repeat(${visibleRooms.length}, minmax(...))`) —
applying that *same* computed string as an inline style to both grids is
sufficient; as long as the column tracks are defined identically, room
columns line up pixel-for-pixel between the two independently-rendered
grids.

### Desktop stays byte-for-byte the same UX, via one wrapper + CSS only
**Why:** wrap `headerWrapper` and `bodyWrapper` together in a `panelWrapper`
div. Above the breakpoint, `panelWrapper` gets exactly today's `.scroll
Container` rule (`overflow: auto; max-height: 70vh; border: ...`), and
`headerWrapper`/`bodyWrapper` get **no** overflow/position rules of their
own (inherit normal, unclipped flow) — so `panelWrapper` is the *only*
scrolling box, and scrolling it moves both header and body together in
lockstep automatically, no JS involved. `headerGrid`'s `.roomHeader`/
`.corner` sticky rules resolve against `panelWrapper`'s scrollport (`top:
0`) exactly as `.scrollContainer`'s children do today — byte-identical
desktop behavior. The scroll-sync `useEffect` still attaches its listener
to `bodyWrapper` unconditionally (no `matchMedia` branching needed in JS at
all), but it's harmless on desktop: `bodyWrapper` has no independent
overflow there, so it never fires its own `scroll` event (only
`panelWrapper` does) — the listener simply never runs.

### The sticky corner/time-axis pattern is unchanged, just re-homed
**Why:** `.corner` (`position: sticky; left: 0`) now lives inside
`headerGrid`/`headerWrapper`; `.timeLabel`/`.halfHourTick` (`position:
sticky; left: 0`) stay inside `bodyGrid`/`bodyWrapper`. In both cases their
relevant "nearest scrolling ancestor" is their own immediate wrapper — on
desktop that's `panelWrapper` (via inheritance, since neither `headerWrapper`
nor `bodyWrapper` clips there), on mobile it's `headerWrapper` and
`bodyWrapper` respectively (each independently horizontally scrollable/
JS-synced). Either way, `left: 0` sticky continues to mean exactly what it
means today: stay pinned to *this scroll area's* left edge. No behavior
change to this part at all — it's the same CSS rule, just attached to
elements that now live in one of two wrappers instead of one.

### Row-index math: drop the header-row `+1` inside `bodyGrid`
**Why:** `computeDanceScheduleLayout.ts`'s `rowStart` is already 1-based
counting from the first 15-minute unit (`rowStartFor` returns `... + 1`) —
its doc comment already calls this out as "header-row-agnostic... a CSS
grid row (with a header row above the time axis) is this value + 1." Today,
`SessionCard`/`.timeLabel`/`.halfHourTick` all add that extra `+ 1` in
`DanceScheduleGrid.tsx` because they share `.grid` with `.roomHeader`,
which occupies row 1. In the split design, `bodyGrid` has **no** header row
of its own (`gridTemplateRows: repeat(totalRowUnits, ...)`, no leading
`auto`) — row 1 of `bodyGrid` *is* the first time unit. So every place that
currently computes `rowStart + 1` for body content becomes plain `rowStart`
(three call sites: `SessionCard`'s `gridRow`, `.timeLabel`'s `gridRow`,
`.halfHourTick`'s `gridRow`). `headerGrid` keeps `.corner`/`.roomHeader`
at their current hardcoded `gridRow: 1` unchanged.

### Considered during review, no change needed
- **`.corner`'s `z-index: 3` vs. `.roomHeader`'s `z-index: 2`:** still needed
  unchanged in `headerGrid` — corner is sticky-left *within the header's own
  scroll area* exactly as before, so it can still visually overlap a room-
  header cell mid-scroll the same way it does today; the stacking order
  that prevents it from being drawn underneath is unrelated to the header/
  body split.
- **iOS momentum scrolling (`-webkit-overflow-scrolling: touch`):** not
  needed — that's a pre-iOS-13 Safari requirement; modern iOS gives native
  `overflow: auto` momentum scrolling by default. Not adding legacy CSS for
  engines this PWA doesn't otherwise support.
- **`touch-action` hints on `bodyWrapper`:** not added — with the page
  itself no longer overflowing horizontally at all (fully contained in
  `bodyWrapper` now), there's no competing horizontal-scroll target for the
  browser to disambiguate against, and `bodyWrapper` has no *vertical*
  overflow of its own (natural height, nothing to clip) so a vertical swipe
  starting over the grid should chain through to the page by default. Real
  behavior here depends on touch-gesture chaining that this session's tools
  can't fully emulate — flagged explicitly in the test plan below rather
  than assumed.

## Test plan

**Unit tests (`DanceScheduleGrid.test.tsx`, Vitest + Testing Library —
these run fine in this sandbox, verified throughout this session):**
- Update the existing `renders a half-hour tick between the hour marks`
  test: it currently asserts `gridRow: '4'` for a half-hour mark at
  `rowStart: 3` (i.e. `3 + 1`) — must become `gridRow: '3'` (no `+1`) once
  `bodyGrid` drops the header row.
- Add: header content (`.corner`, one `.roomHeader` per visible room)
  renders inside a distinct container from body content (`.timeLabel`,
  session cards) — e.g. query for two separate `[class*="grid"]`-ish
  containers, or assert `.roomHeader`'s closest ancestor differs from
  `.timeLabel`'s closest ancestor.
- Add: `headerGrid` and `bodyGrid` receive the identical computed
  `gridTemplateColumns` string (read both elements' inline `style`).
- Keep all existing tests otherwise unchanged (room header per room, hour
  marks, session card content/color, roomless banner, showGca toggle,
  duplicate-session-multiple-placements) — none of them depend on the
  header/body split, only on what text/attributes render.
- The scroll-sync `useEffect` itself is not meaningfully unit-testable in
  jsdom (no real layout/scroll metrics) — covered by e2e instead.

**E2e tests (`e2e/dance-schedule.spec.ts`, mobile viewport block — this
sandbox cannot launch Chromium at all, confirmed this session on every test
including pre-existing, untouched ones; run these for real via `pnpm
test:e2e` outside this sandbox, or CI):**
- New: scrolling `bodyWrapper` horizontally (e.g. `evaluate(el => el.
  scrollLeft = 300)`) moves the grid's session cards, and `headerWrapper`'s
  `scrollLeft` matches within one tick (sync actually fires).
- New: after that same horizontal scroll, nav/heading/filters' bounding
  boxes are unchanged (`x` identical to before scrolling) — the actual
  regression this whole change fixes.
- Keep (adapted from the existing suite, still valid): room header pins to
  viewport top on vertical scroll; nav/filters scroll fully out of view on
  vertical scroll; grid spans full viewport width with no inset; the page
  itself no longer needs to overflow horizontally at all now (this
  actually *reverts* the last change's "page scrolls horizontally" test —
  replace it with asserting `document.documentElement.scrollWidth <=
  clientWidth`, since horizontal overflow is now fully contained inside
  `bodyWrapper`).
- New (desktop regression, default/no mobile `test.use`): existing desktop
  tests continue to pass unmodified; add one explicit check that `.scroll
  Container`-equivalent (`panelWrapper`) still has its own `overflow-x`/
  `overflow-y` producing `scrollWidth > clientWidth` on itself specifically
  (today's `.scrollContainer` behavior), confirming desktop truly didn't
  change.

**Live verification (since Playwright can't run here):** rebuild, serve via
`pnpm preview`, drive with `claude-in-chrome` exactly as done for the prior
change in this session — resize to the landscape-matching viewport used
before (~796×402, satisfies the height arm without the width arm, the
critical case), scroll `bodyWrapper` horizontally via `evaluate`, and read
back `getBoundingClientRect()` for nav/heading/filters/`headerWrapper`
before and after to confirm they're pixel-identical, not just "probably
fine." Also specifically check:
- Switching the date select (or narrowing the level slider) after having
  scrolled right resets both `headerRef`/`bodyRef.current.scrollLeft` to
  `0` (the reset-on-`layout`-change effect).
- The empty-state transition doesn't throw/lose the listener: filter down
  to zero visible sessions (e.g. an extreme level-range narrowing) so the
  grid unmounts to the "No sessions match" message, then widen the filter
  back — horizontal scroll sync must still work afterward.
- A vertical scroll gesture *starting on top of the grid body* (not
  elsewhere on the page) still scrolls the page — `computer` tool
  scroll/wheel actions over the grid's own screen region, not just
  `window.scrollBy` from a JS console, since gesture-chaining is exactly
  the kind of thing that can silently differ from a synthetic scroll call.
