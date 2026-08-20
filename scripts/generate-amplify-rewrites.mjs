// Generates infra/amplify-rewrites.json from the actual content/<set>/ directories —
// see docs/design/hosting.md's "Per-content-set Amplify rewrite rule" decision for why
// each content set needs two rewrite rules of its own (a bare-prefix trailing-slash
// redirect, plus the deep-link rewrite), on top of the existing root SPA fallback.
// Regenerating this from content/ directly (rather than hand-maintaining the rule list)
// means adding a new event via docs/adding-a-new-event.md can't forget a rule the way a
// console-only, copy-pasted-by-hand rule list could — see infra/apply-amplify-rewrites.sh
// for pushing the result to Amplify.
//
// This duplicates the small content/ directory-listing logic scripts/build-content-sets.mjs
// also has, rather than importing it — mirrors that file's own precedent (see its header
// comment) of small duplication over cross-script coupling for standalone one-off scripts.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const OUTPUT_FILE = path.join(root, 'infra/amplify-rewrites.json')

function listContentSets() {
  const contentDir = path.join(root, 'content')
  return fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

// Order matters: Amplify evaluates rules top-to-bottom, first match wins. Each set's
// own pair must come before the generic root catch-all below, or the catch-all's
// broader regex would match that set's deep links first and serve the WRONG (root)
// bundle — see docs/design/hosting.md.
//
// [^.]* (zero-or-more), not [^.]+ (one-or-more): a `+` here left the bare
// "/<set>/" URL (nothing after the trailing slash — exactly what the redirect rule
// above produces, and how someone would naturally bookmark a set's home page) NOT
// matching this rule at all, falling through to the generic root catch-all below
// instead and silently serving the WRONG (root) index.html — confirmed live
// (`/backtrack2abq/` returned the root bundle's etag) before this fix.
function rulesForSet(set) {
  return [
    { source: `/${set}`, status: '301', target: `/${set}/` },
    { source: `</${set}\\/[^.]*$/>`, status: '200', target: `/${set}/index.html` },
  ]
}

const sets = listContentSets()
const rootFallback = { source: '</^[^.]+$/>', status: '200', target: '/index.html' }
const rules = [...sets.flatMap(rulesForSet), rootFallback]

fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(rules, null, 2)}\n`)

console.log(`Wrote ${rules.length} rules (${sets.length} content set(s): ${sets.join(', ')}) to ${path.relative(root, OUTPUT_FILE)}`)
