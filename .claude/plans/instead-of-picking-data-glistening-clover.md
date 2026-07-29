# Publish all content sets at once, with directory name in the URL path

## Context

Today the app picks exactly **one** content set (`content/<set>/{pages,data,config.yaml}`)
per build, chosen via the `CONTENT_SET` env var or `content/config.yaml`'s
`defaultContentSet` (see `docs/design/content-sets.md`, `docs/design/content-config.md`).
Production (Amplify) always builds with `CONTENT_SET` unset, so only the `real` set
ever ships.

The goal is to publish **every** content set simultaneously, each reachable under a
URL path segment matching its directory name (`/real/...`, `/test/...`, and any future
set), with `content/config.yaml`'s `defaultContentSet` continuing to determine which
set is *also* mirrored unprefixed at `/` (confirmed with the user: the default set gets
duplicate routes, both at `/` and at `/<default>/`). A debug page
(`/debug/dance-schedule`) should also grow a row of links to every published set's own
copy of that page.

**Hard constraint:** `vite.config.ts` resolves exactly one `CONTENT_DIR` per Vite
process, consumed by four plugins (`Pages`, `schedulePlugin`, `danceSchedulePlugin`,
`contentConfigPlugin`) that each bake one set's data into that process's JS bundle.
There's no way for a single Vite build to emit multiple sets' data at once without a
much more invasive plugin rewrite. The natural fit — and what's planned below — is
**N+1 separate `vite build` invocations** (one per set at its own `/<set>/` prefix,
plus one extra for the default set unprefixed at `/`), merged into one `dist/` tree
afterward. This matches the repo's existing "build-time only, no runtime switching"
philosophy.

Two related bugs were found during investigation that must be fixed as part of this
work, since they'd otherwise silently break offline support and cache headers for
every non-default set:
- `vite.config.ts`'s `workbox.navigateFallback: '/index.html'` is absolute; once
  `base` varies per build, an offline navigation inside `/test/` would fall back to
  the *default* set's root `index.html` instead of `/test/index.html`.
