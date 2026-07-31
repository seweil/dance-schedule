1# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

_TODO: one or two sentences on what this app does and who it's for._

A TypeScript Progressive Web App (PWA) — installable, works offline, and passes
Lighthouse PWA criteria.

Significant architectural decisions are recorded in `docs/design/<topic>.md`
as living design docs — see `docs/design/README.md` for the convention
(context, sub-problems checklist, decisions with rationale, open questions).
Check there for the reasoning behind a past decision before re-deriving it.

## Stack

- **Language:** TypeScript (strict mode)
- **Framework:** React
- **Build tool:** Vite (`vite-plugin-pwa` for service worker + manifest generation)
- **Package manager:** pnpm — always use `pnpm`, never `npm`/`yarn`. Commit `pnpm-lock.yaml`.
- **Testing:** Vitest (+ `@testing-library/react` for component tests) for units;
  Playwright for E2E and PWA-behavior tests (offline mode, service worker, install flow)
- **Linting/formatting:** ESLint + Prettier
- **Content/routing:** pages and the nav menu are generated from markdown files in
  `content/<content-set>/pages/` — see "Content pipeline" below

## Commands

```bash
pnpm install          # install dependencies
pnpm dev              # start dev server
pnpm build            # type-check + production build
pnpm preview          # serve the production build locally (needed to test SW/offline behavior)
pnpm test             # run unit tests (Vitest)
pnpm test:watch       # run unit tests in watch mode
pnpm test:e2e         # run Playwright tests against the built/previewed app
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm lint:fix         # eslint --fix
pnpm dev:test         # start dev server against the "test" content set (fixture data)
pnpm build:test       # type-check + production build of the "test" content set
```

Note: Vite's dev server does not register the service worker the same way production
does. Always verify PWA behavior (offline mode, install prompt, update flow) against
`pnpm build && pnpm preview`, not `pnpm dev`.

## Project structure

```
docs/
  design/
    README.md                 # design-doc convention (see "Project overview" above)
    <topic>.md                # one living design doc per architectural topic
content/
  config.yaml             # top-level, shared — defaultContentSet used when CONTENT_SET
                          # is unset (single-set dev/build:test), AND which set is also
                          # mirrored unprefixed at "/" in a production `pnpm build`
                          # (every set publishes, see "Content pipeline" below); see
                          # docs/design/content-config.md
  <content-set>/          # one directory per content set (any name) — for a single Vite
                          # process, active set is chosen by the CONTENT_SET env var,
                          # falling back to config.yaml's defaultContentSet; see
                          # docs/design/content-sets.md and docs/design/content-config.md.
                          # Two always exist:
                          #   automated-testing/ — the default set; a permanent, stable
                          #           sample event (not real production data — both unit
                          #           and e2e tests assert directly against its content,
                          #           see docs/design/content-sets.md). Clone it as a
                          #           starting template for an actual real event, per
                          #           docs/adding-a-new-event.md, then repoint
                          #           content/config.yaml's defaultContentSet.
                          #   test/ — deliberately edge-case-flavored fixture set —
                          #           `pnpm dev:test` / `pnpm build:test`
    config.yaml             # per-set feature flags (e.g. combineA1A2) AND manifest
                            # name/shortName overrides; see docs/design/content-config.md
    icon.png                # optional — source app icon for this set (recommended
                            # ≥1024x1024 square); downsampled at build time into every
                            # size the PWA manifest needs. Falls back to a generated
                            # placeholder if absent — see docs/design/content-config.md
    pages/
      index.md                  # → route "/"
      2 installation.md         # → route "/installation" (nav-sorted 2nd)
      assets/                   # images referenced by the markdown files above
                                 # (only present if a set's pages reference images)
    data/
      event-schedule.xlsx     # schedule source data — see "Schedule data pipeline" below
      dance-schedule.xlsx     # multi-day/multi-room convention schedule source data —
                              # see docs/design/dance-schedule.md (debug page only so
                              # far at /debug/dance-schedule — no real page renders
                              # this yet)
    scratch/                # optional — a content author's own staging area for raw
                            # material (e.g. a higher-resolution source photo before
                            # cropping) that isn't itself built content. Nothing in the
                            # build reads this directory's name or contents — only
                            # pages/, data/*.xlsx, icon.png, and config.yaml are ever
                            # read from a content set — so anything placed here is
                            # inert to `pnpm build`/`pnpm dev`. Committed like any other
                            # content file (not gitignored), so originals persist for
                            # future re-edits instead of being re-crawled/re-downloaded.
src/
  components/     # reusable UI components (incl. ZoomableImage, Nav)
  pages/          # hand-written routes, auto-routed like content pages (e.g.
                  # "10 event-schedule.tsx") — see "Schedule data pipeline" below
  hooks/          # custom React hooks
  lib/            # framework-agnostic utilities (incl. buildNavTree, buildSchedule)
  sw/             # service worker source (if not fully generated by vite-plugin-pwa)
  types/          # shared TypeScript types
scripts/
  build-content-sets.mjs  # `pnpm build` orchestrator — runs one `vite build` per
                          # content set (plus one extra for the default set's
                          # unprefixed mirror); see "Content pipeline" below
e2e/
  *.spec.ts       # Playwright tests
```

