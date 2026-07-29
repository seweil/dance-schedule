# Distinct PWA manifests (name + icon) per content set

## Context

The previous change (already implemented and committed — `583ff90`) made `pnpm build`
publish every content set under its own `/<set>/` URL prefix, each an independently
installable PWA. That work deliberately deferred one thing: every set's installed
icon looks identical, because all of them share one static `public/manifest.webmanifest`
and one static (never-actually-committed — `public/icons/` only has a `.gitkeep`)
icon file. `docs/design/content-sets.md` logged this as an explicit open question.

This change resolves it: each content set gets its own manifest `name`/`short_name`
(configured in that set's `config.yaml`) and its own app icon (a single source image
per set, downsampled at build time into the sizes the manifest needs). Per discussion:
- Only `name`/`short_name` become per-set config — color/display/layout fields stay
  fixed/shared, to avoid over-expanding the config surface for a need that's really
  about installed-icon identity, not full re-branding.
- The maskable icon variant (which needs safe-zone padding so OS icon masks don't
  crop it) is auto-generated from the same single source image, not hand-authored
  separately.
- No real artwork exists yet for any set. The pipeline generates a simple
  placeholder (solid color + the set's initial letter) per set when
  `content/<set>/icon.png` is absent, so `pnpm build` works out of the box today;
  dropping in a real `icon.png` later requires no pipeline changes.

## Key technical findings (from research)

- `vite-plugin-pwa`'s `manifest` option, when given a real object (not `false`),
  **automatically injects** a `base`-aware `<link rel="manifest">` tag into the
  built `index.html` — so the current manual `<link rel="manifest" href="%BASE_URL%manifest.webmanifest">`
  in `index.html` must be **removed** (a real `manifest` object would otherwise
  produce two manifest links).
- Icon files referenced in `manifest.icons[].src` must physically exist under
  Vite's `publicDir` (default `public/`) — the plugin doesn't generate/copy icons
  itself (that requires the separate, unin­stalled `@vite-pwa/assets-generator`
  package). Since each content set needs *different* icon files, `publicDir` must
  point somewhere set-specific, not the single shared `public/`.
- `manifest` can be a plain object computed ahead of time — nothing prevents
  `await`-ing an async icon-generation step in `vite.config.ts`'s top-level code
  (via `defineConfig(async () => {...})`) before constructing it.
- No image-processing library is installed. Adding `sharp` (devDependency —
  build-time/Node-only, same category as `read-excel-file`/`yaml`) is the natural
  choice.
- Since icon generation lives in `vite.config.ts` itself (keyed off the process's
  own `CONTENT_SET`), **`scripts/build-content-sets.mjs` needs no changes** — each
  of its N+1 `vite build` subprocesses triggers its own set's icon generation
  automatically, the same way `CONTENT_DIR`-based schedule parsing already does.

## Approach

### 1. Recommended source icon: `content/<set>/icon.png`, at least 1024×1024
A single square PNG (transparency OK), sibling to `config.yaml`/`pages/`/`data/` in
each content set's own directory — set-level metadata, not markdown-page content.
1024×1024 gives comfortable headroom above the largest size actually needed (512),
so downsampling stays sharp even if a larger manifest icon size is added later.
**Optional** — if absent, the pipeline generates a placeholder (see below). If
present but smaller than 512×512 in either dimension, the build fails loudly
(upsampling a too-small source produces a blurry icon, matching this repo's
fail-loud philosophy for other required build inputs).

### 2. New `content-icons.ts` (repo root) — the build-time image pipeline
- `generateContentSetIcons(root, contentDir, contentSet, outDir)`: loads the source
  (real `icon.png` if present and ≥512×512, else a generated placeholder — a solid
  `#0f172a` square with the content set's uppercased first letter, rendered via
  `sharp` from an inline SVG string, no extra font/canvas dependency needed), then
  writes three files into `outDir`:
  - `icon-192.png` (192×192, resize)
  - `icon-512.png` (512×512, resize)
  - `icon-maskable-512.png` (512×512 canvas filled with the shared background
    color, with the icon composited at ~70% scale centered — standard maskable
    safe-zone guidance, generated automatically rather than requiring separate art)
- Add `sharp` as a devDependency (`pnpm add -D sharp`).

### 3. `content-config.ts` — new `loadContentManifestStrings(root, contentDir)`
Plain synchronous function (not a Vite plugin, not a `virtual:*` module) — mirrors
`loadTopLevelContentConfig`'s pattern, since `name`/`short_name` are only ever
needed at build time to construct the `VitePWA({ manifest })` object, never by
client code (unlike `features.combineA1A2`, which does need to reach the client via
the existing `virtual:content-config` module — that module is untouched). Reads
`content/<set>/config.yaml`'s new top-level `manifest:` key (a sibling of the
existing `features:` key): missing file or missing `manifest:` section → defaults
to `{ name: 'Dance Schedule', shortName: 'Dance Schedule' }` (today's values,
zero-config parity); present but `name`/`shortName` not strings → throws, matching
`loadContentConfigData`'s existing validation style.

