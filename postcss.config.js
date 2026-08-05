import postcssGlobalData from '@csstools/postcss-global-data'
import postcssCustomMedia from 'postcss-custom-media'

// Each CSS Module file is processed independently, so postcss-custom-media
// alone can't resolve a @custom-media name unless it's declared in that
// same file — postcss-custom-media's own `importFrom` option handled this
// for Modular CSS setups like CSS Modules in older versions, but was
// removed (v12); postcss-global-data (run first, per its own README) is
// the current recommended replacement — it makes src/breakpoints.css's
// @custom-media names (--phone, --tablet-and-up) available to every module
// without an explicit @import in each one. See that file's own comment for
// why it exists and docs/design/responsive-breakpoints.md for the full
// breakpoint catalog this is part of.
export default {
  plugins: [
    postcssGlobalData({ files: ['src/breakpoints.css'] }),
    postcssCustomMedia(),
  ],
}
