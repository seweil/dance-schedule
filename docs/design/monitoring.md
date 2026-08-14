# Monitoring

## Context

`docs/design/hosting.md` left "analytics" as an open question when the
Amplify Hosting decision was made. The app is live at a few-hundred-user
scale with no visibility into traffic patterns or device/browser mix beyond
Amplify's built-in aggregate request-count metrics. The goal: learn as much
as reasonably possible about usage and devices without meaningfully spending
money, and without pulling in a third-party analytics vendor for a
community dance-event site's visitor data.

## Sub-problems

- [x] What's already available with zero setup — see Decisions
- [x] How to get device/browser-level detail beyond raw request counts —
      see Decisions
- [x] Infra-as-code tool for the pieces that do need provisioning — see
      Decisions
- [x] Tracking in-app feature usage (not just device/performance) — see
      Decisions
- [ ] Whether to eventually pipe access logs into S3 + Athena for real
      analysis, vs. ad hoc console downloads

## Decisions

### Amplify's built-in access logs, left as-is (no IaC)
**Why:** Every Amplify Hosting app already logs every request (path,
status, referrer, User-Agent, timestamp) for its lifetime, downloadable as
CSV from the console in two-week windows — no configuration, and as of this
writing no CloudFormation property exists to change how they're stored or
to continuously export them to a bucket. There's nothing to encode in this
repo for this piece; `infra/README.md` documents how to retrieve them
instead.

### CloudWatch RUM for client-side device/browser/performance telemetry
**Why:** Access logs' User-Agent string is parseable but crude, and requires
building a whole export/query pipeline just to answer "what devices do
people use." CloudWatch RUM (`infra/monitoring.yaml`) gives device type,
browser, OS, geography, Core Web Vitals, and JS/HTTP errors, sent directly
from the browser as an SDK, with essentially no server-side effort. Pricing
is $1/100k events after a 100k/month free tier — this app's traffic won't
come close, so it's effectively free. Rejected: Google Analytics/GA4 (free,
richer, but ships visitor data to a third party for what's a community
event's guest list, not a commercial product) and self-hosting
Umami/Plausible (avoids the third party, but adds a service to run and pay
for that isn't justified at this scale).

### Plain CloudFormation for the RUM stack, not Terraform or CDK
**Why:** The only pieces needing provisioning are a Cognito unauthenticated
identity pool, its guest IAM role, and the RUM app monitor itself — three
resources, no ongoing multi-environment complexity. Terraform would add a
whole second tool, state-backend decision, and provider version pinning for
three resources in an otherwise non-Terraform, non-multi-cloud project. CDK
is TypeScript-native (this project's language) and was considered, but
still adds a synth/bootstrap toolchain and its own generated CloudFormation
under the hood — for a stack this small, hand-written CloudFormation is the
same amount of code with one less layer between the YAML and what actually
deploys. Revisit if the infra surface grows enough that CloudFormation's
verbosity (vs. CDK's constructs, or Terraform's module ecosystem) starts to
hurt.

### Deployed manually via `aws cloudformation deploy`, not wired into Amplify's build
**Why:** This is infrequently-changed infrastructure (add a domain, adjust
sample rate), not something that should redeploy on every app build. Kept
as a one-off `aws cloudformation deploy` a developer runs locally (see
`infra/README.md`), with its outputs copied into Amplify's console-managed
build environment variables by hand — consistent with the existing pattern
in `docs/design/hosting.md` where Amplify console settings (rewrite rules,
custom headers via `amplify.yml`) are split between "in the repo" and
"console-only" depending on whether CloudFormation/Amplify's build spec can
express them.

### RUM client wrapped to never throw, and skipped entirely outside production
**Why:** Per `CLAUDE.md`'s PWA guidance, a new dependency must never turn
into a blank screen or unhandled rejection. `src/lib/rum.ts` no-ops (rather
than throwing) whenever `VITE_RUM_APP_MONITOR_ID`/`VITE_RUM_IDENTITY_POOL_ID`/
`VITE_RUM_REGION` are unset — true for local dev and for any build that
predates the stack being deployed — and wraps the `AwsRum` construction in
`try/catch` since a telemetry SDK failing to initialize should never be
allowed to break the app it's observing.

### CloudWatch RUM custom events for feature-level usage (date/level-filter/text-size)
**Why:** RUM's built-in telemetry answers "what devices/browsers hit the
site" but nothing about which of the app's own features people actually
use. `infra/monitoring.yaml`'s `CustomEvents.Status: ENABLED` plus
`src/lib/rum.ts`'s `trackEvent` helper (a thin, equally-defensive wrapper
around `awsRum.recordEvent`) let specific hooks fire named events: which
dates people view (`useDanceScheduleFilters`'s `setSelectedDate`,
interaction-only — a "current date" snapshot isn't a meaningful
distribution the way a persisted preference is), the level filter's
current range (labeled with the slot names rather than raw indices so
events stay readable independent of a set's `combineA1A2`/`combineC3BC4`
flags), and which text-size preference is active. The level-range and
text-size events both fire on every mount as well as on every subsequent
change (`useDanceScheduleFilters`'s own effect for the former,
`useTextSizePreference` for the latter) — the useful signal there is the
current distribution of the setting, not just interaction counts, since
most visitors never touch either one after the page loads with whatever
was stored (or the default). Deliberately narrow: only the three things
asked for, not a generic "track every click" wrapper — add more call sites
the same way
if a specific question comes up later, rather than instrumenting
speculatively.

## Open questions

- Should access logs eventually be piped into S3 + Athena automatically
  (e.g. a small scheduled Lambda), or is manual console download sufficient
  indefinitely given the traffic volume? See `infra/README.md`'s Athena
  note.
- `RetainTelemetryBeyond30Days` (in `infra/monitoring.yaml`) defaults to
  off — revisit if year-over-year comparison of a recurring event's traffic
  becomes valuable enough to justify the CloudWatch Logs cost.