### 4. `vite.config.ts`
- `import path from 'node:path'` (not currently imported); `import { generateContentSetIcons } from './content-icons'`; `import { loadContentManifestStrings } from './content-config'` (added to the existing `content-config` import).
- Wrap the existing `defineConfig({...})` call in an async factory:
  `defineConfig(async () => {...})` — all the current top-level synchronous setup
  (`BUILD_NUMBER`, `topLevelContentConfig`, `CONTENT_SET`, `CONTENT_DIR`,
  `BASE_PATH`) stays exactly as-is; only the *new* work goes inside the factory.
- Inside the factory: compute `const generatedDir = path.resolve(process.cwd(), 'generated-assets', CONTENT_SET)`;
  `await generateContentSetIcons(process.cwd(), CONTENT_DIR, CONTENT_SET, path.join(generatedDir, 'icons'))`;
  `const manifestStrings = loadContentManifestStrings(process.cwd(), CONTENT_DIR)`.
- Return the config object with a new top-level `publicDir: generatedDir` (replaces
  the default `'public'` — see step 6, `public/` is retired entirely since 100% of
  its former content becomes generated) and the `VitePWA({...})` block's
  `manifest: false` replaced with a real object: same fixed
  `id`/`start_url`/`scope: '.'`, `display`, `orientation`, `background_color`,
  `theme_color`, `description` (kept as today's literal "TODO..." placeholder —
  out of scope per the name/short_name-only decision above) and `icons` array as
  today's `public/manifest.webmanifest`, but `name`/`short_name` from
  `manifestStrings`. `includeAssets: ['icons/*.png', 'icons/*.svg']` →
  `['icons/*.png']` (no svg icons exist or are generated).

### 5. `index.html`
Remove the manual `<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />`
line — `vite-plugin-pwa` now injects this itself, `base`-aware, once `manifest`
isn't `false`. The favicon/`apple-touch-icon` links stay unchanged (still
`%BASE_URL%icons/icon-192.png`, still correctly resolve since generated icons keep
the same `icons/icon-*.png` layout within the new `publicDir`).

### 6. Retire `public/`
Delete `public/manifest.webmanifest` and `public/icons/.gitkeep` (and the now-empty
`public/` directory) — every byte it used to hold is now generated per content set
into `generated-assets/<set>/`. Add `generated-assets` to `.gitignore` (alongside
`dist`, `dist-build-tmp`).

### 7. `content/real/config.yaml` / `content/test/config.yaml`
`real` gets **no new `manifest:` section** (relies on the defaults, which already
match today's values — demonstrates zero-config parity and keeps the diff minimal).
`test` gets an explicit override so it's visually distinguishable once installed:
```yaml
manifest:
  name: Dance Schedule (Test)
  shortName: DS Test
```

### 8. Docs
- `docs/design/content-config.md`: new "Decisions (continued)" section covering the
  `manifest:` config section, the icon pipeline (source convention/size, downsample
  approach, maskable auto-generation, placeholder fallback), and `publicDir`
  becoming per-set-generated instead of the static `public/`.
- `docs/design/content-sets.md`: resolve the "installed icons look identical"
  open question, pointing at the new decision above.
- `CLAUDE.md`: update "Project structure" (mention `content/<set>/icon.png`,
  remove now-stale `public/` references) and "PWA-specific guidance" (manifest is
  now generated per content set, not hand-authored).

## Verification

- New tests: `content-config.test.ts` gets a `loadContentManifestStrings` describe
  block (defaults, explicit override, malformed YAML, non-string values — mirrors
  existing test patterns in that file). New `content-icons.test.ts` runs
  `generateContentSetIcons` for real against a temp dir (including the
  placeholder-fallback path, since no `icon.png` needs to exist for that case) and
  asserts the three output files exist with correct pixel dimensions.
- `pnpm typecheck && pnpm lint && pnpm test` clean.
- `pnpm build`, then inspect `dist/real/manifest.webmanifest` vs
  `dist/test/manifest.webmanifest` — confirm distinct `name`/`short_name`, and that
  `dist/real/icons/icon-192.png` and `dist/test/icons/icon-192.png` differ (distinct
  placeholder letters, until real art is dropped in).
- `pnpm preview`, then in a real browser (DevTools → Application → Manifest) at
  both `/real/` and `/test/` — confirm each shows its own name/short_name and icon,
  and that installed icons for the two sets are visually distinct.
