// Ambient declaration for the virtual module resolved by
// vite-plugin-content-config.ts's contentConfigPlugin(), mirroring
// virtual-schedule.d.ts.
declare module 'virtual:content-config' {
  import type { ContentConfigData } from './contentConfig'

  const config: ContentConfigData
  export default config
}
