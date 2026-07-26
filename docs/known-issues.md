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

## PWA manifest: icons never added, description still a placeholder

**Found:** 2026-07-26, while verifying the Amplify Hosting deploy
(unrelated to hosting — pre-existing; DevTools → Application → Manifest
surfaced it against the live Amplify URL).

Chrome's manifest audit reports:
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`
  all fail to load (404)
- "No supplied icon is at least 144px square" / "Most operating systems
  require square icons" — a consequence of the above, not a separate defect
- `description` field renders as the literal string
  `"TODO: one-line description of what this app does."`

**Root cause:** `public/manifest.webmanifest` references all three icon
paths correctly, but `public/icons/` only contains a `.gitkeep` — the actual
PNG files were never added (confirmed both in the source tree and in a local
`dist/` build). The `description` field is the unfilled placeholder text,
same wording as the still-TODO project-overview line in `CLAUDE.md`.

**Not just cosmetic:** per `CLAUDE.md`, PWA audit regressions are meant to
be build-breaking, not optional cleanup — a missing valid icon set is a real
installability gap (affects the actual "Add to Home Screen" / install
experience), not merely a "richer UI" nice-to-have.

**Fix direction:** design/export real 192×192, 512×512, and a maskable
512×512 icon (with safe-area padding per Chrome's maskable-icon guidance),
add them under `public/icons/`, and replace the `description` placeholder
with a real one-line summary once the project overview in `CLAUDE.md` is
also written (same TODO, two places).

**Lower priority (same audit pass, cosmetic only):** no manifest
`screenshots` entries with `form_factor: "wide"` (desktop) or without/other
than `wide` (mobile) — only affects the "richer install UI" presentation,
not installability itself. Worth doing once real screenshots exist, not
urgent.

## Future work: native "Install" button on Chrome/Android via `beforeinstallprompt`

**Raised:** 2026-07-26, while writing the Installation page's manual
instructions ("tap the ⋮ menu → Add to Home screen").

Chrome/Android (and other Chromium browsers) fire a `beforeinstallprompt`
event when the page is installable, which can be captured and deferred to
show a custom "Install" button that triggers the browser's native install
prompt directly — nicer than asking the user to find the menu item
themselves. iOS Safari has no equivalent API (no installability detection,
no programmatic prompt), so manual instructions stay required there
regardless.

**Why deferred:** manual instructions are correct and sufficient for now;
this is a UX polish item, not a gap. No standard package is worth adding for
it (surveyed in conversation — the install-prompt ecosystem is thin and
fragmented; the one community option, `pwa-install`, is an unofficial web
component and would mean handing install UI/copy to a third-party dependency
instead of this repo's hand-editable content).

**Direction when picked up:** a small custom hook (listen for
`beforeinstallprompt`, call `.preventDefault()`, store the event, expose a
`promptInstall()` that calls `event.prompt()`) — Android/Chrome only, ~15
lines, no dependency needed. Would need to live in a component (not the
plain-markdown Installation page), likely surfaced as a button in `Nav` or
on the Installation page itself once that page can host interactive
elements again.
