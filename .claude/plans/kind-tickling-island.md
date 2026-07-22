# Flatten `content/` to a single-level file list

## Context

The content pipeline currently supports nested folders under `content/`
(`content/getting-started/installation.md` → route `/getting-started/installation`,
with the folder itself becoming a non-clickable nav "group heading" when it has no
index page). The user wants to drop this hierarchy entirely: `content/` should be a
flat list of markdown files only. Each file's name becomes its route/tab/nav label,
and its contents render as the page — no subfolders, no grouping, no group-heading
nav items. The exact naming logic (how a filename becomes a label) will be refined
in a follow-up; this change only removes the *hierarchy*, keeping the existing
title-casing behavior as-is for now.

## Approach

### 1. Flatten `content/`
- `git mv content/getting-started/installation.md content/installation.md`
- `git mv content/getting-started/screenshot.png content/screenshot.png`
- Remove the now-empty `content/getting-started/` directory.
- `vite.config.ts`'s `Pages({ dirs: [{ dir: 'content', baseRoute: '' }], extensions: ['md'], resolver: 'react' })`
  needs no code change — nesting was a byproduct of folder structure, not
  configuration, so flat files already produce flat routes.

### 2. Simplify `src/lib/buildNavTree.ts`
Routes are now guaranteed single-level (root `/` plus flat page routes, no
`route.children`), so drop the recursion/grouping logic entirely:
- `NavItem` loses `children`; becomes `{ label: string; href: string }`.
- `buildNavTree` maps `routes` directly to `NavItem[]` — no `parentHref`,
  no `joinPaths`, no `route.element` check (every flat content file always has one).
- Keep `titleCase` and the root-path → `'Home'` special case unchanged (naming
  logic is explicitly out of scope for this pass).

### 3. Simplify `src/components/Nav.tsx`
Remove the recursive `NavList` component and the href-is-null → `<span>`
(group-heading) branch, since every nav item is now a real link. Render a single
flat `<ul>` of `<Link>` items straight from `buildNavTree(routes)`.

### 4. Update tests
- `src/lib/buildNavTree.test.ts`: drop the "builds nested hrefs from parent + child
  segments" case (no longer applicable). Keep the "Home" and title-casing cases;
  add/adjust a case covering a flat multi-file list mapping straight to `NavItem[]`.
- `src/App.test.tsx`: line 15 currently asserts `getByText(/getting started/i)`
  (the old group heading) — change to assert a real `getByRole('link', { name: /installation/i })`.
- `e2e/app.spec.ts`: update the two tests that reference the nested path —
  the "nav links to a page generated from a nested content file" test (rewrite
  description/comment to reflect a flat nav, drop the group-heading framing) and
  the lightbox test's `page.goto('/getting-started/installation')` → `/installation`.

### 5. Update `CLAUDE.md`
- **Project structure** tree: show `content/installation.md` flat under `content/`
  instead of the nested `getting-started/` example.
- **Content pipeline** section: remove the folder-grouping / non-clickable-heading
  bullet and the nested-path example; state that `content/` is a flat list of files,
  one route per file, and that nav ordering/label derivation (title-casing) will be
  revisited separately.

## Files touched
- `content/getting-started/installation.md` → `content/installation.md` (git mv)
- `content/getting-started/screenshot.png` → `content/screenshot.png` (git mv)
- `src/lib/buildNavTree.ts`
- `src/lib/buildNavTree.test.ts`
- `src/components/Nav.tsx`
- `src/App.test.tsx`
- `e2e/app.spec.ts`
- `CLAUDE.md`

No changes needed to `vite.config.ts`, `src/App.tsx`, or `src/components/ZoomableImage.tsx`.

## Verification
1. `pnpm typecheck && pnpm lint && pnpm test` — confirms the simplified `NavItem`/
   `buildNavTree` type and the updated unit tests pass.
2. `pnpm build && pnpm preview` then `pnpm test:e2e` — confirms the flat route
   (`/installation`), the image/lightbox behavior at its new path, and the
   unaffected SW/offline tests all still pass against the real build.
3. Manual spot-check in Chrome (`pnpm dev` or preview): nav shows a flat
   `Home` / `Installation` list with no group heading, and `/installation` renders
   the page with a working zoomable image.
