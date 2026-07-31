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
options shape (here the content set's own root, e.g. `content/automated-testing`, not
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
false, combineC3BC4: false } }`; malformed, or either `features.combineA1A2`/
`features.combineC3BC4` not a boolean → throws.

### `content/automated-testing/config.yaml` and `content/test/config.yaml` intentionally differ
**Why:** Both combine A1/A2 (`combineA1A2: true`) — the recommended default
per `docs/adding-a-new-event.md`, and long-standing behavior for this sample
set. Only `test`'s `combineC3BC4: true` additionally exercises the "C3B+"
merged-slot behavior; `automated-testing`'s `combineC3BC4: false` keeps that
one flag off specifically so `e2e/dance-schedule.spec.ts`'s hardcoded C3B/C4
slot indices stay stable, rather than needing a second Playwright project —
see `docs/design/dance-schedule.md` for the slider-side design (the
`LevelSlot` concept these flags drive).

## Decisions (continued)

### `defaultContentSet` now also picks which set is mirrored unprefixed at `/`
**Why:** See `docs/design/content-sets.md`'s "every content set publishes
at once" decision — production builds now publish every `content/<set>/`
under its own `/<set>/` URL prefix, and `defaultContentSet` additionally
determines which one of those also gets a second, unprefixed build at `/`.
This is in addition to its original role (the `CONTENT_SET`-unset fallback
for `pnpm dev`/`build:test`), not a replacement for it.

## Decisions (continued)

### Each content set gets its own PWA manifest `name`/`short_name` and icon
**Why:** Every published content set (`docs/design/content-sets.md`) used to
share one static `public/manifest.webmanifest` and one static icon file —
installed home-screen icons for `automated-testing` and `test` looked identical, an
explicit open question logged there. Only `name`/`short_name` became
per-set config (a new `manifest:` key in `content/<set>/config.yaml`,
sibling to `features:`) — colors/display/layout stay fixed/shared, since
the actual need is installed-icon *identity*, not full re-branding, and
keeping the config surface small avoids premature generality.

### `manifest.webmanifest` is generated (`vite-plugin-pwa`'s `manifest` option), not hand-authored
**Why:** `vite-plugin-pwa`'s `manifest` option, given a real object (not
`false`), computes `manifest.webmanifest` itself and auto-injects a
`base`-aware `<link rel="manifest">` into the built `index.html` — so
`index.html`'s manual `<link rel="manifest">` was removed (a real object
would otherwise produce two manifest links). `name`/`short_name` come from
a new `loadContentManifestStrings(root, contentDir)` (`content-config.ts`)
— a plain synchronous function, not a `virtual:*` module, since (unlike
`features.combineA1A2`) these strings are only ever needed at build time to
construct `vite.config.ts`'s `VitePWA({ manifest })` object, never by
client code; shipping them to the client bundle would be pointless. Missing
`content/<set>/config.yaml` or missing `manifest:` section → defaults to
`{ name: 'Dance Schedule', shortName: 'Dance Schedule' }` (today's
pre-existing values); present but not strings → throws, matching
`loadContentConfigData`'s existing validation style. `content/automated-testing/config.yaml`
has no `manifest:` section (relies on the defaults, which already match);
`content/test/config.yaml` overrides to `Dance Schedule (Test)` / `DS Test`
so it's visually distinguishable once installed alongside `automated-testing`.

### Icons are generated per set at build time from a single source image (`content-icons.ts`)
**Why:** `vite-plugin-pwa` doesn't generate/copy icon files itself (that
needs the separate, uninstalled `@vite-pwa/assets-generator` package) —
files referenced in `manifest.icons[].src` must simply already exist under
Vite's `publicDir`. Since each set needs *different* icons, and `publicDir`
can only point at one directory, `vite.config.ts`'s `defineConfig` became
an async factory (`defineConfig(async () => {...})`) that generates that
content set's icons into `generated-assets/<set>/icons/` (gitignored,
regenerated on every `vite` invocation — cheap, keyed by `CONTENT_SET`) and
points `publicDir` there, entirely replacing the old static `public/`
directory (deleted — it held nothing else). `content-icons.ts`'s
`generateContentSetIcons()` takes a single source image,
`content/<set>/icon.png` (sibling to `config.yaml`/`pages/`/`data/`,
**optional**, recommended at least 1024×1024 — comfortable headroom above
the 512px this pipeline actually needs, so downsampling stays sharp even if
a larger size is added later; present but under 512×512 in either dimension
→ throws, since upsampling would produce a blurry icon), and downsamples it
via `sharp` (new devDependency — build-time/Node-only, same category as
`read-excel-file`/`yaml`) into the three sizes the manifest needs:
`icon-192.png`/`icon-512.png` (`purpose: "any"`, plain resize) and
`icon-maskable-512.png` (`purpose: "maskable"`) — composited at ~70% scale
centered on an opaque `#ffffff` canvas (standard maskable safe-zone
guidance, so OS icon masks — circle, squircle, rounded square — don't crop
the artwork; auto-generated from the same single source rather than
requiring separate hand-padded art).

### Missing `icon.png` falls back to a generated placeholder, not a build failure
**Why:** No real artwork existed for any content set at the time this was
built (`content/automated-testing/icon.png` was added later; `content/test/`
still relies on the placeholder, matching its role as a stable fixture, not
a set that needs real branding). Rather than hard-requiring `icon.png`
(which would've left `pnpm build` broken out of the box), `content-icons.ts`
falls back to rendering a simple placeholder — a
solid `#0f172a` square with the content set's uppercased first letter,
rasterized from an inline SVG string via `sharp` (no extra font/canvas
dependency) — through the exact same downstream resize/maskable pipeline a
real source image would go through. Dropping in a real
`content/<set>/icon.png` later requires no pipeline changes; the real file
is simply preferred whenever present.

## Open questions

- Should there be more feature flags of this shape in the future, and if
  so, does `ContentFeatures` need a more general/extensible shape than one
  boolean field per flag? Deferred until a second real flag exists.
- Should `content/config.yaml` also support content-set discovery (list
  known sets), tying into the still-open discoverability question in
  `docs/design/content-sets.md`? Not addressed here — this doc only closes
  the "validate the target exists" half of that question.
