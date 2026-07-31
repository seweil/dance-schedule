# CI (GitHub Actions) + testing-strategy doc + known-issue for the sandbox limitation

## Context

This session repeatedly hit a wall: `pnpm test:e2e` can never run inside Claude
Code's Bash sandbox in this environment — Chromium fails to launch with a
`mach_port_rendezvous`/`Permission denied (1100)` error, and the sandbox
separately blocks reading anything outside the project directory (confirmed:
`ls /Applications/...` was rejected), so pointing Playwright at a
system-installed browser isn't a workaround either. Research this session
also surfaced that **nothing today automatically runs lint, unit tests, or
e2e tests anywhere** — `amplify.yml` (the only pipeline that exists) runs
only `pnpm build` (which is `tsc --noEmit && node scripts/build-content-sets.mjs`)
on deploy. There's no `.github/workflows/`, no pre-commit hooks. Every other
check (`pnpm lint`, `pnpm test`, `pnpm test:e2e`) is 100% manual, human-run.

Additionally, `@vitest/coverage-v8` is already an installed devDependency but
is completely unwired — no `test.coverage` config, no npm script.

Given all that, "improve the dev cycle" resolves to three concrete, additive
pieces of work: (1) give the repo a real CI pipeline so lint/typecheck/unit/
e2e actually run automatically somewhere, even though Claude still can't run
Playwright itself in this chat; (2) document, for both humans and future
Claude sessions, what test layer runs when/where and how to see results; (3)
record the sandbox limitation as a known issue so a future session doesn't
waste time re-discovering or re-attempting it, and instead knows immediately
to rely on CI results, the `claude-in-chrome` MCP tool for live manual
verification, or asking the user to run `pnpm test:e2e` locally.

## Approach

### 1. `.github/workflows/ci.yml` — two parallel jobs, triggered on push + PR

Mirrors `amplify.yml`'s own pnpm setup (`corepack enable` →
`corepack prepare pnpm@11.15.1 --activate` → `pnpm install --frozen-lockfile`)
so CI and the real deploy build use the identical toolchain, on `ubuntu-latest`
with `actions/setup-node` (Node 24, matching this dev machine — no `.nvmrc`
exists to pin otherwise) and an `actions/cache` step keyed on
`pnpm-lock.yaml` for the pnpm store.

- **Job `checks`** (fast feedback): install deps → `pnpm lint` → `pnpm typecheck`
  → `pnpm test:coverage` (new script, see below) → upload the `coverage/`
  directory as a build artifact (`actions/upload-artifact`, always runs via
  `if: always()` so a failing test run still surfaces its coverage).
- **Job `e2e`** (independent, runs in parallel — not gated on `checks`):
  install deps → `npx playwright install --with-deps chromium` → `pnpm test:e2e`
  (its own `webServer` config already runs `pnpm build && pnpm preview`, so
  this also exercises the full multi-content-set production build, the same
  path Amplify uses) → upload `playwright-report/` as an artifact with
  `if: always()` (so a failure's HTML report — screenshots/traces on retry —
  is still downloadable, not just the pass/fail badge).

No enforced coverage threshold and no `forbidOnly`/branch-protection wiring in
this change — purely additive visibility. Both `coverage/` and
`playwright-report/` are already in `.gitignore`, so no gitignore changes
needed.

### 2. `pnpm test:coverage` script + Vitest coverage config

- `package.json`: add `"test:coverage": "CONTENT_SET=automated-testing vitest run --coverage"`.
- `vite.config.ts`'s existing `test` block: add a `coverage` key —
  `provider: 'v8'`, `reporter: ['text', 'html']`, excluding config/build
  files, `*.d.ts`, and the two intentionally-untested root Vite plugins
  (already called out by name in that block's own existing comment).
- Report the resulting numbers back in this session's summary once run (not
  hardcoded into the doc — coverage % will drift as the codebase grows, so
  the doc explains *how* to generate a fresh number, not a stale snapshot).

### 3. New `docs/testing.md` — practical reference doc

Sibling to `docs/adding-a-new-event.md`/`docs/known-issues.md` (not a
`docs/design/` decision doc — this is a "what runs when" reference, not a
single architectural decision). Cross-linked from CLAUDE.md's existing
Testing section (add one pointer line there, no restructuring of that
section). Contents:

- **Test layers table**: Unit (Vitest/jsdom, colocated `*.test.ts(x)`) / E2E
  (Playwright, `e2e/*.spec.ts`, requires a real build+preview) / Build-time
  validation (schedule & content-config parsing — a bad spreadsheet row or
  malformed `config.yaml` fails `pnpm build` itself with a named error,
  functioning as a de facto data-validation test layer) / Lint. For each:
  what it catches, where the files live, the exact command.
- **Where each one runs** table: local dev loop (manual) vs. the new GitHub
  Actions CI (push/PR, both jobs) vs. Amplify's deploy build (`pnpm build`
  only — typecheck + build-time validation, no lint/unit/e2e — so a lint
  failure or a broken e2e flow can still reach production undetected by the
  deploy pipeline itself, only caught by CI on the PR/push that introduced
  it).
- **How to see CI results**: GitHub → Actions tab → the workflow run → Summary
  page's Artifacts section → download `playwright-report` (open its
  `index.html`) or `coverage` (open `coverage/index.html`).
- **Test organization**: the colocation convention (test next to source),
  the two root-level exceptions (`content-config.test.ts`,
  `content-icons.test.ts`), the `e2e/` directory, and a short *current*
  snapshot (counts, not an enumerated file table that will drift) — e.g.
  "~39 unit test files, 3 e2e spec files" — plus a short "known gaps" list
  pulled from this session's coverage-gap research (e.g.
  `DanceScheduleLevelsPage.tsx`/`/dance-by-level` has no e2e coverage at all;
  `BuildInfo.tsx`/`UpdatePrompt.tsx` have no test coverage of any kind).
- Pointer to the new known-issues.md entry (below) explaining why Claude
  itself can't run `pnpm test:e2e` in this sandbox.

### 4. New `docs/known-issues.md` entry: sandbox can't execute Playwright

Documents the `mach_port_rendezvous`/`Permission denied (1100)` Chromium
launch failure and the separate outside-project-directory filesystem
restriction, both confirmed this session, as an environment limitation (not
a repo bug — no "fix direction" naming a code change). Explicitly spells out
the workaround path for a future Claude session: check the GitHub Actions
run for the PR/branch in question first; failing that, use `claude-in-chrome`
MCP browser automation against a real `pnpm build && pnpm preview` for
manual/live verification (as done throughout this session); failing that,
ask the user to run `pnpm test:e2e` locally and report back.

## Verification

- `pnpm lint && pnpm typecheck && pnpm test:coverage` run locally to confirm
  the new script/config work and report the real coverage numbers.
- Validate `.github/workflows/ci.yml`'s YAML structure locally (no GitHub
  Actions runner available in this sandbox to actually execute it) — closest
  available check is `actions/checkout`-style syntax review plus confirming
  the job steps' commands are exactly the same ones already verified to work
  in this session (`pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`,
  `pnpm build`, `pnpm preview`).
- After pushing, the user should confirm the workflow actually runs green (or
  investigate a failure) from the GitHub Actions tab — I cannot observe that
  from within this sandbox.

## Critical files

- `.github/workflows/ci.yml` — new
- `package.json` — add `test:coverage` script
- `vite.config.ts` — add `test.coverage` config block
- `docs/testing.md` — new
- `docs/known-issues.md` — new entry
- `CLAUDE.md` — one cross-reference line in the existing Testing section
