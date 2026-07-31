// Shared sizing constants for every dance-schedule grid (room-columns and
// level-columns) — kept in one place so both views stay visually and behaviorally
// consistent (same row height, same overflow-estimate math). Column width is NOT
// here — each grid tunes its own (room names vs. level codes differ enough in
// typical length that the two views may want different values).

// One grid row's fixed pixel height — a row is NOT a fixed span of real time (see
// computeDanceScheduleTimeAxis.ts's "the axis is not a clock" decision), so this is
// just "how tall should the next-thing-that-happens step be," not "pixels per
// minute." Two values, not one: showGca is a single global toggle (not per-card), so
// hiding it uniformly drops one line of content from every card that has GCA data —
// the whole grid can compact to match, not just cards that happen to lose a line.
// 18, not a more aggressive 16 — chosen live: 16 visibly compresses the common
// (1hr/45min) case just as well, but also measurably worsens a separate, pre-
// existing overflow issue (very short sessions with long wrapping text clip
// regardless of this toggle — see docs/known-issues.md) for cards that don't even
// have GCA data to hide in the first place. 18 keeps that collateral impact smaller
// while still delivering visible compaction for the common case this feature is
// actually for.
export const ROW_HEIGHT_PX_WITH_GCA = 20
export const ROW_HEIGHT_PX_WITHOUT_GCA = 18

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
