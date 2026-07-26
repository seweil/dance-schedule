# Dance Schedule

A TypeScript/React Progressive Web App (PWA) for browsing a multi-day dance
convention schedule — rooms, times, skill levels, and callers — installable
to a phone's home screen and usable offline.

For architecture rationale and past design decisions, see `CLAUDE.md` and
`docs/design/`. This file just covers how to build, run, and test it.

## Prerequisites

- Node.js (a recent LTS version)
- [pnpm](https://pnpm.io/) — this repo pins an exact version via the
  `packageManager` field in `package.json`; run `corepack enable` once and
  `corepack prepare` will pick it up automatically, or install that pnpm
  version yourself

Always use `pnpm`, not `npm`/`yarn` — `pnpm-lock.yaml` is the committed
lockfile.

## Getting started

```bash
pnpm install
pnpm dev
```

Opens the dev server (default: real content and schedule data — see
"Content sets" below).

## Building

```bash
pnpm build      # type-checks (tsc --noEmit), then produces dist/
pnpm preview    # serves that dist/ build locally, for testing the real build
```

`pnpm build` type-checks first, so a build failure is often a type error,
not a bundler error — read the top of the output.

## Testing

| Command | What it runs |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` — type errors only, no build output |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm test` | Unit tests (Vitest, jsdom) |
| `pnpm test:watch` | Unit tests in watch mode |
| `pnpm test:e2e` | End-to-end tests (Playwright, real Chromium) |

Before considering a change done, run `pnpm typecheck && pnpm lint &&
pnpm test`. For anything touching the manifest, service worker, caching, or
offline behavior, also run `pnpm build && pnpm test:e2e`.

### `pnpm test:e2e` builds and serves for you

Playwright's config (`playwright.config.ts`) has its own `webServer` entry
that runs `pnpm build && pnpm preview` and waits for it before starting —
you don't need to build/preview manually first. It runs against a single
desktop Chromium project, plus explicit mobile-viewport test blocks
(`devices['iPhone 13']` and `devices['iPhone 13 landscape']`) inside the
relevant spec files for small-screen-specific behavior.

## Dev vs. production builds — this distinction matters here

`pnpm dev` does **not** register the service worker the same way production
does. Anything PWA-related — install prompts, offline behavior, the "new
version available" update flow, caching — only behaves correctly against a
real production build:

```bash
pnpm build && pnpm preview
```

Use this (not `pnpm dev`) whenever you're checking installability, offline
mode, or an update-flow change. `pnpm test:e2e` already does this
automatically, per above.

## What's tested automatically vs. what needs a real browser

**Covered by `pnpm test` (Vitest + Testing Library, jsdom):**
- Pure `lib/` functions — date/time parsing, schedule-data parsing and
  layout computation, formatting. These have the most thorough coverage:
  table-driven test cases are the living spec for every date/time format
  `parseEventDate`/`parseTimeRange` accept.
- Hooks (e.g. `useDanceScheduleFilters`).
- Component rendering/behavior — what renders given props/state, not
  pixel-level appearance (no snapshot tests for anything with real logic,
  per this repo's convention).

**Covered by `pnpm test:e2e` (Playwright, real Chromium):**
- Navigation, content rendering, filtering (date/level-range/GCA toggle).
- Real service worker registration, offline mode (`context.setOffline`),
  and the update-prompt flow — this is the only layer that actually
  exercises the service worker; jsdom can't.
- Small-screen-specific behavior (mobile viewport blocks): the dance
  schedule grid's page-level scroll, sticky header pinning, and horizontal
  scroll-sync between the header and body — see
  `docs/design/dance-schedule-mobile-scroll.md` for why this needed real
  browser verification, not just unit tests, during development.

**Needs manual verification in an actual browser (not automated here):**
- Visual/design polish — colors, spacing, layout at a glance. Tests assert
  behavior and structure, not appearance.
- Real touch-gesture behavior — momentum scrolling, gesture chaining
  between nested scrollable regions. Playwright can drive scroll
  programmatically, but that isn't always equivalent to a real swipe; when
  in doubt, verify on an actual device or with a real trackpad/mouse-wheel
  gesture, not just `element.scrollLeft = x`.
- The actual "Add to Home Screen" install flow on a real iOS or Android
  device — iOS Safari in particular has no programmatic install API, so
  there's nothing to automate here at all (see `content/real/pages/2
  installation.md` for the manual steps this app documents to end users).
- Lighthouse PWA audits and DevTools → Application panel inspection
  (Manifest, Service Workers, Cache Storage) — useful for spot-checks
  alongside the Playwright PWA tests, per `CLAUDE.md`.

## Content sets

Which markdown pages and schedule spreadsheet data are active is chosen by
the `CONTENT_SET` env var (default `real`):

```bash
pnpm dev:test      # dev server against the "test" content set (edge-case fixture data)
pnpm build:test    # production build of the "test" content set
```

Full mechanics in `docs/design/content-sets.md`.

## Deployment

Hosted on AWS Amplify Hosting, auto-deploying on push to `main` — see
`docs/design/hosting.md` for the setup and rationale.
