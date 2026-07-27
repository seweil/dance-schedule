# Content configuration (default content set + per-event feature flags)

## Context

Two related needs came up together: which content set (`content/<set>/`,
see `docs/design/content-sets.md`) loads by default should be configurable
instead of hardcoded to `'real'` in `vite.config.ts`; and individual real
events (content sets) sometimes want the dance-schedule level slider to
treat A1 and A2 as one combined stop — per the user, many events have too
few A1-only dances to bother distinguishing, but some do want them
separate. That second point is the key design driver: **this is a
per-event (per-content-set) setting, not a single global toggle**.

These are genuinely different kinds of config at different scopes:

- **Which content set to use by default** — must live *outside* any
  particular content set (it picks one), consumed purely at build time in
  Node (`vite.config.ts`), never shipped to the client.
- **Per-event feature flags** (starting with "combine A1/A2 on the
  slider") — live *inside* each content set's own directory (alongside
  its `pages/`/`data/`), and must reach client-side React code, so — per
  this repo's established pattern (`vite-plugin-schedule.ts`) — go through
  a build-time Vite plugin exposing a `virtual:*` module rather than a raw
  runtime file read (Node `fs` isn't available in the browser bundle).

## Sub-problems

- [x] File format and location for each scope — see Decisions
- [x] How the top-level default reaches `vite.config.ts` before
      `CONTENT_DIR` is even computed — see Decisions
- [x] How per-set feature flags reach client-side React code — see
      Decisions
- [x] Missing-file and malformed-file behavior — see Decisions
- [x] Whether an explicit `CONTENT_SET` env override gets the same
      validation as the config-file default — see Decisions

## Decisions

### YAML, one file per scope
**Why:** YAML per the user's request. `content/config.yaml` (top-level,
shared) holds `defaultContentSet`; `content/<set>/config.yaml` (per-set)
holds `features.*`. No YAML library existed in this repo — added `yaml`
(the same package Vite itself already optionally depends on) as a
**devDependency**, not a runtime dependency: parsing only ever happens in
Node/build context (`vite.config.ts`'s top-level code, and Vite plugin
`load()` hooks), the same category as `read-excel-file` — no yaml-parsing
code ships to the client either way.

### `content-config.ts`: a plain Node function, not a Vite plugin
**Why:** `defaultContentSet` is needed to compute `CONTENT_DIR` itself,
before any Vite plugin has even been constructed — there's no
`configResolved` hook available at that point in `vite.config.ts`. So
`loadTopLevelContentConfig(root)` (repo root, alongside
`vite-plugin-schedule.ts`) is a small, pure, synchronous function called
directly from `vite.config.ts`'s top-level code, mirroring how
`BUILD_NUMBER` is already computed synchronously at that same point via
`execSync`. Missing `content/config.yaml` → falls back to
`defaultContentSet: 'real'` (today's prior hardcoded behavior, unchanged).
Malformed YAML, or `defaultContentSet` not a string → throws, fail-loud
(this repo's consistent parsing philosophy, per
`docs/design/schedule-page.md`).

### `defaultContentSet` (and any `CONTENT_SET` env override) is validated against a real directory
**Why:** Closes two items already logged as open questions in
`docs/design/content-sets.md` — "should content-set resolution validate
the target directory exists" and the broader discoverability question.
`loadTopLevelContentConfig` checks `content/<name>/` actually exists and
throws a clear, named error if not (`content/config.yaml names content set
"xyz", but content/xyz doesn't exist`) rather than letting
`vite-plugin-pages`/`read-excel-file` produce a raw ENOENT deep inside
plugin resolution. The same check (`assertContentSetExists`) is applied to
an explicit `CONTENT_SET` env var override too, not just the config-file
default — a typo deserves the same fail-loud error regardless of where the
value came from.

### Per-set feature flags reach the client via a new `virtual:content-config` module
**Why:** Mirrors `vite-plugin-schedule.ts`'s `schedulePlugin()` exactly —
same `\0`-prefixed resolved id convention, same `{ dataDir: string }`
options shape (here the content set's own root, e.g. `content/real`, not
its `data/` subdir, since `config.yaml` sits alongside `pages/`/`data/`),
same eager-then-`configResolved`-corrected path resolution, same
`configureServer` + `watcher.add` + change listener + `invalidateModule` +
full-reload dev-watching, same fail-loud parsing. `vite-plugin-content-
config.ts` (repo root) + `src/types/contentConfig.ts` (the shared
`ContentConfigData`/`ContentFeatures` shape, imported by both the plugin
and `src/types/virtual-content-config.d.ts` — mirrors how
`src/types/danceSchedule.ts` is shared between
`vite-plugin-dance-schedule.ts` and `virtual-dance-schedule.d.ts`). Missing
`content/<set>/config.yaml` → falls back to `{ features: { combineA1A2:
false } }`; malformed, or `features.combineA1A2` not a boolean → throws.

### `content/real/config.yaml` and `content/test/config.yaml` intentionally differ
**Why:** `real`'s `combineA1A2: false` preserves the exact pre-existing
10-level slider behavior. `test`'s `combineA1A2: true` deliberately
exercises the merged-slot behavior in the fixture content set, so it's
covered by manual/live verification (`pnpm build:test && pnpm preview`)
without needing a second Playwright project — see
`docs/design/dance-schedule.md` for the slider-side design (the `LevelSlot`
concept this flag drives).

## Open questions

- Should there be more feature flags of this shape in the future, and if
  so, does `ContentFeatures` need a more general/extensible shape than one
  boolean field per flag? Deferred until a second real flag exists.
- Should `content/config.yaml` also support content-set discovery (list
  known sets), tying into the still-open discoverability question in
  `docs/design/content-sets.md`? Not addressed here — this doc only closes
  the "validate the target exists" half of that question.
