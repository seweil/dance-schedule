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
- [x] Aggregate/group-by reporting over custom events, not just browsing one
      event at a time in the console — see Decisions
- [x] Getting the aggregate-reporting queries themselves into source
      control, not just copy-pasted from docs — see Decisions
- [x] Getting the hand-built CloudWatch Dashboard into source control too —
      see Decisions
- [ ] Whether to eventually pipe access logs into S3 + Athena for real
      analysis, vs. ad hoc console downloads
- [x] A real revamp of the dashboard itself (grown widget-by-widget so
      far, not designed as a whole) — traffic trends over time, a
      dedicated "pages viewed" widget, and clear activity-vs-sessions
      sectioning — see Decisions

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
the same way if a specific question comes up later, rather than
instrumenting speculatively.

### `RetainTelemetryBeyond30Days` (CwLogEnabled) on by default, for aggregate reporting
**Why:** The RUM console's Events tab only supports browsing individual
events — no count/group-by over custom event fields (e.g. "how many
sessions had each text size" or "most common level range"). Turning on
`CwLogEnabled` mirrors every RUM event, including custom ones, into a
CloudWatch Logs group RUM manages itself, queryable with real aggregate
queries via CloudWatch Logs Insights — see `infra/README.md`'s worked
examples for each of the three custom event types. Costs real (if small —
pennies/month at this app's traffic) CloudWatch Logs ingestion/storage,
which is why this was originally left off by default; flipped once
aggregate reporting became an actual, not speculative, need.
`infra/deploy.sh` passes `RetainTelemetryBeyond30Days=true` as an explicit
`--parameter-overrides` flag rather than relying on the template's own
Default, since `cloudformation deploy` keeps an already-deployed stack's
previous parameter value for anything not passed explicitly — editing the
Default alone wouldn't have changed it on the stack that already existed.

### Installed-vs-browser as a RUM session attribute, not a custom event
**Why:** Whether someone's using the installed PWA or a plain browser tab is
a property of the whole session, the same shape as RUM's own built-in
device/browser/OS dimensions — not a discrete interaction like a date pick.
`src/lib/pwaDisplayMode.ts`'s `isStandalonePwa()` (the standard
`display-mode: standalone` media query, OR'd with iOS Safari's older
`navigator.standalone` fallback) feeds `awsRum.addSessionAttributes({
displayMode: ... })` once at `initRum()` time, rather than a `trackEvent`
call. Filterable the same way as `deviceType`/`browserName`/etc in both
the RUM console's search bar (`displayMode=standalone`) and Logs Insights
(`metadata.displayMode`), and requires no `CustomEvents`-style infra flag.
`isStandalonePwa()` is a plain function, not a hook — display mode doesn't
change mid-session, and `initRum()` runs before React mounts, so it can't
consume a hook anyway. The same function is called directly (unmemoized —
cheap, and stable for the page's lifetime) from `BuildInfo.tsx`'s fine
print, next to the existing Online/Offline segment, so installed-vs-browser
is also visible on the page itself without opening the AWS console at all.

**Correction, from actually reading `aws-rum-web`'s installed source
(`node_modules/aws-rum-web@3.2.0`) during a later data-quality audit**:
session attributes are NOT attached to every event's own `metadata` field
at record time. As of SDK 3.0+, they're sent once per dispatch batch as a
separate payload-level `SessionMetadata` field
(`EventCache.js`: "Consumers merge `{ ...request.SessionMetadata,
...event.metadata }`"), read fresh at actual dispatch time
(`Dispatch.js`'s `getCommonMetadata()`) — not baked into each event when
it's recorded. Doesn't change anything about how this is queried (Logs
Insights still sees a merged `metadata.displayMode` per event, whatever
merges the SessionMetadata in before it lands in CloudWatch Logs), but the
original claim above was simply wrong about the mechanism.

### `addSessionAttributes()` moved into the initial config, after a live data-quality audit found ~15% of sessions missing `displayMode`
**Why:** A CloudWatch console screenshot of the "Installed?" widget showed
7 of 47 sessions with a blank `metadata.displayMode` — not negligible.
First hypothesis (before actually reading the SDK source): a race where
`new AwsRum(...)`'s automatic initial page view — recorded synchronously
inside the constructor, since `pluginManager.enable()` runs before the
constructor returns — beat the following line's separate
`awsRum.addSessionAttributes(...)` call. Reading the actual installed
`aws-rum-web@3.2.0` source (see the correction above) ruled this out as
the mechanism: `SessionMetadata` is computed fresh at dispatch time, long
after both constructor lines have run, so this specific ordering shouldn't
matter. Cross-referencing the "Raw OS Permutations" diagnostic widget
against "Installed?" found every `osName` with blank-`displayMode`
sessions also had valid-`displayMode` sessions for that same OS in
roughly the same proportion — consistent with **most or all of the
blanks being sessions that predate `displayMode` tracking shipping**
(`de6f943`, 2026-08-14 — 2 days before this audit) rather than an ongoing
live bug, though this was inferred from the distribution pattern, not
confirmed via a direct timestamp query (`docs/ops.md` has a query that
would confirm it definitively, not yet run).

Regardless of which explanation accounts for the historical data,
`src/lib/rum.ts` now sets `displayMode` via `sessionAttributes` in the
`AwsRumConfig` object passed to the constructor, instead of a separate
`awsRum.addSessionAttributes(...)` call afterward — `SessionManager.js`
applies `config.sessionAttributes` in its own constructor, so this is
AWS's own documented pattern, not a workaround. Removes the two-call
dependency entirely: previously, if `addSessionAttributes()` ever threw
for any reason (it's wrapped in the same try/catch as construction), that
whole session would silently have no `displayMode` at all, with no retry.
Going forward, every new session's `displayMode` is set atomically as
part of construction.

### `DevicesBrowsersOsQuery` normalizes two confirmed raw-data naming inconsistencies
**Why:** The same audit above surfaced two more issues, unrelated to
`displayMode`, from real session data in the Browser/OS and Raw OS
Permutations widgets: `metadata.osName` reports the same OS as both
`"Mac OS"` and `"macOS"` (confirmed genuinely different strings via the
diagnostic `strlen()` column — 6 vs 5 characters, not just visually
similar), and `metadata.browserName` reports the same browser as both
`"Chrome"` and `"Google Chrome"` (the bare form paired with `osName:
"iOS"` — plausibly Chrome-on-iOS's distinct `CriOS` UA token). Neither is
a bug in the query — both are genuinely different raw values the client
sends — but left as-is they silently split one OS/browser into two rows.
`DevicesBrowsersOsQuery` (`infra/monitoring.yaml`) and the dashboard's
Browser/OS widget (`infra/dashboard.json`) now normalize both via
`case()` before grouping, toward whichever form is more current/common
(`"macOS"`, Apple's present-day branding; `"Google Chrome"`, the more
frequent form seen). Deliberately **not** applied to
`RawOsPermutationsQuery` — that widget exists specifically to show raw,
unnormalized values, which is what exposed this in the first place; also
not applied to `PlatformMixQuery`, whose `osName like /Mac/` substring
matching already tolerates both forms without needing a fix.

### Tablet detection: `isTablet`, a third client-computed session attribute, not the `AWS/RUM`-style automatic route
**Why:** Asked directly, as a follow-up to Platform Mix, whether tablets
could be distinguished from phones. Researched the options first:
`Sec-CH-UA-Form-Factors` (`navigator.userAgentData.getHighEntropyValues
(['formFactor'])`) is the modern, "correct" browser API for this — Chrome
added an explicit `"Tablet"` value in v124, callable from JS with no
server `Accept-CH` opt-in needed — but it's Chromium-only, and confirmed
as of 2026 that Safari (WebKit) has no `navigator.userAgentData` at all.
Since this app's Help page requires Safari for iOS installs, that API
would cover none of the app's actual iPad traffic, which is exactly the
ambiguous case (see the `deviceType`-misclassifies-iPad note two entries
above). It's also async (`Promise`-based), which doesn't fit `initRum()`'s
synchronous, set-once-at-construction `sessionAttributes` pattern
established by the `displayMode` fix above.

Chosen instead: two synchronous UA-string heuristics, well-established
community techniques (not invented here), combined in
`src/lib/deviceFormFactor.ts`'s `isTabletDevice()`:
- `navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1` —
  the standard iPad-reporting-as-Mac workaround (real Macs report
  `maxTouchPoints: 0`, iPads report `10`), covering the exact
  `deviceType`-misclassification case already known here.
- `/Android/.test(userAgent) && !/Mobile/.test(userAgent)` — Android
  phones include a `"Mobile"` token in their UA, tablets omit it; a
  long-standing convention confirmed to have survived Chrome's 2026
  UA-string reduction (which genericized most other UA details but left
  this token distinction intact).
- Plus a plain `/iPad/` check, for older iPadOS or an iPad manually
  switched to "Request Mobile Website" — free to also catch.

Sent as `isTablet: boolean` in `AwsRumConfig.sessionAttributes` alongside
`displayMode`, not a separate call — same reasoning as the `displayMode`
fix above. `PlatformMixQuery`'s `case()` now checks `isTablet` first
(before the phone PWA/browser branches, since a tablet would otherwise
match a phone branch by `osName` alone), splitting out `"Tablet (iOS)"`/
`"Tablet (Android)"` and renaming the existing `"Mobile ..."` buckets to
`"Phone ..."` for clarity now that tablet is its own category — a
deliberate label change, not just an addition, since "Mobile" would
otherwise be ambiguous about whether it still includes tablets.

### The Logs Insights queries themselves, as `AWS::Logs::QueryDefinition` resources
**Why:** `docs/ops.md`'s "Retention and aggregate reporting" section had
accumulated several worked Logs Insights queries (devices/browsers/OS,
installed-vs-browser, platform mix, pages viewed, and one per custom
event) that only ever lived as copy-paste-able code blocks in a markdown
file — asked, directly, to get them into source control instead, so
they're available as SAVED queries in the CloudWatch console (Logs
Insights' own **Queries** tab) rather than requiring a trip back to this
repo's docs every time. `infra/monitoring.yaml` gained one
`AWS::Logs::QueryDefinition` resource per query, deployed as part of the
same `dance-schedule-monitoring` stack (`./infra/deploy.sh`) — no new
stack, no new script, consistent with this file's own "plain
CloudFormation, one small stack" decision above.

No `LogGroupNames` property on any of them: each query's own `SOURCE
dataSource(['amazon_cloudwatch.rum_app_monitor'])` clause queries RUM's
managed data directly, the same syntax `docs/ops.md`'s own examples
already used — this sidesteps the CwLog group's own name entirely, which
CloudFormation has no way to reference anyway (it isn't exposed as a
`Fn::GetAtt` on `AWS::RUM::AppMonitor`, and per `docs/ops.md`'s own note,
isn't even a fixed, predictable string — the only way to learn it is `aws
rum get-app-monitor` after the fact). A saved query with this `SOURCE`
clause works regardless of which log group happens to be selected in the
console when you open it from the Queries tab.

**Deliberately excludes `docs/ops.md`'s own "minimum-level histogram"
query.** That query's own `case()` branches map each level label to a
difficulty rank that depends on which slots the CURRENT event's actual
schedule data populates (confirmed there: not fully determined by the
`combineA1A2`/`combineC3BC4` flags alone) — a version baked into
CloudFormation would silently go stale the next time this app points at a
different event, rather than getting hand-edited at the moment it's
actually used, which is what the doc's own copy already expects. The six
queries that WERE saved are all stable across events/deployments — nothing
about them depends on a specific event's own data.

`monitoring.yaml`'s copies are kept in sync with `docs/ops.md`'s own query
text by hand, not generated from one shared source — there's no tooling in
this repo that reads CloudFormation YAML into markdown or vice versa, and
seven queries is small enough that duplication is cheaper than building
one. `docs/ops.md` stays the place explaining WHY each query is shaped the
way it is; `monitoring.yaml` just needs the query text itself to deploy
them.

**A real bug in the platform-mix query, caught while cross-checking against
a genuinely working query (see the Dashboard decision below): the session-id
field was wrongly written as `metadata.sessionId`.** It isn't — per
`docs/ops.md`'s own "Page loads vs. sessions vs. users/devices" table
(already documented, just not cross-referenced when the platform-mix query
was first written), session/user identity lives under `user_details`, not
`metadata`. Every OTHER field that query needed (`deviceType`, `osName`,
`displayMode`) genuinely does live under `metadata`, which is what made the
wrong guess plausible enough not to question at the time. Fixed in both
`docs/ops.md` and `infra/monitoring.yaml`'s `PlatformMixQuery` to
`user_details.sessionId`.

### The hand-built CloudWatch Dashboard, exported into `monitoring.yaml` too
**Why:** A dashboard pinning several of the queries above (plus a couple of
event-specific ones — the min/max level histograms, see the exclusion note
above; a dashboard's own widgets aren't asked to stay valid across events
the way a permanently-saved query is, so keeping them here despite that
caveat is a smaller compromise) had been built by hand directly in the
CloudWatch console — asked, directly, to get that into source control too,
the same reasoning as the saved queries above: redeployable/diffable,
not living in only one AWS account. `infra/monitoring.yaml` gained a
`RumDashboard` (`AWS::CloudWatch::Dashboard`) resource, its `DashboardBody`
the exported widget JSON (`aws cloudwatch get-dashboard`), cleaned up
(stray blank lines/trailing whitespace — see the console-copy-quirk note
in `docs/ops.md`) and pretty-printed for readability, but otherwise
unchanged in substance — same widgets, same positions, same queries.
(This round embedded the JSON directly in `monitoring.yaml`, `region`
inside each widget's `properties` switched from a hardcoded `"us-east-2"`
to `${AWS::Region}` via `Fn::Sub` — superseded by the standalone-file
version below, which moved `region` back to a literal for a different
reason; see that entry.)

**New `DashboardName`, not the original hand-built dashboard's own name.**
CloudFormation can't adopt an existing, unmanaged resource just by having a
new resource declare the same name — deploying an `AWS::CloudWatch::
Dashboard` whose name collides with one that already exists outside
CloudFormation fails outright rather than taking it over. `!Sub
'${AppMonitorName}-dashboard'` avoids that collision by construction. The
old, hand-built dashboard isn't deleted automatically — a human needs to
compare the new one and delete the old one themselves once satisfied (see
`infra/README.md`), the same "verify, then remove the old one" pattern
used whenever a resource is being migrated into IaC after the fact,
consistent with this project's general caution around destructive/manual
cleanup steps.

**This exercise is also what caught the `metadata.sessionId` /
`user_details.sessionId` bug above** — the dashboard's own "Traffic"
widget, built and actually exercised live in the console (unlike the
platform-mix query, which had never been run against real data before
this), used `user_details.sessionId` correctly, exposing the platform-mix
query's own wrong guess by direct comparison.

**A "Platform Mix" widget, using the now-fixed `PlatformMixQuery` text,
was added to the dashboard in a follow-up** (below "Level Range," same
`bar` view) — the original export (above) predates that query even
existing; once it did, pinning it alongside the other bucketed-count
widgets (MinLevel/MaxLevel/Level Range) was a small, obvious addition
rather than leaving it only reachable via the Queries tab.

**A second real bug in the same query, caught only once it was deployed
and run against real traffic: `metadata.deviceType` is NOT a reliable
mobile/desktop signal.** The `sessionId` fix above still left every
`case()` branch gated on `deviceType = "mobile"`/`"desktop"` — deployed,
and the actual dashboard widget showed only "Desktop (Mac)" and "Other,"
no mobile buckets at all, despite this being a mobile-first app. Cross-
checked against the "Devices, browsers, OS" widget's own live data: a
real session had `deviceType: "desktop"`, `osName: "iOS"`,
`browserName: "Mobile Safari"` — RUM's UA parser had classified an iOS
device as desktop. This tracks with a documented iPadOS behavior, not a
RUM-specific bug: iPadOS has sent a desktop-style User-Agent by default
since iPadOS 13 (so iPad gets full desktop websites), indistinguishable
from real macOS Safari by UA string alone unless a parser also checks for
touch capability — evidently this one doesn't. Fixed by dropping
`deviceType` from the query entirely and keying the mobile/desktop split
off `osName` alone (`"iOS"`/`"Android"` vs. `"Mac OS"`/`"Windows"`), which
stayed correct for the same misclassified session. Accepted consequence:
an iPad in its default browsing mode now buckets under "Mobile (iOS)"
indistinguishably from an iPhone — nothing in this data reliably
separates them, and the six buckets originally asked for didn't call for
that split anyway.

This is the second time in this same query that a live check against
actually-deployed data caught a wrong assumption that looked entirely
reasonable on paper (`metadata.sessionId` before, `deviceType = "mobile"`
here) — worth remembering as a standing caution for any FUTURE
`case()`-style bucketing added here: verify field values against a real,
already-running widget/query before trusting what a field's own NAME
seems to promise.

**A third round, after generating real iPhone traffic specifically to test
the fix above (both a plain Safari-tab visit and the installed PWA):
still landed entirely in "Other."** The **Devices, browsers, OS** widget
showed `osName: "iOS"` for that session — a value that looks identical to
the query's own `"iOS"` string literal, yet the exact-match `case()`
branches still didn't catch it. Never fully root-caused (a value read off
the console and retyped into chat can't rule out invisible whitespace or a
different character than it appears to be — see `docs/ops.md`'s own note
on the console's copy-quirk elsewhere in this same investigation), but
rather than chase it further, EVERY `osName` branch — not just Mac/Windows,
which already used this — was switched from exact `=` to a `like /.../`
substring match. This sidesteps the question of what, exactly, was
different about the string, at effectively no cost: no other real
`osName` value contains "iOS" or "Android" as a substring, so there's no
new false-positive risk from loosening the match.

Three real bugs now, in the same ~10-line query, each one only found by
generating or observing REAL traffic rather than reasoning from the
field's own name or a plausible-looking assumption — worth treating as
the standing pattern for this specific query (and this whole
custom-event/RUM-metadata area generally) rather than three unrelated
one-offs: values that look identical when read off a browser-based
console UI are not guaranteed to be byte-identical, and exact-match
comparisons in Logs Insights queries against console-observed strings
should default to `like` unless there's a specific reason exact equality
is needed.

**A fourth diagnostic widget, "Raw OS Permutations," added after the
`like` fix above still didn't fully explain itself — not a bucketed query
at all, just every actual `(osName, displayMode, deviceType)` combination
present in the data, with `strlen(osName)` as its own column
specifically to catch invisible characters (trailing whitespace, a
non-breaking space) that a value read off the console and retyped into
chat can't reveal on its own.** Given the standing pattern just above —
three wrong guesses in a row despite each one looking reasonable — the
right move stopped being "guess a fourth condition" and became "stop
guessing, look at the raw ground truth directly." `RawOsPermutationsQuery`
(a `QueryDefinition`, saved and reusable like the others) backs it.

**The dashboard's own JSON moved out of `monitoring.yaml` entirely, into
its own file (`infra/dashboard.json`) — asked directly, once manual
console edits (dragging a widget to reposition/resize it, far easier than
hand-editing coordinates) became a real, recurring part of the workflow,
not a one-time export.** Plain CloudFormation has no `include`-external-
file directive, so getting the file's content INTO the deployed template
needs some mechanism — two were tried; only the second actually works.

**First attempt: a `String` Parameter (`DashboardBody`), with
`./infra/deploy.sh` reading `dashboard.json` and passing it via
`--parameter-overrides`. Deploys successfully, but fails at the very next
real deploy with a length error — CloudFormation Parameter VALUES are
hard-capped at 4096 bytes, and this dashboard's own JSON is already over
6000.** This wasn't caught by validating the YAML/JSON locally (both parse
fine — the limit is a CloudFormation SERVICE constraint on parameter
values, not a syntax rule any local tool checks) or by the earlier,
smaller version of the dashboard (5-6 widgets, likely still under the
cap) — only surfaced once actually deployed with the widget count this
round had grown to. Confirmed directly, not just assumed: a throwaway
script printing `argv` back DID show the JSON arriving intact as one
~6KB shell argument (ruling out a shell-quoting problem specifically),
but CloudFormation's own API still rejected it outright once it reached
AWS.

**Fixed by dropping the Parameter entirely and doing plain TEXT
substitution instead — `monitoring.yaml` keeps a literal placeholder
line (`__DASHBOARD_JSON_PLACEHOLDER__`) inside `RumDashboard`'s
`DashboardBody` block scalar, and `./infra/deploy.sh` replaces that one
line with `dashboard.json`'s own content (each line re-indented to
match) before deploying — from a temp file, never `monitoring.yaml`
directly.** This works because the 4096-byte cap is specific to
Parameter VALUES — a property embedded directly in a resource has no
such per-value limit (confirmed by the ORIGINAL, pre-Parameter version of
this same dashboard, which deployed fine as an inline block scalar days
earlier). A block scalar (`|-`), not a double-quoted string, is what
makes line-by-line splicing safe here: it needs no quote/backslash
escaping of the JSON's own content, only consistent indentation, so a
short Python script (invoked from `deploy.sh` via a heredoc, not a
separate file — small and single-purpose enough not to warrant its own
script) can do the substitution correctly with nothing fancier than
string operations.

**A new, symmetric `./infra/download-dashboard.sh` script — the reverse
of `deploy.sh` — pulls the LIVE dashboard back out of AWS and overwrites
`dashboard.json` with it,** so a manual console edit can be folded back
into source control just as easily as a local edit can be pushed out:
`aws cloudwatch get-dashboard --query DashboardBody`, piped through `jq
'.'` to re-pretty-print AWS's own compact single-line response (without
that, every download would replace the whole file as one line and make
`git diff` useless for actually seeing what changed) — followed, per the
script's own printed reminder, by `git diff` to review and a normal
commit. The two scripts are exact inverses; whichever one is run more
recently wins, and editing both sides (console AND file) without syncing
in between means the next deploy/download silently overwrites one with
the other — an accepted risk at this project's scale (one person,
infrequent dashboard changes) rather than something worth building
conflict detection for.

**`region` inside each widget moved back to a literal `"us-east-2"`,
reverting the previous round's `${AWS::Region}` substitution — not a
mistake being undone, but a genuine change in what became possible.**
`Fn::Sub`'s pseudo-parameter substitution only runs on strings
CloudFormation itself evaluates as part of the template. `dashboard.json`
is plain JSON, read and spliced in as inert text by `deploy.sh`'s own
Python step — CloudFormation never evaluates ITS content as template
syntax at all (only the placeholder LINE it replaces is ever part of the
template CloudFormation sees), so a `${AWS::Region}` token inside the
JSON would just be sent to AWS as a literal, uninterpreted string, not
substituted. Since `deploy.sh` already hardcodes `REGION=us-east-2` for
the stack itself, this is a real constraint costing nothing in
practice — the app is single-region by design already — rather than a
portability regression worth working around.

### Dashboard reorganized into three sections, plus a real time-series widget
**Why:** Asked directly to revamp `infra/dashboard.json`, which had grown
widget-by-widget (each one added to answer a specific question in the
moment — Browser/OS, Installed?, Traffic, Font, MinLevel/MaxLevel/Level
Range, Platform Mix, Raw OS Permutations) rather than being designed as a
whole. Three markdown `text` widgets (`## Traffic`, `## Sessions &
Devices`, `## Session Demographics`) now group every existing widget by
the activity-vs-session distinction `docs/ops.md`'s "Page loads vs.
sessions vs. users/devices" table already treated as worth documenting at
length, but that the dashboard itself never surfaced visually — every
widget under Sessions & Devices / Session Demographics now counts distinct
sessions (`count_distinct(user_details.sessionId)`), while only Traffic's
own widgets (totals, Pages Viewed, both Request Rate widgets) count raw
page-load events — see the follow-up entry below for why this went further
than the original three-section split alone. A new **Pages Viewed** table
(`PagesViewedQuery`'s existing query text, unchanged — just newly pinned
as a widget) joins Traffic, since it existed as a saved query but was
never on the dashboard itself.

**The new `Request Rate` widget uses a Logs Insights `bin(1d)` query
rendered with `"view": "timeSeries"` on a `"type": "log"` widget, not the
native `AWS/RUM` CloudWatch metric namespace.** CloudWatch supports this
directly — a log widget's `view` property accepts `timeSeries`
specifically to render a `bin()`-grouped Logs Insights result as a line
graph (confirmed against AWS's own Dashboard Body Structure reference).
Chosen over the `AWS/RUM` metric namespace (which RUM also publishes
built-in metrics like `PageViewCount` to) to avoid a second AWS service
surface this project doesn't otherwise touch: that namespace's exact
dimension name (e.g. `application_name`) isn't visible anywhere in this
repo, and confirming it would need a live, authenticated `aws cloudwatch
list-metrics` call — every query in this project is already Logs Insights,
so staying there means one query mechanism, no new IAM permissions, and no
dimension-name guessing risk. The query is also saved standalone as
`RequestRateQuery` in `infra/monitoring.yaml`, matching every other
non-event-specific query already saved that way.

### Follow-up refinement, before this ever shipped: session-dedup everywhere except Traffic, a pinned-3h widget, header height, and a sort
**Why:** Reviewed before deploying and asked for four fixes to the layout
above. **Header `height` dropped from `2` to `1`** — `2` was a guess
(flagged as unverified in the original plan) that turned out to be excess
whitespace once actually looked at.

**A second time-series widget, "Request Rate (Last 3h)"**, added next to
the daily one — bucketed finer (`bin(15m)`) and pinned via widget-level
`"start": "-PT3H", "end": "P0D"` so it always shows the last 3 hours
regardless of whatever the dashboard's own time-range picker happens to be
set to (unlike every other widget here, which inherits that picker). The
daily widget was renamed "Request Rate (Daily)" to disambiguate. Also
saved standalone as `RequestRateRecentQuery` (`infra/monitoring.yaml`) —
though a saved `QueryDefinition` has no equivalent of the widget-level
pinning, so running it standalone means picking your own time range.

**Browser/OS sorted by `sessions desc`** — previously unsorted (Logs
Insights' own arbitrary `stats` grouping order), now explicit.

**Every widget outside the Traffic section switched from `count(*)` to
`count_distinct(user_details.sessionId)`** — Browser/OS, Installed?,
MinLevel, MaxLevel, Font, and Level Range all previously counted raw
events, inconsistent with Platform Mix and Raw OS Permutations (which
already deduplicated by session, from the three-bugs history above). This
matters more than it looks: `text_size_preference` and
`dance_schedule_level_range` both fire on every page load AND every
subsequent change (`docs/ops.md`'s own event-type table), so `count(*)`
on either was counting a single session's own repeated filter/preference
changes as if they were separate people, not just inflating multi-page
sessions the way a page-view-keyed query would. `infra/monitoring.yaml`'s
`DevicesBrowsersOsQuery`, `InstalledVsBrowserQuery`, `FontSizeQuery`, and
`LevelFilterRangeQuery` were updated to match (`LevelFilterRangeQuery` has
no exact corresponding dashboard widget, but was updated too for
consistency with everything else in the file). Traffic's own widgets
(totals, Pages Viewed, both Request Rate widgets) are the deliberate
exception — they exist specifically to measure raw page-load volume, not
session counts.

## Open questions

- Should access logs eventually be piped into S3 + Athena automatically
  (e.g. a small scheduled Lambda), or is manual console download sufficient
  indefinitely given the traffic volume? See `infra/README.md`'s Athena
  note.
