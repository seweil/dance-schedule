// Publishes every content/<set>/ directory as its own self-contained production
// build, each served under a "/<set>/" URL prefix, plus one extra unprefixed build
// for the default set (content/config.yaml's defaultContentSet) mirrored at "/".
//
// Each content set's data (schedule, dance-schedule, feature flags) is baked into
// its own build's JS bundle by vite.config.ts's virtual-module plugins, which only
// ever resolve one CONTENT_SET per process — so publishing all sets at once means
// running `vite build` once per set (plus once more for the default set's root
// mirror), never a single build that emits multiple sets. See
// docs/design/content-sets.md.
//
// This duplicates the small amount of content-config.ts logic it needs (listing
// content/ subdirectories, reading defaultContentSet) rather than importing it,
// since content-config.ts is TypeScript and can't run outside Vite's transform
// without extra tooling — mirrors the existing contentSetDir duplication precedent
// already in the codebase between content-config.ts and vite.config.ts.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const DEFAULT_CONTENT_SET = 'automated-testing'
const TMP_DIR = path.join(root, 'dist-build-tmp')
const DIST_DIR = path.join(root, 'dist')

// A content set name colliding with one of these would silently corrupt the merged
// dist/ tree (e.g. a set literally named "assets" would collide with the default
// build's own /assets/ directory) — not expected in practice, but fail loudly
// rather than silently overwrite build output. See docs/design/content-sets.md.
const RESERVED_NAMES = new Set(['assets', 'icons', 'index.html', 'manifest.webmanifest', 'sw.js'])

function listContentSets() {
  const contentDir = path.join(root, 'content')
  return fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function loadDefaultContentSet() {
  const configFile = path.join(root, 'content/config.yaml')
  if (!fs.existsSync(configFile)) {
    return DEFAULT_CONTENT_SET
  }
  const parsed = parse(fs.readFileSync(configFile, 'utf-8'))
  const defaultContentSet = parsed?.defaultContentSet
  if (typeof defaultContentSet !== 'string') {
    throw new Error(`content/config.yaml's "defaultContentSet" must be a string, got ${JSON.stringify(defaultContentSet)}`)
  }
  return defaultContentSet
}

const sets = listContentSets()
const defaultSet = loadDefaultContentSet()

if (!sets.includes(defaultSet)) {
  throw new Error(`content/config.yaml names content set ${JSON.stringify(defaultSet)}, but content/${defaultSet} doesn't exist`)
}

for (const set of sets) {
  if (RESERVED_NAMES.has(set) || set.startsWith('workbox-')) {
    throw new Error(`content set name ${JSON.stringify(set)} collides with a reserved build output path`)
  }
}

// Clean up any leftover tmp dir from a prior crashed run before starting.
fs.rmSync(TMP_DIR, { recursive: true, force: true })
const STAGING_DIR = path.join(TMP_DIR, 'staging')
const MERGED_DIR = path.join(TMP_DIR, 'merged')
fs.mkdirSync(MERGED_DIR, { recursive: true })

const viteBin = path.join(root, 'node_modules', '.bin', 'vite')

// Each build gets its own fully isolated outDir under staging/ — never a directory
// that will also hold another build's output. This matters beyond tidiness:
// vite-plugin-pwa's generateSW globs its outDir for the precache manifest, so if
// one build's outDir contained another's files (as an earlier version of this
// script did, by reusing one shared directory for the root build), its service
// worker would precache the *other* sets' assets too — confirmed empirically
// (root build's precache count nearly quadrupled) before this was fixed.
function runBuild(contentSet, basePath, outDir) {
  console.log(`Building content set "${contentSet}" at base "${basePath}" → ${path.relative(root, outDir)}`)
  execFileSync(viteBin, ['build', '--outDir', outDir], {
    cwd: root,
    env: { ...process.env, CONTENT_SET: contentSet, BASE_PATH: basePath },
    stdio: 'inherit',
  })
}

for (const set of sets) {
  runBuild(set, `/${set}/`, path.join(STAGING_DIR, set))
}
// Extra unprefixed build for the default set, mirrored at "/" — its own isolated
// staging directory too, moved into MERGED_DIR's root once done (below), never
// built directly alongside the per-set directories.
runBuild(defaultSet, '/', path.join(STAGING_DIR, '__root__'))

// Assemble the merged tree only after every build above has succeeded
// (execFileSync throws, and this script exits non-zero, on any nonzero vite exit
// code, before reaching here).
for (const set of sets) {
  fs.renameSync(path.join(STAGING_DIR, set), path.join(MERGED_DIR, set))
}
for (const entry of fs.readdirSync(path.join(STAGING_DIR, '__root__'))) {
  fs.renameSync(path.join(STAGING_DIR, '__root__', entry), path.join(MERGED_DIR, entry))
}

// Only swap dist/ once the merge above is fully assembled — dist/ is never left in
// a partially-published state. On failure, dist-build-tmp/ is deliberately left in
// place for postmortem inspection; the next successful run's rmSync above cleans it
// up.
fs.rmSync(DIST_DIR, { recursive: true, force: true })
fs.renameSync(MERGED_DIR, DIST_DIR)
fs.rmSync(TMP_DIR, { recursive: true, force: true })

console.log(`Published ${sets.length} content set(s): ${sets.join(', ')} (default: ${defaultSet}, mirrored at "/")`)