- `amplify.yml`'s `customHeaders` patterns (`'index.html'`, `'sw.js'`, `/assets/**'`,
  etc.) are root-only and won't match `dist/real/index.html` etc., so the
  no-cache/long-cache header split (load-bearing for `UpdatePrompt`'s update
  detection) would silently stop applying to non-default sets.

## Approach

### 1. `content-config.ts` — add `listContentSets(root): string[]`
Reads `content/`'s subdirectories, sorted, ignoring non-directory entries (like
`content/config.yaml` itself). Closes the existing open question in
`docs/design/content-sets.md` ("no way to list/discover available content sets").
Add unit tests in `content-config.test.ts` mirroring its existing `mkdtempSync` test
pattern.

### 2. New `vite-plugin-content-sets.ts` (repo root) — `virtual:content-sets`
Modeled on `vite-plugin-content-config.ts`. Resolves to
`{ sets: string[]; defaultSet: string; activeSet: string }` (`sets` from
`listContentSets`, `defaultSet` from the top-level config, `activeSet` = the
`CONTENT_SET` this particular build process was compiled with). No dev-watch needed
(the set of `content/` directories changing mid dev-session is out of scope — add
watch support later if it turns out to matter).

Add matching types: `src/types/contentSets.ts` (`ContentSetsData` interface) and
`src/types/virtual-content-sets.d.ts` (ambient module declaration) — mirror the
existing `contentConfig`/`virtual-content-config.d.ts` pair exactly.

### 3. `vite.config.ts`
- Add `const BASE_PATH = process.env.BASE_PATH || '/'` next to the existing
  `CONTENT_SET`/`CONTENT_DIR` computation.
- Add `base: BASE_PATH` to the `defineConfig({...})` object (currently unset, so this
  is a new top-level key, defaulting to today's behavior when unset).
- Add `contentSetsPlugin({ defaultSet: topLevelContentConfig.defaultContentSet, activeSet: CONTENT_SET })`
  to the `plugins` array, next to `contentConfigPlugin(...)`.
- **Delete** the `navigateFallback: '/index.html'` line from the `workbox` block —
  `vite-plugin-pwa`'s own default (`'index.html'`, relative) is base-aware and
  resolves correctly per build; the current absolute override is the bug described
  above.

No changes needed to `Pages`/`schedulePlugin`/`danceSchedulePlugin`/
`contentConfigPlugin` — they still key off `CONTENT_DIR`/`CONTENT_SET`, orthogonal to
`BASE_PATH`.

### 4. `src/App.tsx`
Add `basename={import.meta.env.BASE_URL}` to `<BrowserRouter>`. This is the only
change needed for client-side routing to work correctly under any prefix — Vite's
stock `BASE_URL` env exposure is tied 1:1 to the `base` config, no custom detection
code required. `~react-pages` routes, `debugRoutes`, `utilityRoutes` all stay
basename-relative and need no edits.

### 5. `src/components/RawDanceScheduleDebugPage.tsx`
Import `virtual:content-sets` and render a links row above the `<h1>`, listing every
published set, annotating the default and the currently-active one, each as a plain
`<a href="/<set>/debug/dance-schedule">` — **not** react-router's `<Link>`, since
following it crosses to a genuinely separate build/bundle, not a client-side route.
Every set (including the default) links to its canonical prefixed URL; the
unprefixed `/debug/dance-schedule` root mirror is a convenience duplicate, not what
this list points at. Optionally add the active set to the `<h1>` text for clarity
after following a cross-set link.

### 6. `public/manifest.webmanifest`
Change `id`, `start_url`, `scope` from `"/"` to `"."`, and all three icon `src`
values from `/icons/icon-*.png` to `icons/icon-*.png` (relative). Per the Web App
Manifest spec, relative URLs resolve against the manifest's own URL, so this single
static file (copied verbatim into every build via the public dir) works correctly
whether served from `/`, `/real/`, or `/test/`, without per-set variants. `id: "."`
matters so the three deploys register as distinct installable PWA identities instead
of colliding.

`index.html` needs no edit — Vite's build automatically rewrites root-absolute
`href`/`src` references to public-dir files and the JS entry module according to the
configured `base`. Verify this empirically (see Verification) rather than assuming.

Per discussion: leave `name`/`short_name` shared/identical across all sets for now
(installed icons for different sets will look identical) — note as an explicit open
question in `docs/design/content-sets.md` for future work, not solved here.

### 7. New orchestration script — `scripts/build-content-sets.mjs`
New `scripts/` directory. Plain ESM `.mjs` (package.json already has
`"type": "module"`), duplicating the small amount of `content-config.ts` logic it
needs (listing `content/` subdirectories, reading `defaultContentSet`) rather than
importing it, since that file is TS and can't run outside Vite's transform without
extra tooling — mirrors the existing `contentSetDir` duplication precedent already
in the codebase.

Algorithm:
- List content sets and the default set; validate the default actually exists;
  reject any set name colliding with a reserved top-level build output path
  (`assets`, `icons`, `index.html`, `manifest.webmanifest`, `sw.js`, `workbox-*`).
- Build into an isolated `dist-build-tmp/` directory, never `dist/` directly: for
  every set, `vite build --outDir dist-build-tmp/<set>` with
  `CONTENT_SET=<set> BASE_PATH=/<set>/`; then one extra build for the default set
  into `dist-build-tmp/` (root) with `BASE_PATH=/`.
- Only after **all** N+1 builds succeed: remove the old `dist/` and rename
  `dist-build-tmp/` → `dist/` (a single filesystem swap). This guarantees `dist/`
  is always either fully-old or fully-new — never partially published if a build
  fails partway. On failure, leave `dist-build-tmp/` in place for postmortem
  inspection (next run's cleanup removes it).
- Invoke `vite` via its resolved `node_modules/.bin/vite` path rather than assuming
  it's on `PATH`.
- Add `dist-build-tmp/` to `.gitignore` alongside the existing `dist` entry.

Update `package.json`:
```
"build": "tsc --noEmit && node scripts/build-content-sets.mjs",
```
`tsc --noEmit` stays a single upfront gate (content-set-independent). `build:test`,
`dev`, `dev:test`, `preview` stay **unchanged** — `BASE_PATH` only matters for the
multi-set production build; `build:test` remains a fast single-set local-iteration
path (`BASE_PATH` unset defaults to `/`, identical to today).

### 8. `amplify.yml`
Fix the `customHeaders` patterns to match nested paths:
`'**/index.html'`, `'**/manifest.webmanifest'`, `'**/sw.js'`, `'**/assets/**'`,
`'**/workbox-*.js'` (recurse into `real/`, `test/`, future sets, and the root).

### 9. Docs
- `docs/design/content-sets.md`: add a decision documenting the shift from "pick one
  set" to "publish all sets, default mirrored unprefixed at `/`"; resolve the
  "no way to list/discover content sets" open question (point at `listContentSets`
  / `virtual:content-sets`); add the reserved-name collision caution and the
  deferred manifest-naming-differentiation item as open questions.
- `docs/design/content-config.md`: cross-reference that `defaultContentSet` now also
  picks the unprefixed-mirror set, not just the `CONTENT_SET`-unset fallback.
- `docs/design/hosting.md`: add a decision documenting that direct/deep-link
  navigation into a prefixed set (e.g. `/real/installation`) requires **one
  additional Amplify console rewrite rule per content-set path segment**
  (`</real\/[^.]+$/> → /real/index.html`, and similarly per set), manually
  maintained whenever a content set is added or removed — mirroring the existing
  "not expressible in the repo" pattern already documented for the root SPA
  fallback rule. This is a manual follow-up step outside this change's scope.
- `CLAUDE.md`: update the "Content pipeline" intro line — production builds now
  publish every set; `CONTENT_SET`/`defaultContentSet` still governs per-process
  single-set behavior for `dev`/`dev:test`/`build:test`.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — covers new `listContentSets` unit
  tests.
- `pnpm build` — inspect `dist/` (`find dist -maxdepth 2`): expect
  `dist/index.html`, `dist/assets/`, `dist/manifest.webmanifest`, `dist/sw.js` at
  root, plus matching `dist/real/{...}` and `dist/test/{...}` trees.
- `pnpm preview`, then in a browser: check `/`, `/real/`, `/test/`,
  `/test/debug/dance-schedule` render correct distinct content; follow the debug
  page's cross-set links and confirm they hard-navigate (full reload) to the right
  prefix; DevTools → Application → Manifest at each prefix confirms
  `start_url`/`scope`/`id` resolve under that prefix without colliding; → Service
  Workers panel shows independently-scoped registrations, not one fighting over `/`.
- Add Playwright coverage (`e2e/content-sets.spec.ts`): direct navigation to
  `/test/debug/dance-schedule` renders and links to `/real/debug/dance-schedule`;
  an offline-after-SW-active test scoped to `/test/` (register, reload, go offline,
  reload, assert content still renders) — this specifically exercises the
  `navigateFallback` fix, since a stale absolute fallback would serve the wrong
  bundle once offline. Per the existing `vite preview` limitation (no per-prefix SPA
  fallback locally, only Amplify would have one via the new console rule), avoid
  hard-navigating into an arbitrary deep client route under a prefix in tests — stick
  to real on-disk files and in-app client navigation.
