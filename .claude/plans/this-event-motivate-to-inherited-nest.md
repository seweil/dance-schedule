# Caller Schedule: make meals/breaks visible, styled distinctly from "everyone's busy" blocks

## Context

**The headline requirement: meals and breaks currently do not appear on the
Caller Schedule page at all — not gray, not any color, nothing. That's the bug
being fixed.** Right now, any freeform session (a lunch break, a dinner break —
anything with no caller field) is silently dropped before layout even begins, per
an explicit, deliberate decision already on record in
`docs/design/dance-schedule.md` ("a session with no caller is skipped entirely...
no floating"). This plan reverses that decision: every meal/break will now render
as a full-width floating time block on Caller Schedule, so someone reading that
page can see "callers have nothing scheduled here" instead of a page that just
skips straight from one dance session to the next with no indication a break
happened in between.

That reversal was prompted by yesterday's spreadsheet audit, which found a second,
closely related gap: Friday's 6:30–7:00 PM "GCA Callers" session (`A2, C1 :
Dancing - GCA Callers` in MotivateToSeattle's `dance-schedule.xlsx`) *also*
silently vanishes from Caller Schedule today — its caller name isn't a real,
individually-trackable caller, so it can never clear `MIN_CALLER_HOURS`, and it
isn't in the recognized `ALL_HEADLINERS_CALLER_NAMES` placeholder set either. The
user wants this session treated the same way as a break (headline callers are
free during it), not the same way as an "All Headliners" session (where headline
callers are busy).

So concretely, after this change, Caller Schedule will float THREE kinds of
session as a full-width block instead of a per-caller column, where today it only
floats one:
1. **All Headliners / All Callers** (existing) — everyone's busy together.
2. **Every meal/break** (new) — nothing scheduled for any headline caller.
3. **"GCA Callers"-style sessions** (new) — same as #2: nothing scheduled for any
   *headline* caller, even though something is happening in the room.

#2 and #3 need to look like the same thing to a reader (both mean "callers are
free") — same `slotIndex: null` floating mechanism already used for #1, same
`.roomlessCard` gray, unchanged. #1 needs to look like a different thing (callers
are busy) — a new, light/desaturated color, per the user's explicit correction
("light color is for All Callers/busy," not for the free/break blocks, which keep
the existing gray).

## Design

### New recognized keyword (`src/lib/recognizedSessionKeywords.ts`)

Add a second collective-placeholder set, parallel to `ALL_HEADLINERS_CALLER_NAMES`
but with the opposite meaning:

```ts
// Recognized non-headline placeholders — a structured session whose caller field
// names only non-headline participants (e.g. GCA callers practicing on their
// own), implying every HEADLINE caller is free during this time. Opposite of
// ALL_HEADLINERS_CALLER_NAMES above (everyone, including headliners, is busy).
export const CALLER_FREE_TIME_NAMES = new Set(['GCA Callers'])

export function isCallerFreeTimeSession(session: StructuredSession): boolean {
  return session.callers.length > 0 && session.callers.every((caller) => CALLER_FREE_TIME_NAMES.has(caller))
}
```

Same exact-match, hardcoded-set shape as `isAllHeadlinersSession` — same rationale
(a real multi-caller session could co-credit a real name; requiring EVERY listed
caller to match keeps that safe).

### `src/lib/computeDanceScheduleCallerLayout.ts` — three floating categories

Currently only structured, non-showcase sessions ever reach layout at all
(`structuredVisible = visibleSessions.filter(isEligibleCallerSession)`); freeform
sessions are filtered out before the time axis is even built. This changes to:

- **New eligibility filter** (mixed-kind, replaces feeding only structured sessions
  into the time axis): `isEligibleForCallerPage(session) = session.kind ===
  'freeform' || (session.kind === 'structured' && session.eventType !==
  GCA_CALLER_SHOWCASE_EVENT_TYPE)`. `eligibleVisible = visibleSessions.filter(isEligibleForCallerPage)`
  feeds `computeDanceScheduleTimeAxis` (already generically typed `DanceSession[]`,
  no change needed there) and `buildRawEntries`.
- **New per-session classifier**: `structuredFloatKind(session: StructuredSession):
  'busy' | 'free' | null` — `'busy'` for `isAllHeadlinersSession`, `'free'` for
  `isCallerFreeTimeSession`, `null` otherwise (an ordinary, real-caller session).
- **`RawEntry`/`DanceCallerSessionPlacement`**: `session` widens from
  `StructuredSession` to `DanceSession` (a freeform session can now be a
  placement); both gain a new `floatKind: 'busy' | 'free' | null` field.
- **`buildRawEntries`** now iterates `eligibleVisible` (mixed kind): a freeform
  session always pushes one `slotIndex: null, floatKind: 'free'` entry; a
  structured session first checks `structuredFloatKind` (push one floating entry
  if non-null) before falling back to the existing per-caller-column loop.
- **`deriveCallerOrder`** and the `visibleCallerSet` derivation both gain a
  `structuredFloatKind(session) !== null` exclusion (alongside the existing
  `isEligibleCallerSession` guard) — a floating structured session's placeholder
  name (`"GCA Callers"`, same as `"All Headliners"` today) must never occupy a
  real column, regardless of its own accumulated hours in `hourTotals`.
- **Final `placements.map(...)`**: add `floatKind: entry.floatKind` to each
  placement; `columnStart`/`columnSpan` logic for a null `slotIndex` is unchanged
  (`0` / `Math.max(visibleCallers.length, 1)`).
- `computeColumnWidthsRem`, `compressToOccupiedRows`, `assignLanesPerSlot`: no
  changes — all three already treat a null `slotIndex` generically, regardless of
  *why* it's null. `compressToOccupiedRows` in particular now naturally keeps a
  break's row instead of compressing it away, since a floating "free" entry
  occupies it — exactly the "show it as a time block" behavior wanted.

This is a genuine, deliberate reversal of the file's own current doc comment
("a session with no caller is skipped entirely... no floating") — rewrite that
whole comment block, not just patch around it.

### `src/components/DanceScheduleCallerGrid.tsx`

- Drop the `isAllHeadlinersSession` import/re-derivation entirely — the component
  now trusts `placement.floatKind` directly (`const isFloating = floatKind !==
  null`, `const isBusy = floatKind === 'busy'`), which is cleaner and matches how
  the layout computation already decided this.
- `cardClassName` for a floating card: `styles.roomlessCard` plus a new
  `styles.busyFloatingCard` modifier when `isBusy` (see CSS below) — non-floating
  card logic unchanged.
- **Card text differs by kind, not just color**: a "busy" card keeps the existing
  `detailsWithRoomContent` (bold **room** — still accurate; caller is implied by
  "spans every column"). A "free" card switches to `detailsContent` instead (bold
  **caller**, or the freeform `description` directly) — for a genuine break this
  renders the same as before (`session.description`), but for a "GCA Callers"
  session it now actually shows "**GCA Callers**" instead of just a bare room name
  with no indication anything caller-related is happening. This is the reason two
  different content functions are needed, not just two different colors.
  (`detailsContent` is already exported from `danceScheduleCardContent.tsx`,
  reused as-is — no changes needed there.)
- Time-range-instead-of-GCA-line on floating cards: unchanged, applies to both
  kinds identically (existing rationale — row/column position alone doesn't make
  a compressed-axis card's covered time obvious).
- Rewrite the component's own stale doc comment (currently describes the old
  "structured only, skipped-if-callerless" model) to describe the new one.

### `src/components/DanceScheduleGrid.module.css`

Add one new modifier class, applied alongside the existing `.roomlessCard`:

```css
.busyFloatingCard {
  background: #cfd8dc;
}
```

A light, desaturated blue-gray — distinct from `.roomlessCard`'s own plain
`rgb(0 0 0 / 6%)` gray (kept, unchanged, for "free") and from every color in
`levelColors.ts`'s `LEVEL_COLORS` palette (so it never reads as implying a
specific level). Only ever used by `DanceScheduleCallerGrid.tsx` — the room/level
views have no "busy vs. free" distinction, just one kind of roomless card.

## Tests

**`src/lib/computeDanceScheduleCallerLayout.test.ts`**:
- Rewrite the two now-reversed tests: `'skips a freeform session with no caller
  entirely'` → a freeform session now DOES get one floating placement
  (`floatKind: 'free'`, spans available columns); `'does not let a callerless
  session contribute a time-axis row'` → it now DOES contribute one.
- New `'GCA Callers'`-style tests (mirroring the existing all-headliners describe
  block): floats with `floatKind: 'free'`; never appears in `visibleCallers`
  regardless of accumulated hours; renders alongside a real caller session on the
  same row without affecting its lanes/columns.
- Extend the existing all-headliners tests to also assert `floatKind: 'busy'` on
  their placements (the field is new).
- A freeform break's row survives `compressToOccupiedRows` (doesn't get dropped
  as "idle" now that something floats there).

