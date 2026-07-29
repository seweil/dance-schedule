// Ambient declaration for the virtual module resolved by
// vite-plugin-content-sets.ts's contentSetsPlugin(), mirroring
// virtual-content-config.d.ts.
declare module 'virtual:content-sets' {
  import type { ContentSetsData } from './contentSets'

  const contentSets: ContentSetsData
  export default contentSets
}
