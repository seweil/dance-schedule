# Make `event-schedule.xlsx` optional; drop it for MotivateToSeattle

## Context

For a simple event like MotivateToSeattle (one venue, no parallel non-dance
programming beyond meals/breaks that already show on the dance-schedule
pages), the flat "Event Schedule" page duplicates the detailed dance
schedule's own coverage — there's nothing on it that isn't better shown on
Room/Caller Schedule already. Goal: remove `event-schedule.xlsx` for this
event specifically (move it to `scratch/`, the existing "not read by the
build" staging convention), and make the underlying mechanism a real,
general capability — **`event-schedule.xlsx` becomes optional for every
content set**, not just this one. When it's absent, the "Event Schedule"
page and its nav entry are omitted entirely, rather than the build failing.

This only touches `event-schedule.xlsx`/the Event Schedule page.
`dance-schedule.xlsx` (Room/Dancing-by-Level/Caller Schedule) is untouched
and stays required — this event still needs it.

## How omission actually works

`Nav`/`buildNavTree` already derive the nav menu generically from whatever
routes `vite-plugin-pages` produces (`docs/design/schedule-page.md`'s own
"Routing & nav integration" decision) — there's no separate nav-registration
step to also update. So the cleanest way to "omit the page" is to never let
the route exist in the first place, at the exact point `vite.config.ts`
already post-processes generated routes for the `home.md` → `/` remap
(`Pages({ onRoutesGenerated })`).

Confirmed by reading `vite-plugin-pages`'s own compiled source
(`node_modules/.../vite-plugin-pages/dist/index.js`): `onRoutesGenerated`'s
return value is exactly what `generateClientCode`/`stringifyRoutes` walks
to emit one `React.lazy(() => import("path"))` per route — filtering a route
out here means its component file is **never referenced by anything in the
build**, so `src/pages/10 event-schedule.tsx` (and therefore its
`virtual:schedule` import) never gets transformed at all when the route is
filtered. No fallback/empty-data handling is needed inside
`vite-plugin-schedule.ts` itself for this to work.

## Implementation

### `vite.config.ts`

- Add `import { existsSync } from 'node:fs'`.
- Near the existing `CONTENT_DIR` computation, add:
  ```ts
  const EVENT_SCHEDULE_FILE = path.join(process.cwd(), CONTENT_DIR, 'data', 'event-schedule.xlsx')
  const HAS_EVENT_SCHEDULE = existsSync(EVENT_SCHEDULE_FILE)
  ```
  Same `existsSync` pattern already used for optional per-set files (see
  `content-icons.ts`'s optional `icon.png` handling).
- In `Pages({ onRoutesGenerated })`, after the existing `home.md` → `/`
  remap loop, filter the event-schedule route out when absent:
  ```ts
  return HAS_EVENT_SCHEDULE
    ? routes
    : routes.filter((route) => !route.element?.endsWith('/10 event-schedule.tsx'))
  ```
- Only register `schedulePlugin` when the file exists:
  ```ts
  ...(HAS_EVENT_SCHEDULE ? [schedulePlugin({ dataDir: `${CONTENT_DIR}/data` })] : []),
  ```
  This is a deliberate belt-and-suspenders pair with the route filter, not
  redundant: if a future bug ever left the route in place despite a missing
  file, this makes `import 'virtual:schedule'` fail loudly ("failed to
  resolve import") instead of silently doing something wrong — consistent
  with this codebase's existing fail-loud conventions (e.g.
  `assertContentSetExists`).

### Content changes (MotivateToSeattle only)

- `git mv content/MotivateToSeattle/data/event-schedule.xlsx
  content/MotivateToSeattle/scratch/event-schedule.xlsx` — the existing
  "content author's own staging area, nothing in the build reads it"
  convention (`scratch/` already exists for this set with other material).
  Note: the working-tree copy carries along whatever's currently in it
  (your own in-progress edit from earlier), nothing is lost or reset.
- `content/MotivateToSeattle/pages/home.md`: remove the "Event Schedule"
  bullet from the "Other schedules" list (its link would otherwise 404).
  Room Schedule and Caller Schedule stay.

No changes needed to any other content set — `automated-testing`,
`backtrack2abq`, and `test` all keep their own `event-schedule.xlsx` and
keep showing the page exactly as today.

### Docs

- **`CLAUDE.md`**: mark `event-schedule.xlsx` optional in the project-structure
  comment block, one line noting omission behavior.
- **`docs/adding-a-new-event.md`** (step 3 and the folder-preview block):
  note the file is optional — if omitted, the "Event Schedule" page and its
  nav link don't appear at all, rather than showing empty.
- **`docs/design/schedule-page.md`**: add a new decision entry (after
  "Routing & nav integration") — "`event-schedule.xlsx` is optional,
  omitted via `onRoutesGenerated` route filtering" — covering the
  MotivateToSeattle motivation, the route-filtering mechanism (with the
  `vite-plugin-pages` internals finding above), and why `schedulePlugin`
  is also conditionally registered rather than relying on the route filter
  alone.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — unaffected (the
  `automated-testing` fixture used by tests keeps its file), confirms no
  regressions.
- `pnpm build` (all four sets) — confirms MotivateToSeattle builds
  successfully with no `event-schedule.xlsx` present, and the other three
  sets are unaffected.
- `pnpm test:e2e` — full suite; all existing schedule-page e2e coverage
  targets `automated-testing` only, so should pass unchanged.
- Live check via `pnpm preview`: MotivateToSeattle's nav has no "Event
  Schedule" entry and its home page's link list no longer references it;
  the other three sets are unaffected. Also spot-check `CONTENT_SET=MotivateToSeattle
  pnpm dev` doesn't error on startup.