**`src/components/DanceScheduleCallerGrid.test.tsx`**: this file currently has
*zero* coverage of the floating-card rendering branch at all (a gap from the
earlier all-headliners work). Add: a `floatKind: 'busy'` placement renders
`.roomlessCard` + `.busyFloatingCard`, shows bold room text; a `floatKind: 'free'`
placement renders `.roomlessCard` only (no busy modifier), shows bold caller text
(or plain description for a freeform session); both show the session's time range
instead of a GCA line even when `showGca` is true.

**`e2e/caller-schedule.spec.ts`**: `automated-testing`'s fixture already has
freeform "Lunch Break" sessions on multiple days (confirmed via its
`dance-schedule-dump.md`) — no fixture changes needed. Add a case that picks a
date with one and confirms it now renders on Caller Schedule as a floating gray
banner (it was previously invisible there entirely). The "GCA Callers"
busy-vs-free color distinction is covered by hand-built unit-test fixtures (no
real spreadsheet data needed to prove the classification logic) plus the live
MotivateToSeattle browser check below, using its real data rather than adding a
synthetic fixture row to the shared `automated-testing` set.

## Docs

**`docs/design/dance-schedule.md`**: the "A session with no caller is skipped
entirely..." paragraph and the "Cards show level(s) and room, never the caller"
paragraph (both in the caller-columns section, already partially patched last
task) need a full rewrite, not another patch — the underlying decision they
describe is now reversed. Fold the existing "All-headliners sessions float across
every caller column" decision entry into a broader one covering all three
categories (ordinary/busy/free), or add a new entry directly after it — whichever
reads cleaner once written. Cover: why freeform sessions now float (the "GCA
Callers" audit finding prompted revisiting the earlier "skipped entirely, per
direct product decision" choice), the new `CALLER_FREE_TIME_NAMES` keyword, and
the busy/free visual split.

**`docs/adding-a-new-event.md`**: extend the existing "All Headliners"/"All
Callers" bullet (added last task) to also document `"GCA Callers"` as a second,
distinctly-styled recognized placeholder, and note that breaks/freeform sessions
now also appear on the Caller Schedule page (gray floating block) instead of
being invisible there.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test`.
- `pnpm build && pnpm preview`, then live-check MotivateToSeattle's `/caller-schedule`
  on Friday (Oct 9): the 6:30–7:00 PM "GCA Callers" session should now render as a
  gray floating banner (same visual language as a break, bold "GCA Callers" text),
  clearly distinct in color from the 7:00–8:00 PM "Trail-In Dance" busy banner
  (light blue-gray). Also check a date/set with a real meal break (e.g.
  `automated-testing`'s "Lunch Break" or `backtrack2abq`'s data) now shows it on
  Caller Schedule too.
- `pnpm test:e2e` for the full suite (this touches shared CSS/component code paths
  other e2e specs also exercise).
