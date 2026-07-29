// Shared with vite-plugin-content-sets.ts (the plugin that produces this shape) and
// src/types/virtual-content-sets.d.ts (the ambient declaration for the virtual
// module it resolves to) — mirrors src/types/contentConfig.ts /
// virtual-content-config.d.ts.
export interface ContentSetsData {
  // Every content/<name>/ directory published — see content-config.ts's
  // listContentSets().
  sets: string[]
  // content/config.yaml's defaultContentSet — the set also mirrored unprefixed at
  // "/". See docs/design/content-sets.md.
  defaultSet: string
  // The CONTENT_SET this particular build was compiled with.
  activeSet: string
}
