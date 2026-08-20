# Hosting

## Context

The app had no deployment infra at all — no `netlify.toml`, `vercel.json`,
`wrangler.toml`, `Dockerfile`, or `.github/` CI. It needs to go live: first for
testing, then scaling to a few hundred users, with auto-deploy on every push
to `main`. It's a purely static-output PWA (`pnpm build` = `tsc --noEmit &&
vite build` → `dist/`) with no backend/DB dependency, so hosting is a
static-site problem, not an application-server one.

## Sub-problems

- [x] Which hosting platform — see Decisions
- [x] How does deployment trigger, and what CI is needed — see Decisions
- [x] Domain — see Decisions
- [x] Client-side routing (react-router `BrowserRouter`) needs a
      server-side fallback or direct navigation to any non-root route 404s
      — see Decisions
- [x] The PWA update flow (`src/App.tsx`'s `UpdatePrompt`) needs `sw.js`/
      `index.html` served with no-cache, while hashed `/assets/` files should
      be cached long-term — see Decisions
- [x] Which `CONTENT_SET` the production build should use — see Decisions

## Decisions

### AWS Amplify Hosting, over hand-assembled S3 + CloudFront + GitHub Actions
**Why:** At a few-hundred-user scale, both options cost pennies (single-digit
GB/month egress given this app's small, service-worker-cached payload — well
inside either platform's free tier), and both need the same
customHeaders/rewrite handling below. The deciding factor is setup surface
area: Amplify replaces the S3 bucket + Origin Access Control + CloudFront
distribution + IAM + GitHub Actions workflow assembly with one declarative
`amplify.yml` and a GitHub OAuth connection. Chosen given the user's existing
AWS familiarity over a non-AWS static host (Vercel/Netlify/Cloudflare Pages),
which would've been comparably simple but off-platform.

### Auto-deploy via Amplify's native GitHub integration — no custom CI
**Why:** Amplify's console-side GitHub connection (branch → `main`) rebuilds
and redeploys on every push with no GitHub Actions workflow needed — that's
the whole point of choosing Amplify over the S3+CloudFront path, which
would've required hand-writing that CI step.

### Platform-provided domain first, then `sqdance.app` added later
**Why:** The platform-provided domain (`https://<branch>.<app-id>.amplifyapp.com`)
was the fastest path to something live for testing; Amplify domains are
HTTPS by default (required for service worker registration). A custom domain
was added later purely in the console (Domain management → add domain →
free ACM cert), zero repo changes — the app is now live at `sqdance.app`,
with the `amplifyapp.com` URL still working alongside it.

### SPA fallback via an Amplify "Rewrites and redirects" rule
**Why:** `src/App.tsx` uses `react-router-dom`'s `BrowserRouter`, so a direct
request to e.g. `/installation` must be served `index.html` (client-side
routing resolves the path in-browser) — Source `</^[^.]+$/>` → Target
`/index.html` → Type `200 (Rewrite)`. This is Amplify hosting config, not a
build-time concern, but it **is** now version-controlled and pushed via the
API rather than hand-typed into the console — see `infra/amplify-rewrites.json`
and `infra/README.md`'s "Amplify rewrite rules" section (added 2026-08-20,
after direct/shared links into a brand-new content set turned out to be
silently 404ing — console copy-paste had also been introducing stray
newlines into the rules). `aws amplify update-app --custom-rules` is the API
equivalent of the console's rewrite editor.

### Cache headers set via `customHeaders` in `amplify.yml`
**Why:** Neither Amplify's nor CloudFront's default caching gets this right
for a PWA. `sw.js`, `index.html`, and `manifest.webmanifest` must be
`no-cache` — the `UpdatePrompt` component polls `registration.update()`
every 60s and only detects a new deploy if the browser actually re-fetches
`sw.js` rather than serving a stale cached copy (violates the "never swap
content silently, but do surface an update prompt" rule in `CLAUDE.md` if
updates are never detected). Vite-hashed files under `/assets/` are safe to
cache `max-age=31536000, immutable` since a content change always produces a
new filename. `vite-plugin-pwa`'s `generateSW` strategy also emits a separate
hashed `workbox-<hash>.js` helper at the `dist/` root (confirmed via a local
`pnpm build`) — not under `/assets/`, so it needs its own `customHeaders`
pattern to get the same long-cache treatment.

