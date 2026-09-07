import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const TOP_LEVEL_CONFIG_RELATIVE_PATH = 'content/config.yaml'
const DEFAULT_CONTENT_SET = 'automated-testing'
const CONTENT_SET_CONFIG_FILENAME = 'config.yaml'

export interface TopLevelContentConfig {
  defaultContentSet: string
}

export interface ContentManifestStrings {
  name: string
  shortName: string
  description: string
}

const DEFAULT_MANIFEST_STRINGS: ContentManifestStrings = {
  name: 'Dance Schedule',
  shortName: 'Dance Schedule',
  description: 'Schedule, room assignments, and callers for this dance weekend — installable and works offline.',
}

// Directory (relative to `root`) a content set name resolves to — mirrors
// CONTENT_DIR's own computation in vite.config.ts, duplicated here (rather than
// imported) since this file must be usable before vite.config.ts's own top-level
// code runs.
function contentSetDir(root: string, name: string): string {
  return path.resolve(root, 'content', name)
}

// Reads content/config.yaml's `defaultContentSet` — the content set used when the
// CONTENT_SET env var is unset. Pure Node, synchronous, called directly from
// vite.config.ts's top-level code (before defineConfig), not through a Vite plugin —
// unlike per-set feature flags (vite-plugin-content-config.ts), this value is needed
// to compute CONTENT_DIR itself, before any plugin has even been constructed.
// See docs/design/content-config.md.
export function loadTopLevelContentConfig(root: string): TopLevelContentConfig {
  const configFile = path.resolve(root, TOP_LEVEL_CONFIG_RELATIVE_PATH)

  if (!fs.existsSync(configFile)) {
    // Same validation every other path through this function gets — without
    // it, a renamed/deleted DEFAULT_CONTENT_SET only surfaces much later as a
    // raw error deep in plugin resolution instead of this named one.
    assertContentSetExists(root, DEFAULT_CONTENT_SET, 'the built-in default content set')
    return { defaultContentSet: DEFAULT_CONTENT_SET }
  }

  const raw = fs.readFileSync(configFile, 'utf-8')
  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${TOP_LEVEL_CONFIG_RELATIVE_PATH}: ${message}`, { cause: error })
  }

  const defaultContentSet = (parsed as Record<string, unknown> | null)?.defaultContentSet
  if (typeof defaultContentSet !== 'string') {
    throw new Error(
      `${TOP_LEVEL_CONFIG_RELATIVE_PATH}'s "defaultContentSet" must be a string, got ${JSON.stringify(defaultContentSet)}`,
    )
  }

  assertContentSetExists(root, defaultContentSet, TOP_LEVEL_CONFIG_RELATIVE_PATH)
  return { defaultContentSet }
}

// Also used directly by vite.config.ts to validate an explicit CONTENT_SET env
// override the same way — a typo'd env var deserves the same fail-loud named error
// as a typo'd config file value, not a raw ENOENT from vite-plugin-pages/read-excel-file
// deep inside plugin resolution (a pre-existing open question in
// docs/design/content-sets.md, closed by this check).
export function assertContentSetExists(root: string, name: string, source: string): void {
  // Checked explicitly — path.resolve(root, 'content', '') collapses to the
  // content/ directory itself, which always exists, so an empty name would
  // otherwise silently pass this check and only fail much later with a
  // confusing raw ENOENT deep inside plugin resolution.
  if (name === '') {
    throw new Error(`${source} names an empty content set name`)
  }
  const dir = contentSetDir(root, name)
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`${source} names content set ${JSON.stringify(name)}, but ${dir} doesn't exist`)
  }
}

// Every content/<name>/ directory that exists, sorted for deterministic build
// ordering (used by scripts/build-content-sets.mjs, mirrored there in plain JS
// since that script must run outside Vite's TS transform) and deterministic
// virtual:content-sets output (vite-plugin-content-sets.ts). Ignores non-directory
// entries — content/config.yaml itself sits alongside these. See
// docs/design/content-sets.md.
export function listContentSets(root: string): string[] {
  const contentRoot = path.resolve(root, 'content')
  if (!fs.existsSync(contentRoot)) {
    return []
  }
  return fs
    .readdirSync(contentRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

// Reads content/<set>/config.yaml's `manifest.name`/`manifest.shortName`/
// `manifest.description` — a sibling of that file's existing `features:` key
// (vite-plugin-content-config.ts).
// Kept as a separate plain Node function rather than folded into that plugin's
// virtual:content-config module on purpose: these strings are only ever needed at
// build time to construct vite.config.ts's VitePWA({ manifest }) object, never by
// client-side code, so they shouldn't ship in the client bundle the way
// features.combineA1A2 deliberately does. Missing file or missing `manifest:`
// section → today's pre-existing values (zero-config parity). See
// docs/design/content-config.md.
export function loadContentManifestStrings(root: string, contentDir: string): ContentManifestStrings {
  const configFile = path.resolve(root, contentDir, CONTENT_SET_CONFIG_FILENAME)

  if (!fs.existsSync(configFile)) {
    return DEFAULT_MANIFEST_STRINGS
  }

  const raw = fs.readFileSync(configFile, 'utf-8')
  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${configFile}: ${message}`, { cause: error })
  }

  const manifest = (parsed as Record<string, unknown> | null)?.manifest ?? {}
  const name = (manifest as Record<string, unknown>).name ?? DEFAULT_MANIFEST_STRINGS.name
  const shortName = (manifest as Record<string, unknown>).shortName ?? DEFAULT_MANIFEST_STRINGS.shortName
  const description = (manifest as Record<string, unknown>).description ?? DEFAULT_MANIFEST_STRINGS.description

  // Non-empty, not just string-typed — an explicit "" (e.g. left over from an
  // unfilled template) would otherwise silently ship as the real value (a
  // blank PWA app name, in name/shortName's case) with no build error.
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(`${configFile}'s "manifest.name" must be a non-empty string, got ${JSON.stringify(name)}`)
  }
  if (typeof shortName !== 'string' || shortName.trim() === '') {
    throw new Error(`${configFile}'s "manifest.shortName" must be a non-empty string, got ${JSON.stringify(shortName)}`)
  }
  if (typeof description !== 'string' || description.trim() === '') {
    throw new Error(
      `${configFile}'s "manifest.description" must be a non-empty string, got ${JSON.stringify(description)}`,
    )
  }

  return { name, shortName, description }
}

// Reads content/<set>/config.yaml's top-level `testFixture` — a sibling of
// `features:`/`manifest:`. Real events never set this (defaults to `false`);
// it's only ever `true` for `automated-testing`/`test`, so the events landing
// page (vite-plugin-content-sets.ts's virtual:content-sets, EventsListPage.tsx)
// can sort them last without hardcoding those two literal names. Missing file
// or missing key → `false`, same zero-config-parity fallback style as
// loadContentManifestStrings above.
export function isTestFixtureContentSet(root: string, contentDir: string): boolean {
  const configFile = path.resolve(root, contentDir, CONTENT_SET_CONFIG_FILENAME)

  if (!fs.existsSync(configFile)) {
    return false
  }

  const raw = fs.readFileSync(configFile, 'utf-8')
  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${configFile}: ${message}`, { cause: error })
  }

  const testFixture = (parsed as Record<string, unknown> | null)?.testFixture ?? false
  if (typeof testFixture !== 'boolean') {
    throw new Error(`${configFile}'s "testFixture" must be a boolean, got ${JSON.stringify(testFixture)}`)
  }

  return testFixture
}
