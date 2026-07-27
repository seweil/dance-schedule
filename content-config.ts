import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const TOP_LEVEL_CONFIG_RELATIVE_PATH = 'content/config.yaml'
const DEFAULT_CONTENT_SET = 'real'

export interface TopLevelContentConfig {
  defaultContentSet: string
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
  const dir = contentSetDir(root, name)
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`${source} names content set ${JSON.stringify(name)}, but ${dir} doesn't exist`)
  }
}
