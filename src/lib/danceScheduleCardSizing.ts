// Shared sizing constants for every dance-schedule grid (room-columns and
// level-columns) — kept in one place so both views stay visually and behaviorally
// consistent (same row height, same overflow-estimate math). Column width is NOT
// here — each grid tunes its own (room names vs. level codes differ enough in
// typical length that the two views may want different values).

// One grid row's fixed pixel height — a row is NOT a fixed span of real time (see
// computeDanceScheduleTimeAxis.ts's "the axis is not a clock" decision), and most
// sessions now get rowSpan 1 (nothing else happens at the same moment often enough
// to create a second tick) — so unlike the old per-15-real-minutes value this
// replaced, a single row now has to comfortably fit a TYPICAL full card's content on
// its own, not a quarter of it. Live-measured against the real automated-testing
// data, not derived from estimateCardFit.ts's line-height constants alone — an
// initial pass computed from those constants (padding + line heights) undercounted
// by ~12-14px, since it missed .levels' own 2px top/bottom margin and the
// margin-bottom the last line in a card gets (`.card > div > p:last-child`) — both
// real box-model contributors estimateCardFit.ts's own combine/overflow *decision*
// already accounts for (via PRIMARY_DETAILS_LINE_HEIGHT_PX etc.), but this constant
// didn't. Confirmed live: with these values, only ~10-15% of real cards still clip
// (all long-text cases the combine mitigation can't fully resolve), down from
// nearly all of them at the first-pass numbers. Two values, not one: showGca is a
// single global toggle (not per-card), so hiding it uniformly drops one line of
// content from every card that has GCA data — the whole grid can compact to match,
// not just cards that happen to lose a line. Residual clipping on long-text cards
// falls to the existing shouldCombinePrimaryAndDetails mitigation, and beyond that,
// accepted — see docs/known-issues.md.
export const ROW_HEIGHT_PX_WITH_GCA = 76
export const ROW_HEIGHT_PX_WITHOUT_GCA = 62

// .card's own horizontal padding (8px each side, --space-sm) — the difference
// between the card's own box width and the usable text width inside it. Use this
// alone (not CARD_HORIZONTAL_OVERHEAD_PX below) whenever a card's box width is
// already known directly, e.g. an explicit per-lane width in
// DanceScheduleLevelGrid.tsx — margin doesn't shrink a border-box element's own
// content area, only padding does.
export const CARD_PADDING_PX = 16

// .card's own horizontal margin (1px each side) + padding (8px each side) — the
// difference between a column's TRACK width and the usable text width inside a
// card that fills it via the default grid-stretch sizing (no explicit width set).
// Live-measured: a 150px column leaves 132px of usable text width (150 - 18). Not
// applicable to a card with an explicit per-lane width — see CARD_PADDING_PX above.
export const CARD_HORIZONTAL_OVERHEAD_PX = CARD_PADDING_PX + 2

// Matches :root's font stack in src/index.css, at .card's 13px (0.8125rem) font-size,
// bold — the caller name (the widest part of a details line) renders in <strong>, so
// measuring as bold errs toward a wider (safer, more likely to trigger combining)
// estimate rather than an under-estimate that risks leaving real overflow uncombined.
export const DETAILS_MEASUREMENT_FONT =
  'bold 13px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
