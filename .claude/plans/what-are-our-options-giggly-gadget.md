# Callers page as a 2-column photo grid, via real markdown tables

## Context

The Callers page (`content/backtrack2abq/pages/3 callers.md`) is currently a
flat sequence of `![photo](...)` / `**Name**` pairs, one after another —
readable but not laid out as a grid. The user asked for a 2-column or table
layout.

Investigated two ways to get there:
- A CSS-only grid needs *something* to scope the CSS to (only this page,
  only this content). Confirmed live (DOM inspection): content pages have
  **no wrapping element at all** — Nav, PageHeader, and every compiled
  markdown element render as flat siblings directly under `#root`. Giving
  content pages a per-page scope would mean adding a wrapper div around
  every page's output app-wide — a real architecture change to serve one
  page.
- Real markdown tables need `remark-gfm` — confirmed via `vite.config.ts`'s
  `mdx()` call: no `remarkPlugins` are configured at all today, so GFM pipe-
  table syntax currently renders as literal text, not a `<table>`.

Given the user picked the photo-grid-card look (not a bordered data table)
in an earlier round, the plan is: add `remark-gfm` (small, reusable,
build-time-only devDependency — enables markdown tables for *any* future
content page, not just this one), write the caller list as a 2-column
table, and style tables minimally/borderlessly so this one reads as a photo
grid rather than a spreadsheet. This is a real, if small, content-pipeline
capability (documented in CLAUDE.md's "Content pipeline" section, same
place `rehype-mdx-import-media`/image zoom are already documented at this
level of detail), not a one-off hack scoped to this page.

## Approach

**`remark-gfm`** — added as a devDependency (build-time MDX compile step
only, same category as `rehype-mdx-import-media`/`yaml`/`sharp`, never
shipped to the client). Wired into `vite.config.ts`'s existing `mdx({...})`
plugin config as `remarkPlugins: [remarkGfm]`, alongside the existing
`rehypePlugins: [rehypeMdxImportMedia]` — confirmed `rehype-mdx-import-media`
processes image nodes regardless of where they sit in the AST, so an image
inside a table cell gets the same asset-import rewriting as any other
content image, no special-casing needed.

**Table markup, no raw HTML needed.** GFM table cells can only hold a single
line of inline content each, so instead of stacking a photo and name inside
one cell (which would need a raw `<br/>`), each caller-pair becomes two
table rows: one row of two photos, the row right below it their two names —
still reads as a 2-up photo grid once borders are stripped, using only
plain `![]()`/`**bold**` inline syntax GFM tables already support directly.
GFM syntax requires a header row, but there's nothing worth showing as a
header here — an empty header row (`|  |  |`) satisfies the syntax; kept
visually unobtrusive via CSS (see below), not hidden outright (a future
content author who *does* want a visible header on some other table
shouldn't have headers globally suppressed).

**Global, minimal table styling in `src/index.css`** (not scoped to this
page — there's nowhere to scope it to, per the Context above, and a
generically clean default is a reasonable thing for the whole site to have
regardless): centered/padded cells, no explicit borders (confirmed browsers
don't draw table borders by default without one — not stripping anything,
just never adding it), full width, empty header cells collapsed via
`th:empty`. No mobile-specific stacking override — confirmed
`ZoomableImage.module.css`'s `.thumbnail` size class caps each photo at
`min(100px, 100%)`, so two columns of thumbnails comfortably fit even a
narrow phone viewport without needing responsive column-collapsing.

**Confirmed no test coverage references this page** (grepped `e2e/` and
`src/` for `callers`/`Callers` — every hit is about dance-session *callers*,
an unrelated data field, not this content page) — so no test updates
needed; verification is build + live visual check only.

## Files

- **`package.json`/`pnpm-lock.yaml`** — `pnpm add -D remark-gfm`.
- **`vite.config.ts`** — import `remarkGfm` from `remark-gfm`; add
  `remarkPlugins: [remarkGfm]` to the existing `mdx({...})` call (sits next
  to the current `rehypePlugins: [rehypeMdxImportMedia]` line).
- **`content/backtrack2abq/pages/3 callers.md`** — rewrite the Trail-In
  Dance (2 callers) and Convention Callers & Cuers (8 callers) sections as
  GFM tables, 2 columns, photo-row then name-row per pair, empty header row.
  Intro paragraph and section headings unchanged.
- **`src/index.css`** — add a minimal `table`/`th`/`td` rule set (padding,
  centered text, full width, `th:empty` collapsed) — global content styling,
  same file this project already reserves for "truly global concerns"
  (fonts, resets, shared tokens) per CLAUDE.md's Styling section.
- **`CLAUDE.md`** — add a short bullet to the existing "Content pipeline"
  section noting GFM (tables, etc.) is now enabled via `remark-gfm`, styled
  minimally/borderlessly in `src/index.css` — same documentation depth as
  the existing "Images"/"Image zoom" bullets there.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` (no logic changes, but confirms
  nothing else references the old callers.md structure).
- `pnpm build` (or `CONTENT_SET=backtrack2abq pnpm dev`) + live check via
  claude-in-chrome on `/callers`: both sections render as a 2-column photo
  grid, images still zoom on tap (ZoomableImage still applies — table cells
  don't bypass the MDXProvider `img` override), no visible table borders,
  the empty header row doesn't leave an awkward gap, and it looks
  reasonable at a narrow (mobile) viewport width too. Check console for
  errors.
- Spot-check that `pnpm build` (which compiles every content set, not just
  backtrack2abq) still succeeds for `automated-testing`/`test` — neither
  currently uses table syntax, so this is just confirming the new
  `remarkPlugins` addition doesn't break existing plain-markdown pages.

## Critical files

- `vite.config.ts` — wire up `remark-gfm`
- `content/backtrack2abq/pages/3 callers.md` — rewritten as 2-column tables
- `src/index.css` — global minimal table styling
- `CLAUDE.md` — document the new GFM/table capability
- `package.json`/`pnpm-lock.yaml` — new devDependency
