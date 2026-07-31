# Let dance-schedule rows grow to fit real card content, with a line-count cap

## Context

`danceScheduleCardSizing.ts` and `docs/known-issues.md` both flag this
explicitly as deferred future work: grid rows are currently a fixed pixel
height per tick (`ROW_HEIGHT_PX_WITH_GCA`/`WITHOUT_GCA`, live-measured
against typical content earlier this session), so a card with unusually
long text (a long caller list, a long room name) still clips — the accepted,
documented tradeoff of the axis rework. The user is now ready to close that
gap: let a row's actual rendered height come from the content inside it
(native CSS sizing), not a hand-tuned constant.

The one new constraint from this conversation: **rows must not be free to
grow without bound.** Every row is shared across every column (an ordinal
tick, not a fixed time slot — see `docs/design/dance-schedule.md`'s "the
axis is not a clock" decision), so one pathological card (e.g. a session
listing ten callers) growing its row would force *every other card in every
other room at that same row* to stretch to match, even though their own
content is short — one bad cell could blow out the whole schedule's vertical
rhythm. So growth needs a heuristic ceiling, not just "auto."

## Approach

**Row tracks become intrinsically sized, with a floor:**
`gridTemplateRows: repeat(totalRows, minmax(28px, auto))` (both
`DanceScheduleGrid.tsx` and `DanceScheduleLevelGrid.tsx`) — `auto` lets each
row size to the tallest content actually touching it (including correctly
distributing a row-spanning card's height need across the rows it spans;
this is standard, well-supported CSS Grid track-sizing behavior, no JS
involved), and the `28px` floor keeps a row that's only carrying a time
label (no card) from collapsing to a cramped sliver. The exact floor value
gets live-tuned against real content, same as `ROW_HEIGHT_PX` was.

