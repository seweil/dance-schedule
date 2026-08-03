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
true, combineC3BC4: true } }` — matching `docs/adding-a-new-event.md`'s
documented recommendation to combine both pairs unless an event genuinely
needs them split, so omitting `config.yaml` (an explicitly encouraged
shortcut) doesn't silently produce the opposite of that recommendation (see
`docs/known-issues.md`'s now-resolved "combineA1A2 silently defaults to
false" item). Malformed, or either `features.combineA1A2`/
`features.combineC3BC4` not a boolean → throws.

### `content/automated-testing/config.yaml` and `content/test/config.yaml` both combine both pairs — the *uncombined* case is unit-test-only
**Why:** Every real content set (including `automated-testing`, which despite
its name is never deployed to a real event — see its own `config.yaml`
comment) combines both pairs, matching the built-in default and
`docs/adding-a-new-event.md`'s recommendation. An earlier version of
`automated-testing/config.yaml` explicitly overrode `combineC3BC4` to `false`
specifically so `e2e/dance-schedule.spec.ts` could exercise the *uncombined*
slot-index case live — but that made an artificial, never-real-event
combination a load-bearing part of the sample set's config purely to serve
one test file, and `e2e/dance-schedule.spec.ts`'s own slot-index assertions
are written against whatever `getLevelSlots` produces for these flags, not a
guarantee of any particular flag value. The uncombined case (and the
individually-combined and both-combined cases) has thorough, faster-running
coverage already in `src/lib/levelOrder.test.ts`,
`src/lib/computeDanceScheduleLevelLayout.test.ts`, and
`src/hooks/useDanceScheduleFilters.test.ts` — see
`docs/design/dance-schedule.md` for the slider-side design (the `LevelSlot`
concept these flags drive).

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

### `testFixture` marks a set as a fixture, not a real event — an explicit flag, not a hardcoded name check
**Why:** The `/events` landing page (`docs/design/content-sets.md`) needs to
sort test-flavored sets (`automated-testing`, `test`) after real ones. Those
two are special today purely by *naming convention*, documented in
`CLAUDE.md` but not machine-readable — hardcoding those two literal strings
in the sort logic would work today but silently misclassify any future
differently-named fixture set. `isTestFixtureContentSet(root, contentDir)`
(`content-config.ts`, sibling to `loadContentManifestStrings`) reads a new
optional top-level `testFixture: true` key from `content/<set>/config.yaml`
— missing file or missing key → `false`, same zero-config-parity fallback
style as every other value this file reads. Set `true` only in
`content/automated-testing/config.yaml` and `content/test/config.yaml`; a
real event's `config.yaml` never needs it.

### The events landing page reads every set's config via `virtual:content-sets`, not the build orchestrator
**Why:** No single `vite build` invocation loads another content set's
*pages/data* (each is scoped to one `CONTENT_SET`) — but `config.yaml` reads
are cheap and already happen per-set for the PWA manifest, so
`vite-plugin-content-sets.ts`'s `virtual:content-sets` module (previously
just directory names, `docs/design/content-sets.md`) now also calls
`loadContentManifestStrings`/`isTestFixtureContentSet` for every listed set,
not just the active one — giving every build (any one of the N+1 `vite
build` runs) the same complete, display-ready list. This closes the
discoverability open question below without touching
`scripts/build-content-sets.mjs` at all: the orchestrator still just runs
one `vite build` per set and merges output, unaware of the landing page's
existence.

### `danceSchedule.roomOrder` — a per-event override for the dance-schedule room-columns view's column order

**Why:** The room-columns view (`/dance-schedule`) defaulted to ordering its
room columns by their first appearance in the source spreadsheet — a side
effect of the parser, not a considered choice. Per direct product decision,
the default is now increasing median dance level (average as tiebreak,
see `docs/design/dance-schedule.md`'s "Room-columns order" decision for the
algorithm), with a new `danceSchedule.roomOrder` key (sibling of
`features:`/`manifest:`) letting an event either opt back into spreadsheet
order (`roomOrder: spreadsheet`) or specify an exact order
(`roomOrder: [Room A, Room B, ...]`). Reaches client code the same way
`features.*` already does — a new optional `danceSchedule?: { roomOrder?
}` field on `ContentConfigData`, read by the same
`virtual:content-config` module (`vite-plugin-content-config.ts`'s
`readRoomOrder`, mirroring `readBooleanFeatureFlag`'s shape-validation
style: `undefined` → default; `'spreadsheet'` → passthrough; array of
strings → passthrough; anything else → throws).

**The explicit-array case needs a second, separate validation pass that
can't live in this plugin:** confirming an explicit list names every real
room requires knowing every room name across the whole event, which lives
in `dance-schedule.xlsx`, parsed by the entirely separate
`vite-plugin-dance-schedule.ts` — this plugin only ever sees `config.yaml`.
Rather than duplicate the shape-validation logic in two places (risking the
two copies drifting apart), `loadContentConfigData` was **exported** from
this file so `vite-plugin-dance-schedule.ts` can call it directly once it
has the full parsed session list, then run the actual completeness check
(`validateRoomOrderConfig`, `src/lib/deriveRoomOrder.ts`) against it. See
that file's own doc section for the full mechanics (the new `contentDir`
plugin option, the added `config.yaml` watch).

### Dev-only env-var overrides for previewing a different config.yaml value

**Why:** `config.yaml` is one value per content set, so previewing e.g.
`combineA1A2: false` or a different `danceSchedule.roomOrder` today meant
hand-editing the active set's `config.yaml` and remembering to revert it
afterward — the same ad hoc practice already used (and discarded) for
prior visual checks. Considered spinning up a dedicated content-set
directory per permutation instead, but rejected: every extra set is a real
entry in production's `pnpm build` (a whole extra `vite build` invocation)
and the `/events` landing page, even flagged `testFixture` — a real,
ongoing cost for what's fundamentally a one-off local preview need, not a
durable fixture worth publishing. Env vars — `COMBINE_A1A2`, `COMBINE_C3BC4`,
`DANCE_SCHEDULE_ROOM_ORDER` — read via plain `process.env`, mirror this
repo's existing `CONTENT_SET`/`BASE_PATH` pattern (`vite.config.ts`)
exactly: no dotenv, no `.env` file, no custom `import.meta.env` var
introduced (this repo deliberately has none of those). `DANCE_SCHEDULE_ROOM_ORDER`
also accepts the sentinel `"default"`, with no boolean equivalent needed,
so a developer can force the median-level algorithm even when the active
set's `config.yaml` itself sets `spreadsheet` or an explicit list — a
plain env var can't express "unset this field," so a sentinel value fills
that gap.

**Applied inside `loadContentConfigData` itself, not in either caller:**
this is the one function already shared by the client-shipped
`virtual:content-config` module and `vite-plugin-dance-schedule.ts`'s
`validateRoomOrderConfig` cross-check (see above) — overriding here means
both automatically see the same effective, overridden value with no risk of
one honoring an override the other misses (e.g. an overridden room list
still gets validated against the real room set, exactly like a
`config.yaml`-sourced one would). Applied as the last step, after the
file-or-default value is fully resolved, so an override behaves identically
whether `config.yaml` exists, is missing entirely, or simply omits the
field being overridden. A malformed value (anything other than `"true"`/
`"false"` for the boolean flags, or `"default"`/`"spreadsheet"`/a
comma-separated list for room order) throws, naming the env var — same
fail-loud style as a malformed `config.yaml` value.

**Dev-only, by construction, not by a special-cased guard:** these env vars
are read once at Vite config time, same as `CONTENT_SET`/`BASE_PATH`, so a
change needs a dev-server restart, not a hot-reload. No real content-set
build, `pnpm test`, or `pnpm test:e2e` invocation ever sets them, so leaving
them unset (the overwhelmingly common case) is byte-for-byte unchanged from
before this existed — there was no need to gate this behind `NODE_ENV`/
`import.meta.env.DEV` or restrict it to specific content sets. See
`docs/testing.md` for the practical usage example.

## Open questions

- Should there be more feature flags of this shape in the future, and if
  so, does `ContentFeatures` need a more general/extensible shape than one
  boolean field per flag? Deferred until a second real flag exists.
- ~~Should `content/config.yaml` also support content-set discovery~~ —
  resolved above: discovery lives in `virtual:content-sets`
  (`vite-plugin-content-sets.ts`), enriched with per-set `displayName`/
  `testFixture`, not in `content/config.yaml` itself.
