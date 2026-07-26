# Host the app on AWS Amplify Hosting (auto-deploy on push)

## Context

The app has no deployment infra today (confirmed: no `netlify.toml`, `vercel.json`,
`wrangler.toml`, `Dockerfile`, or `.github/` CI of any kind). It's a purely
static-output PWA — `pnpm build` runs `tsc --noEmit && vite build` and produces
`dist/`, no backend/DB dependency anywhere in `package.json`. The user wants it
live for testing now, scaling to a few hundred users, has AWS free-tier
experience, and wants auto-deploy on every push to `main`.

Decision: **AWS Amplify Hosting**, over hand-assembling S3 + CloudFront +
GitHub Actions. Both are pennies at a few-hundred-user scale and both need the
same service-worker cache-header handling (see below), so the deciding factor
is that Amplify replaces the bucket/IAM/invalidation-script assembly with one
declarative build spec and a GitHub OAuth connection — less surface area to
misconfigure for a project this size. Using the platform-provided domain
(`https://<branch>.<app-id>.amplifyapp.com`) for now; a custom domain can be
added later in the Amplify console with zero repo changes.

Two things make this app's hosting setup non-default:

1. **Client-side routing** (`src/App.tsx` uses `react-router-dom`'s
   `BrowserRouter`) — a direct request to e.g. `/installation` must be
   rewritten to `/index.html` server-side, or it 404s.
2. **PWA update flow** (`CLAUDE.md`: never swap content silently — `src/App.tsx`'s
   `UpdatePrompt` polls `registration.update()` every 60s and shows a reload
   prompt via `useRegisterSW`) — this only works if `sw.js`/`index.html` are
   served with no-cache/short TTL so a new deploy is actually detected, while
   the hashed asset files under `/assets/` are cached long-term/immutable.
   Neither is handled by Amplify's defaults; both need an explicit
   `customHeaders` rule.

## Repo changes

1. **Add `amplify.yml`** at repo root (Amplify auto-detects this once present
   and committed):
   - `preBuild`: `corepack enable && corepack prepare pnpm@11.15.1 --activate`
     (matches the `packageManager` field in `package.json`) then
     `pnpm install --frozen-lockfile`
   - `build`: `pnpm build`
   - `artifacts`: `baseDirectory: dist`, `files: ['**/*']`
   - `cache`: pnpm store path, so repeat builds don't reinstall from scratch
   - `customHeaders`:
     - `index.html`, `manifest.webmanifest`, `sw.js` → `Cache-Control:
       no-cache` (verify the exact generated service-worker filename in
       `dist/` after the first build — `vite-plugin-pwa`'s `generateSW`
       strategy is configured, so it should be `sw.js`, but confirm rather
       than assume)
     - everything else (`/assets/**`, hashed by Vite) → `Cache-Control:
       public, max-age=31536000, immutable`

2. **Add `docs/design/hosting.md`** per this repo's design-doc convention
   (context / decision / rationale), recording: why Amplify over
   S3+CloudFront+Actions, the two non-default requirements above and how
   they're handled, and that `CONTENT_SET` is left unset in the Amplify build
   (defaults to `real`, which is correct for production — `content/test/` is
   dev/CI fixture data only).

No other source changes are needed — `vite.config.ts` already defaults to
`CONTENT_SET=real`, and the manifest/icons already use root-absolute paths,
which matches hosting at a domain root (whether the Amplify subdomain now or a
custom domain later).

## Manual steps (AWS console — I can't do these; no AWS network access from
this sandbox, and it's your account)

1. In the Amplify Hosting console: **New app → Host web app → GitHub** →
   authorize → select the `dance-schedule` repo → branch `main`.
2. Amplify should detect the committed `amplify.yml` and pre-fill build
   settings from it — confirm they match rather than re-entering manually.
3. Leave environment variables empty (no `CONTENT_SET` — defaults to `real`).
4. Under **App settings → Rewrites and redirects**, add the SPA fallback rule:
   Source `</^[^.]+$/>`, Target `/index.html`, Type `200 (Rewrite)`. Without
   this, direct navigation/refresh on any non-root route 404s.
5. Save and let the first build/deploy run. Every subsequent push to `main`
   auto-deploys from here on — no further action needed to satisfy
   "auto-deploy on push."
6. Amplify's default domain (`https://main.<app-id>.amplifyapp.com`) is HTTPS
   out of the box, which satisfies "platform address for now." Custom domain
   is a separate later step (Domain management → add domain → free ACM cert),
   no repo changes required when you get there.

## Verification

After the first deploy succeeds, using the Amplify-provided URL:

- Home page and at least one non-root page load; navigate directly to a
  sub-route URL (not via in-app nav) to confirm the rewrite rule actually
  prevents a 404.
- Schedule page renders real parsed data (confirms the build picked up
  `content/real/data/event-schedule.xlsx` correctly with no `CONTENT_SET` set).
- DevTools → Application → Manifest: icons load, no installability warnings.
- DevTools → Application → Service Workers: registered and activated over
  HTTPS.
- DevTools → Network: confirm response headers — `sw.js` is `no-cache`, a
  hashed file under `/assets/` is `max-age=31536000, immutable`.
- Update-flow check: push a trivial commit (any commit changes
  `BUILD_NUMBER` since it's `git rev-parse --short HEAD` at build time), wait
  for the auto-deploy, then reload an *already-open* tab and confirm the "new
  version available" prompt appears within ~60s per the existing
  `UPDATE_CHECK_INTERVAL_MS` polling — this is the same behavior
  `CLAUDE.md`/local `pnpm preview` testing already covers, now exercised
  against the real hosted deploy.
- Offline check: DevTools → Application → Service Workers → Offline
  checkbox, reload, confirm the app shell and cached routes still render.

## Scale note

No infra changes needed for "a few hundred users" — Amplify's CDN and free
tier (15GB served/month) comfortably cover that given this app's small,
service-worker-cached payload. Revisit only if usage grows into the
thousands, or if custom caching/analytics needs come up.