**The growth ceiling is a CSS line-clamp on card text, not a pixel cap on
the row.** A `max-height` on the row track itself can't actually prevent
overflow without reintroducing clipping (a track's min-content floor wins
over its own max in CSS Grid's sizing algorithm), so the cap has to live on
the content instead: `.details` (and defensively `.levels`/`.gca`) in
`DanceScheduleGrid.module.css` get
`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: N; line-clamp: N; overflow: hidden; text-overflow: ellipsis;`
(a few lines each, live-tuned — `.details` is the real risk area, e.g. 3-4
lines; `.levels`/`.gca` are reliably short in practice but get a defensive
clamp too). An element with `overflow: hidden` reports its own clamped box
height to the grid track sizing algorithm, not its unclamped content height
— so the row naturally never needs to grow past what the clamp allows. This
is strictly better than today's plain `overflow: hidden` clipping: it always
breaks at a line boundary and shows a visible "…", so a genuinely-too-long
card is honestly truncated instead of silently cut off mid-line.

**This removes the reason the "combine level+details onto one line" estimate
exists at all** — that machinery only ever existed to dodge a *fixed* row
height; once rows grow to fit ordinary content and pathological content is
handled by the clamp instead, there's no "will this fit?" decision left to
make. Per your answer, delete it rather than keep it as a compactness
optimization:
- `src/lib/estimateCardFit.ts` + `.test.ts` — delete
- `src/lib/estimateWrappedLineCount.ts` + `.test.ts` — delete (confirmed via
  grep: no consumers outside the combine mechanism)
- `src/lib/measureTextWidth.ts` — delete (confirmed via grep: only consumed
  by the combine mechanism)
- `roomTextWidthPx` (`computeDanceScheduleLayout.ts`) and `levelTextWidthPx`
  (`computeDanceScheduleLevelLayout.ts`) — delete (confirmed via grep: each
  used only to feed the combine estimate's `textWidthPx` input)
- `CARD_PADDING_PX`/`CARD_HORIZONTAL_OVERHEAD_PX`/`DETAILS_MEASUREMENT_FONT`
  (`danceScheduleCardSizing.ts`) — delete (confirmed via grep: each used
  only by the functions above); `levelColumnWidthPx`
  (`computeDanceScheduleLevelLayout.ts`, actual column pixel width,
  unrelated to text-fit estimation) is untouched and keeps its own math
  self-contained.
- The `combineLevelAndDetails`/`combineRoomAndDetails` branches in both
  grid components' `SessionCard` — delete; a card always renders its
  level/room line and details line separately now.
- `ROW_HEIGHT_PX_WITH_GCA`/`WITHOUT_GCA` and the `rowHeightPx` prop/local
  var threaded through both grid components — delete; `showGca` now only
  controls whether the `.gca` paragraph renders at all, and the row
  auto-sizes to match — no JS-side row-height branching needed.

## Files

- **`src/components/DanceScheduleGrid.tsx` / `DanceScheduleLevelGrid.tsx`**
  — drop `rowHeightPx` (prop, local var, import); `gridTemplateRows` becomes
  `repeat(${totalRows}, minmax(28px, auto))`; `SessionCard` always renders
  the two lines separately (no combine branch); drop
  `shouldCombinePrimaryAndDetails`/`measureTextWidth`/
  `roomTextWidthPx`/`levelTextWidthPx`/`DETAILS_MEASUREMENT_FONT` imports.
- **`src/lib/danceScheduleCardSizing.ts`** — after the deletions above,
  confirm via a final grep pass whether anything it exports is still used;
  if nothing is, delete the file itself and its remaining imports rather
  than leaving an empty/near-empty file behind.
- **`src/lib/estimateCardFit.ts`, `estimateWrappedLineCount.ts`,
  `measureTextWidth.ts`** (+ their `.test.ts` files) — delete.
- **`src/lib/computeDanceScheduleLayout.ts`** — delete `roomTextWidthPx`
  (keep `ROOM_COLUMN_WIDTH_PX`/`ROOM_COLUMN_WIDTH`, still needed for
  `gridTemplateColumns`).
- **`src/lib/computeDanceScheduleLevelLayout.ts`** — delete
  `levelTextWidthPx` (keep `levelColumnWidthPx`/`computeColumnWidthsPx`,
  unrelated — real column pixel widths, not text-fit estimation).
- **`src/components/DanceScheduleGrid.module.css`** — add the line-clamp
  rule to `.details`/`.levels`/`.gca`; drop the row-height framing from
  `.card`'s doc comment (no longer "fixed height ... never grows").
- **Tests**: `DanceScheduleGrid.test.tsx` / `DanceScheduleLevelGrid.test.tsx`
  — delete the "combines the level/room and details lines..." tests (no
  combine behavior left) and the "uses a shorter row height... when showGca
  is false" test (asserted a JS-computed pixel value that no longer exists;
  jsdom doesn't run real CSS layout, so this specific claim isn't unit-
  testable anymore — see Verification). Remove `rowHeightPx` from
  `makeLayout`/placement test helpers wherever it was only there to feed the
  deleted prop.
- **`docs/known-issues.md`** — mark the "long wrapping text clips" entry
  resolved: rows now grow to fit ordinary content; only pathological
  (many-line) content still truncates, and now does so visibly (ellipsis)
  rather than silently.
- **`docs/design/dance-schedule.md`** — add a short decision entry closing
  out the "future work" pointer left by the axis-rework entry: rows now use
  native CSS intrinsic sizing (`minmax(28px, auto)`) instead of a fixed
  pixel constant, with a line-clamp as the growth ceiling, and why a
  track-level pixel cap couldn't do that job by itself.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` after each deletion pass —
  expect real "unused export" fallout to chase down beyond the files listed
  above, given how wide this deletion is.
- Live-verify with `pnpm dev`/`pnpm dev:test` + claude-in-chrome against
  both `/dance-schedule` and `/dance-by-level`, on both the
  `automated-testing` and `test` content sets:
  - A normal card's row is now only as tall as its actual 2-3 lines need
    (shorter than today's blanket `ROW_HEIGHT_PX` in the common case).
  - A card with a long caller name / long room name wraps and grows its row
    instead of clipping.
  - Construct one deliberately pathological case (e.g. temporarily edit a
    test-data cell via `scripts/edit-test-data.mjs` to a many-caller list)
    and confirm it truncates with a visible "…" instead of ballooning the
    whole row — this is the actual proof the ceiling works, not just that
    rows can grow.
  - The existing long-session stress case (Test Room D,
    `content/test/data/dance-schedule.xlsx`) still renders correctly against
    this new sizing model.
  - Toggle "show GCA" and confirm rows shrink/grow accordingly with no
    visual jump/flash.
- Note in the report to the user: jsdom (Vitest) doesn't run real CSS
  layout, so line-clamp truncation and intrinsic row growth can't be
  asserted by a unit test — the deleted pixel-comparison test isn't
  replaced by an equivalent unit test, only by the live/manual check above.
  If real regression coverage for this is wanted going forward, that's a
  Playwright e2e test (real-browser layout) — flag as a possible follow-up
  rather than adding it silently as part of this change, since Playwright
  can't be run from this sandbox to validate it.

## Critical files

- `src/components/DanceScheduleGrid.tsx` / `DanceScheduleLevelGrid.tsx` —
  intrinsic `gridTemplateRows`, drop `rowHeightPx` and combine branches
- `src/components/DanceScheduleGrid.module.css` — line-clamp on
  `.details`/`.levels`/`.gca`
- `src/lib/danceScheduleCardSizing.ts` — shrink or delete
- `src/lib/estimateCardFit.ts` / `estimateWrappedLineCount.ts` /
  `measureTextWidth.ts` (+ tests) — delete
- `src/lib/computeDanceScheduleLayout.ts` / `computeDanceScheduleLevelLayout.ts`
  — delete `roomTextWidthPx`/`levelTextWidthPx`
- `src/components/DanceScheduleGrid.test.tsx` / `DanceScheduleLevelGrid.test.tsx`
  — drop combine and row-height-pixel tests
- `docs/known-issues.md` / `docs/design/dance-schedule.md` — doc updates
