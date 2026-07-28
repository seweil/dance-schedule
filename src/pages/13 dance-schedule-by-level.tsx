// vite-plugin-pages requires a default export per route file, which conflicts with
// this repo's "prefer named exports" convention — so this file stays a thin wrapper
// and the real, testable component keeps a normal named export.
export { DanceScheduleLevelsPage as default } from '../components/DanceScheduleLevelsPage'