### `CONTENT_SET` left unset in the Amplify build
**Why:** Unset falls back to whatever `content/config.yaml`'s
`defaultContentSet` currently names (`automated-testing` at the time this
decision was made, see `docs/design/content-sets.md`'s "permanent stable
sample event" decision — since repointed at a real event) — no environment
variable needed in Amplify's build settings regardless. Once a genuine real
event is cloned in, `content/config.yaml`'s `defaultContentSet` is what
changes, not this Amplify setting.

### Per-content-set Amplify rewrite rule, in addition to the root SPA fallback
**Why:** `pnpm build` now publishes every content set under its own
`/<set>/` prefix (see `docs/design/content-sets.md`), each an independent
build with its own `basename`-scoped router. The root SPA fallback rule
alone would incorrectly rewrite a direct/deep-link navigation to e.g.
`/automated-testing/installation` to the *root* `/index.html` (wrong
bundle/basename) instead of `/automated-testing/index.html`. This needs
**one additional rewrite rule per content-set path segment** — e.g. Source
`</automated-testing\/[^.]+$/>` → Target `/automated-testing/index.html` →
Type 200 (Rewrite), and likewise for every other set. `amplify.yml`'s
`customHeaders` patterns were also updated to `'**/...'` globs so the
no-cache/long-cache header split still applies to every set's nested
output, not just the root copy.

A **second, separate rule is also needed**: a bare `/automated-testing` or
`/test` (no trailing slash — the natural way to type or bookmark a set's
URL) doesn't match Amplify's static asset serving either, and would fall
through to the same global fallback — landing on the *root* bundle with
no matching client route, rendering blank rather than 404ing (confirmed
locally: `vite preview` has the identical gap, worked around there by
`vite-plugin-content-sets.ts`'s `configurePreviewServer` hook, which only
covers local testing). Amplify needs one additional redirect rule per
content-set — Source `/automated-testing` → Target `/automated-testing/` →
Type 301 (Redirect), and likewise for `test`/future sets — alongside the
rewrite rule above.

**Update, 2026-08-20:** this per-set rule *pair* was originally
"added/removed by hand in the Amplify console whenever a content set is
added or removed" — exactly the kind of easy-to-forget manual step that
then actually got forgotten, silently 404ing direct/shared links into a
content set (including `/reset` itself — see `docs/adding-a-new-event.md`'s
git history around this date for the full debugging trail). Now generated
from the real `content/<set>/` directories and pushed via the API instead
— see `infra/amplify-rewrites.json` and `infra/README.md`'s "Amplify
rewrite rules" section. Adding or removing a content set means
regenerating and re-applying that file, not editing the console by hand.

## Open questions

- Should a second Amplify branch/environment run `CONTENT_SET=test` (or a
  future real-event set) as a preview deploy, now that Amplify supports
  per-branch environment variables — or stay purely a local
  `pnpm dev:test`/`build:test` tool? (Largely superseded now that `pnpm
  build` publishes every set including `test` under `/test/` on every
  deploy — a separate preview branch may no longer be needed.)
- At what point (traffic volume, need for custom caching/analytics/edge
  logic) would it be worth revisiting the S3+CloudFront+Actions path for
  more control?
- Analytics (device/browser mix, usage patterns) — addressed in
  `docs/design/monitoring.md`, not still open.
- ~~The per-content-set Amplify rewrite rules above are manual and easy to
  forget when adding a new content set — is a checklist/reminder worth
  adding?~~ Addressed twice over: `scripts/generate-amplify-rewrites.mjs`
  regenerates the full rule set from the real `content/` directories (so it
  can't forget one the way hand-typing could), and
  `docs/adding-a-new-event.md`'s Step 7 has a dedicated, hard-to-miss
  "Required" section pointing at it, plus a `curl` command to verify before
  considering an event live. A build-time warning is still not possible
  (Amplify's *live* rewrite config isn't introspectable from the repo —
  nothing catches the rules going out of sync if someone edits the console
  directly instead of using the script).