## Content pipeline

For a single Vite process — `pnpm dev`, `pnpm dev:test`, `pnpm build:test` — which
content set is active is chosen by the `CONTENT_SET` env var read in `vite.config.ts`
(default `real` if unset) — see "Project structure" above and
`docs/design/content-sets.md`. `pnpm build` (production) instead publishes **every**
content set at once, each under its own `/<content-set>/` URL prefix, plus the
default set (`content/config.yaml`'s `defaultContentSet`) additionally mirrored
unprefixed at `/` — orchestrated by `scripts/build-content-sets.mjs`, which runs one
`vite build` per set. Everything below refers to whichever single
`content/<content-set>/pages/` directory is currently selected in a given build.

Pages and the nav menu are generated from plain markdown files in that content
set's `pages/` directory — there is no hand-written route for a content page and
no frontmatter. It's a flat list of files (no further subfolders for `.md` files) —
each file's name becomes its route/nav label, one level deep. Its `assets/`
subfolder holds the images those files reference (only needed if any page
references an image); it isn't scanned for routes since `vite-plugin-pages` only
picks up the `.md` extension.

- **Naming**: content filenames are kebab-case (`getting-started.md`, not
  `Getting Started.md`) and may start with a sort-order number followed by a single
  space — `2 installation.md`. That `"<digits> "` prefix controls nav order only; it
  and the extension are stripped to produce both the route and the title-cased label
  (`2 installation.md` → route `/installation`, label "Installation"). Files with no
  prefix sort after prefixed ones, in filesystem order.
- **Routing**: `vite-plugin-pages` (configured in `vite.config.ts`) scans the active
  content set's `pages/` directory and turns each `.md` file into a route;
  `src/lib/buildNavTree.ts`'s `normalizeRoutes` then strips the order prefix from each
  route's path before it's registered (`App.tsx`), so the live route always matches
  the clean nav href — never the raw filename. This works identically in `pnpm dev`
  (HMR on file add/remove/rename) and in `pnpm build` (statically resolved) — no
  custom watch code.
- **Compilation**: `@mdx-js/rollup` compiles each `.md` into a React component
  (`format: 'md'` keeps JSX-in-content disabled — authors write plain markdown only).
- **Images**: write standard `![alt](./assets/relative.png)` — `rehype-mdx-import-media`
  rewrites relative paths into real Vite asset imports so they're hashed/optimized in
  the build (required for the PWA precache to work correctly). Content images live in
  that content set's `pages/assets/`, referenced with a `./assets/` prefix from each
  markdown file.
- **Image zoom**: every rendered `<img>` is automatically replaced with
  `src/components/ZoomableImage.tsx` (a `yet-another-react-lightbox` wrapper) via a
  global `MDXProvider` override in `App.tsx` — content authors don't add any markup
  for this, it's automatic. It also caps every content image at the page's own width
  (never wider, regardless of the source file's native resolution) and supports an
  opt-in smaller display size via a markdown image's standard `title` string —
  `![alt](./assets/photo.jpg "thumbnail")` — one of `thumbnail`/`small`/`medium`/
  `large` (`ZoomableImage.tsx`'s `SIZE_CLASSES`); any other title is left alone as an
  ordinary tooltip. Full size is still one tap away via the lightbox regardless of
  display size.
- **Nav menu**: `src/lib/buildNavTree.ts` derives a flat menu straight from the
  routes `vite-plugin-pages` generates — title = Title-cased filename (after
  stripping the order prefix), order = the numeric prefix (see Naming above), Home
  always first.

## Schedule data pipeline

Full rationale in `docs/design/schedule-page.md`; content-set mechanics in
`docs/design/content-sets.md`. **`docs/adding-a-new-event.md`** is a
semi-technical, user-facing how-to guide that duplicates the exact format
details below (column headers, accepted date/time formats, dance-schedule
cell syntax, `LEVEL_CODES`, `config.yaml` keys) for someone adding a new
content set — whenever any of that changes (parsing logic, level codes, or
the `config.yaml` schema), update that guide too, not just this file or the
design docs it otherwise stays in sync with.

The short version:

- The schedule/events page is generated from the active content set's
  `data/event-schedule.xlsx` (see "Content pipeline" above for how the content set
  is chosen — `schedulePlugin`/`danceSchedulePlugin` both take a `dataDir` option
  computed from `CONTENT_SET`), parsed at **build time** by a custom Vite plugin
  (`vite-plugin-schedule.ts`) into the `virtual:schedule` module — never shipped to
  the client, and automatically covered by the existing PWA precache since the
  parsed data ends up in the route's own JS chunk. Editing the spreadsheet requires
  a rebuild+redeploy to take effect.
- Date/time cells are parsed forgivingly (multiple date formats, AM/PM or 24-hour
  time, meridiem/year inference for ambiguous input) — see `src/lib/parseEventDate.ts`
  and `src/lib/parseTimeRange.ts` and their colocated table-driven tests, which are
  the living spec of every format supported. A row that still doesn't parse fails
  the build with the offending row identified.
- **`src/pages/` is now scanned by `vite-plugin-pages`** alongside `content/pages/`
  (see `vite.config.ts`), so a hand-written `.tsx` route (like the schedule page)
  gets picked up and appears in the nav exactly like a content page — same
  `"<digits> "` order-prefix filename convention, same `buildNavTree` logic, no
  special-casing needed in `Nav.tsx`.
- **Nav ordering convention**: prefix `10` (`src/pages/10 event-schedule.tsx`) is
  reserved for the Event Schedule page. Content pages using prefixes below `10` sort
  before it; any future page meant to sort after it should use a prefix of `10` or
  higher.
- Route files still need a default export (a file-based routing requirement), which
  is in tension with "prefer named exports" below — resolved by keeping the route
  file a thin `export { X as default } from '../components/X'` wrapper around a
  normally-named-exported component.

## Code conventions

- Prefer named exports over default exports.
- No `any` — use `unknown` and narrow, or define a proper type.
- Colocate a component's styles/tests next to the component file.
- Keep components presentational where possible; push data-fetching and side effects
  into hooks (`useX`) or `lib/`.
- Avoid premature abstraction — three similar call sites is fine; don't build a
  generic system until a fourth appears.

## Styling

- **CSS Modules** is the styling technology for components — built into Vite, no
  extra dependency, zero runtime cost. Each component that needs styles gets a
  colocated `ComponentName.module.css` next to `ComponentName.tsx`, imported as
  `import styles from './ComponentName.module.css'` and applied via
  `className={styles.foo}`.
- `src/index.css` is reserved for truly global concerns only: the font stack,
  resets, and shared CSS custom-property tokens (colors, spacing). Don't add
  component-specific rules there.

## PWA-specific guidance

- **Manifest**: generated per content set by `vite-plugin-pwa` (`vite.config.ts`'s
  `VitePWA({ manifest: {...} })`), not hand-authored — `name`/`short_name` come from
  that set's `content/<set>/config.yaml` (`manifest.name`/`manifest.shortName`,
  see docs/design/content-config.md), defaulting to "Dance Schedule" if unset.
  Icons are downsampled at build time (`content-icons.ts`, via `sharp`) from
  `content/<set>/icon.png` (optional — falls back to a generated placeholder) into
  every size the manifest needs, including an auto-padded maskable variant. There
  is no `public/` directory — Vite's `publicDir` is repointed per build at a
  generated, gitignored `generated-assets/<set>/`. Changes here affect
  installability — verify with Chrome DevTools → Application → Manifest after
  editing, at more than one content-set prefix if the change is set-specific.
- **Service worker**: use `vite-plugin-pwa`'s `generateSW` strategy unless there's a
  concrete need for custom runtime caching logic (`injectManifest`). Precache the app
  shell; use a network-first or stale-while-revalidate strategy for API calls, never
  cache-first for data that changes.
- **Update flow**: the app must handle new service worker versions gracefully — prompt
  the user to reload rather than silently swapping content under them. Don't use
  `skipWaiting`/`clientsClaim` without a corresponding "update available" UI.
- **Offline**: any new page or data-fetching path should degrade sensibly with no
  network — either serve cached data or show an explicit offline state, not a blank
  screen or unhandled fetch rejection.
- **Testing changes**: after touching manifest/SW/caching, run
  `pnpm build && pnpm preview` and cover the change with a Playwright test in `e2e/`
  — e.g. register the SW, reload, then `context.setOffline(true)` and assert the app
  shell still renders and cached routes still work. Use DevTools → Application
  (Manifest / Service Workers / Cache Storage panels) for manual spot-checks, but the
  Playwright test is what should catch regressions going forward.
- Treat Lighthouse PWA audit regressions as build-breaking, not optional cleanup.

## Testing

See `docs/testing.md` for the fuller picture: what each test layer catches,
what runs where (local/CI/Amplify), how to read CI results, and current
coverage/organization notes. Below is just guidance on how to write tests.

- Unit test hooks and `lib/` utilities directly with Vitest.
- Component tests use `@testing-library/react` — test behavior/output, not
  implementation details (avoid snapshot tests for anything with real logic).
- Don't mock `fetch`/service worker behavior in unit tests to fake offline support —
  that hides real bugs. Anything PWA-specific (offline, SW update flow, caching
  strategy) belongs in a Playwright test against the built/previewed app, not a
  jsdom mock.
- Playwright tests live in `e2e/`, run against `pnpm preview` (production build —
  the dev server doesn't register the service worker the same way).

## Before finishing a task

- `pnpm typecheck && pnpm lint && pnpm test` should pass.
- For UI or PWA-behavior changes (manifest, service worker, caching, offline
  handling), also run `pnpm build && pnpm test:e2e` — unit tests don't catch broken
  offline behavior or a broken install/update flow, only Playwright against the real
  build does.