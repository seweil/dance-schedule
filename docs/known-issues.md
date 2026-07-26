# Known issues / follow-ups

Bugs and flakes found in passing, not yet worth fixing inline. Not
architectural decisions (see `docs/design/` for those) — just a running list.

## Mobile dance-schedule grid: room header doesn't stay pinned during horizontal scroll

**Found:** 2026-07-26, while verifying the content-sets change (unrelated to
that work — pre-existing).

`e2e/dance-schedule.spec.ts`'s `mobile viewport › grid scrolls horizontally
with the time column and room header staying pinned` fails against a real
Chromium run (`pnpm test:e2e`).

**Root cause:** `.roomHeader` in `src/components/DanceScheduleGrid.module.css`
is `position: sticky; top: 0` only — pinned vertically, but with no `left: 0`
it can't stay in place during a *horizontal* scroll. Confirmed by manually
scrolling the real grid in a browser: the header moved exactly in step with
`scrollLeft`. This CSS/test pairing predates the content-sets work
(`8d87878`, `320992e`) — not caused by it.

**Fix direction (undecided):** either the CSS is wrong (room headers should
also pin horizontally, like a frozen spreadsheet column, as you scroll) or
the test's expectation is wrong (room headers were only ever meant to pin
vertically, and the test should assert on `.corner`/`.timeLabel` — which do
have `left: 0` — instead). Decide the intended UX before fixing either side.

## Flaky: "nav links to the schedule page, which renders events"

**Found:** 2026-07-26, same verification pass.

`e2e/app.spec.ts`'s basic schedule-nav test failed once when run for real
(`pnpm test:e2e` in a real terminal), but the identical flow (click Schedule
link → heading visible → list item visible) reproduced correctly every time
when walked through manually via browser automation against
`pnpm build && pnpm preview`.

**Suspected cause:** a timing/first-load race (e.g. service-worker
registration or the PWA update-prompt) rather than a real functional
regression.

**Next step:** re-run `pnpm test:e2e` a few times to confirm it's actually
flaky rather than a one-off fluke; if it recurs, look at SW registration
timing on that route.
