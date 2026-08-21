# Ops: what's in the AWS console, and how to check it

A practical reference for checking on the live app's AWS-side state —
what's actually running, what data is being collected, and where to look
for it in the console. Complements `infra/README.md` (how to deploy/change
the infra) and `docs/design/monitoring.md` / `docs/design/hosting.md` (why
it's built this way) — this doc is just "where do I look, and what should
I expect to see."

Region for everything below: **us-east-2** (Ohio).

## Amplify Hosting

Console: **AWS Amplify → Hosting → your app**.

| What | Where | What you should see |
| --- | --- | --- |
| Build/deploy status | Branch (`main`) → deployment history | One entry per push to `main`, each showing provision/build/deploy/verify phase status. A push should trigger a new build within ~1 minute; a full build+deploy typically finishes in a few minutes. |
| Environment variables | App settings → Environment variables | `VITE_RUM_APP_MONITOR_ID`, `VITE_RUM_IDENTITY_POOL_ID`, `VITE_RUM_REGION` — set via `infra/set-amplify-env.sh`, not by hand (see `infra/README.md`). Missing/stale values here mean the next build won't collect RUM data — `src/lib/rum.ts` silently no-ops rather than erroring. |
| Domains | App settings → Domain management | `sqdance.app` (custom) and the platform-provided `<branch>.<app-id>.amplifyapp.com` URL, both live. |
| Rewrites and redirects | App settings → Rewrites and redirects | SPA fallback rules — one root rule plus one rewrite+redirect pair per content set (`automated-testing`, `test`, ...). Generated from `infra/amplify-rewrites.json`, pushed via `./infra/apply-amplify-rewrites.sh` — not hand-typed here, see the Scripts reference below. Check this first if a direct link to a non-root route 404s after adding a new content set (usually means the generator/apply script wasn't re-run). |
| Access logs | Monitoring → Access logs | Per-request logs (path, status, referrer, **User-Agent**, timestamp) for any 2-week window you pick, downloadable as CSV. No setup, no retention limit, always available — see `infra/README.md`. This is the fallback for raw traffic data if CloudWatch RUM (below) is ever unavailable or you need pre-RUM historical data. |
| Aggregate metrics | Monitoring → (default CloudWatch metrics graphs) | Request count, bytes served, 4xx/5xx rate — coarse, no device/browser breakdown. RUM below is the richer source for that. |

## CloudWatch RUM

Console: **CloudWatch → RUM → app monitors → `dance-schedule`**
(or directly: CloudWatch home → left nav → *Application monitoring* → *RUM*).
Requires signing into the AWS console (IAM user or root) — not accessible
via a bare link without auth.

Provisioned by `infra/monitoring.yaml`; see `docs/design/monitoring.md` for
why RUM was chosen over access-log parsing or a third-party analytics
vendor.

### Verifying it's actually sending data (browser DevTools, no AWS login needed)

The fastest sanity check doesn't require console access at all:

1. Open the site, then DevTools → **Network** tab, filter by `rum`.
2. Reload. RUM batches events and flushes on a timer or on page-hide, not
   instantly — give it a few seconds, or switch tabs and back, before
   concluding nothing's happening.
3. Look for a **POST** to
   `dataplane.rum.<region>.amazonaws.com/appmonitors/<app-monitor-id>`.
   Expect **200**. A **403** means the guest role/identity pool is
   misconfigured; **no request at all** (not even one to
   `cognito-identity.<region>.amazonaws.com` — the credentials call, which
   only fires once per session and may be cached from an earlier visit)
   means `initRum()` never ran — check the three `VITE_RUM_*` env vars
   actually made it into that build.
4. Click the request → **Payload**/**Request** tab → the body is a JSON
   `RumEvents` array. Each event has a `metadata` object — that's where
   `deviceType`/`browserName`/`osName`/**`displayMode`** all live (see
   "Overview / dashboard tab" below) — and, for this app's three custom
   event types, a `details` field with whatever was passed to `trackEvent`.

**If you just deployed and want to confirm the *newest* code, not a
cached one**: this is a PWA with a service-worker precache — a fresh
deploy can sit "waiting" in DevTools → **Application** → **Service
Workers** until the app's own update-prompt UI fires, so a reload alone
doesn't guarantee you're testing the latest build. Confirm via **Sources**
→ find the loaded `index-*.js` → check its content, or just trust the
update-prompt banner once it appears.

### Overview / dashboard tab

Built-in telemetry, collected from every page load automatically (no code
changes needed to get more of this):

- **Sessions and page views over time**
- **Device type** — desktop / mobile / tablet
- **Browser and OS** — Chrome/Safari/Firefox split, iOS/Android/desktop OS
- **Geography** — coarse, IP-derived country/region
- **Page performance** — Core Web Vitals per page (load time, interactivity)
- **JS errors** — unhandled exceptions with stack traces
- **HTTP errors** — failed asset/API requests
- Individual session traces (drill into one visitor's timeline)

100% of sessions are sampled (`SessionSampleRate: 1` in `monitoring.yaml`) —
this is real data, not an estimate, given the app's traffic volume stays
well inside RUM's free tier.

**Installed vs. browser tab** (`displayMode`: `standalone`/`browser`) isn't
one of RUM's own built-in dimensions, but a custom *session attribute*
(`src/lib/rum.ts`'s `initRum` calls `awsRum.addSessionAttributes(...)` once
per session — see `docs/design/monitoring.md`'s decision for why a session
attribute rather than a custom event). AWS attaches session attributes to
every event's own `metadata`, the same place `deviceType`/`browserName`
live, so it's filterable the same two ways as those: the console's search
bar (`displayMode=standalone`) or a Logs Insights `metadata.displayMode`
query. Also shown as plain fine print on the home page itself (next to the
Online/Offline text) — no AWS console needed for a quick check.

### Page loads vs. sessions vs. users/devices

Worth being explicit about, since every aggregate query on this page (and
in `infra/README.md`) counts one of three meaningfully different things
unless it says otherwise:

| Level | What it counts | Field | Notes |
| --- | --- | --- | --- |
| **Page loads** | Every navigation, including this SPA's client-side route changes — not just full browser reloads | raw event count (`count(*)`, typically filtered to `event_type = "com.amazon.rum.page_view_event"`) | What every query on this page counts by default, unless it explicitly deduplicates below |
| **Sessions** | One per visit — everything a visitor does in one sitting shares an ID | `user_details.sessionId` — `count_distinct(user_details.sessionId)` | Mainly useful as a deduplication step (see below), less often the number you actually want to report |
| **Users/devices** | An anonymous UUID persisted via cookie (`allowCookies: true`, on for this app), surviving across separate visits on the *same* browser | `user_details.userId` — `count_distinct(user_details.userId)` | Really "distinct browser instances," not people — someone with a phone and a laptop is 2. Absent if cookies are ever disabled. |

For this app, **page loads and unique devices** are the two numbers worth
tracking for usage — sessions mostly matter as the deduplication key for
the custom-event queries below (e.g. not over-counting someone who dragged
the level slider three times in one sitting as three separate "uses").

All three at once:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields user_details.userId as userId, user_details.sessionId as sessionId
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) as pageLoads, count_distinct(sessionId) as sessions, count_distinct(userId) as devices
```

Every one of this page's custom-event queries (level range, text size,
date selected) counts raw event fires by default — page-load-equivalent,
not sessions. To count unique sessions instead, bring
`user_details.sessionId as sessionId` into the `fields` step and swap
`count(*)`/`count(*) by ...` for `count_distinct(sessionId)`/
`count_distinct(sessionId) by ...`. The minimum-level histogram, deduplicated
by session:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.min as minLevel, user_details.sessionId as sessionId
| filter event_type = "dance_schedule_level_range"
| stats count_distinct(sessionId) as uniqueSessions by minLevel
| sort uniqueSessions desc
```

### Known gap: offline sessions undercount

RUM data silently misses some offline/flaky-connection activity — this is a
real, if minor, undercount to keep in mind when reading session/event
counts, not a bug to chase. Verified directly in `aws-rum-web`'s dispatch
code (`@aws-rum/web-core`'s `Dispatch.js`/`EventCache.js`): events queue
client-side and get sent on a timer or on page-hide, but the batch is
pulled out of the local queue *before* the send is attempted — a failed
send (offline, or a dropped connection mid-retry) is logged and swallowed
(consistent with `src/lib/rum.ts`'s "must never throw" design), and those
events are gone, not requeued for the next time the device is back online.
`initRum()` also doesn't check `navigator.onLine` before initializing, so a
page opened entirely offline — a real, expected case for this PWA — still
queues events locally as normal; they only make it out if a dispatch
attempt happens to land while the device has connectivity. Net effect: a
visitor who uses the app entirely or mostly offline appears in RUM data
less than they actually used the app, with no error surfaced anywhere. Not
worth engineering around at this app's scale — just don't read "RUM session
count" as a literal, complete count of app usage.

### Events tab — custom, app-specific events

Search by event type. Three exist today (added in `useDanceScheduleFilters.ts`
and `useTextSizePreference.ts` — see `docs/design/monitoring.md`'s custom-events
decision for the full rationale):

| Event type | Fires when | Payload |
| --- | --- | --- |
| `dance_schedule_date_selected` | User picks a date on any dance-schedule-family page | `{ date: "YYYY-MM-DD" }` |
| `dance_schedule_level_range` | On every page load, and on every subsequent change the user actually makes (slider drag, tick click, or "Show all levels") — NOT when switching to a date whose present range happens to trim the view; see `useDanceScheduleFilters.ts`'s userMin/MaxLevelIndex vs. minLevelIndex/maxLevelIndex split | `{ min: "<slot label>", max: "<slot label>" }` (e.g. `"A2"`, `"C3B+"`) |
| `text_size_preference` | On every page load, and on every subsequent change | `{ textSize: "normal" \| "large" \| "x-large" }` |

`dance_schedule_level_range` and `text_size_preference` both fire
on every page load, not just when someone changes the setting — deliberate,
since it's what makes the event data reflect the *current distribution* of
each setting across visitors, not just interaction counts.
`dance_schedule_date_selected` stays interaction-only (a "current date"
snapshot isn't a meaningful distribution the way a persisted preference
is). See `src/lib/rum.ts`'s `trackEvent` and its call sites for the actual
wiring; add a new call site there the same way if another question comes
up, rather than instrumenting speculatively.

Adding a new custom event type requires no infra change — `CustomEvents` is
already `ENABLED` on the app monitor; just add another `trackEvent(...)`
call site and redeploy the app.

### Alerting

See `docs/design/alerting.md` for the full rationale. Console: **CloudWatch
→ Alarms → `dance-schedule-js-errors`** (same region, us-east-2).

| What | Where | What you should see |
| --- | --- | --- |
| Alarm state | CloudWatch → Alarms → `dance-schedule-js-errors` | `OK` normally; `ALARM` within ~5 minutes of any real JS error (default threshold: 1). `Insufficient data` briefly after a fresh deploy is normal, not a problem. |
| Notifications | SNS → Topics → `dance-schedule-alerts` → Subscriptions | One `email` subscription, status `Confirmed` — if it still says `PendingConfirmation`, the one-time confirmation link was never clicked (see `infra/README.md`) and nothing will ever notify. |
| The underlying data | This section's own dashboard — "## Errors" widgets, or the `JsErrorRateQuery`/`JsErrorsQuery` saved queries below | A rate graph plus a table of individual errors (message, filename/line, page) — see the "Retention and aggregate reporting" queries below for the exact query text. |

**Muting alerts** while actively investigating a known issue (stops
notifications, not evaluation — the alarm's own state keeps updating
normally, so this isn't the same as losing visibility):

```bash
./infra/disable-js-error-alarm.sh   # mute
./infra/enable-js-error-alarm.sh    # un-mute
```

Nothing reminds you to run the second one — muting is meant to be a short,
deliberate window, not a way to forget about an alarm.

### Retention and aggregate reporting

RUM itself keeps data 30 days, browsable only one event at a time in the
Events tab — no count/group-by queries. `RetainTelemetryBeyond30Days`
(`infra/monitoring.yaml`) is **on** by default specifically for this: it
mirrors every event, including custom ones, into a CloudWatch Logs group
RUM manages itself, which CloudWatch Logs Insights can run real aggregate
queries against (and which isn't subject to the 30-day cutoff). Costs real
(if small) CloudWatch Logs ingestion/storage — flip it back off and
redeploy (`./infra/deploy.sh`) if that stops being worth it.

Find the log group (its name isn't a fixed, predictable string):

```bash
aws rum get-app-monitor --name dance-schedule --region us-east-2 \
  --query 'AppMonitor.DataStorage.CwLog.CwLogGroup'
```

Then in the CloudWatch console → **Logs → Logs Insights**, pick that log
group. Every event has `event_type` (a plain string like
`dance_schedule_level_range` for this app's custom events; a
`com.amazon.rum.*`-namespaced string for RUM's built-in ones) plus
`metadata.*` (browser/OS/device/page, present on every event) and
`event_details.*` (the event-type-specific payload — for custom events,
whatever object you passed to `trackEvent`).

The queries below (all but the minimum-level histogram — see its own
note) are also saved in `infra/monitoring.yaml` as `AWS::Logs::
QueryDefinition` resources, and pinned on the dashboard
(`infra/README.md`'s own Dashboard section) — no copy-pasting from here
needed day to day; this section exists to explain WHY each one is shaped
the way it is, and as the thing `monitoring.yaml`'s own copies get kept in
sync with by hand. If you DO ever need to copy query text out of the
console itself (editing a saved query, or a dashboard widget, directly in
the AWS UI) rather than from here or the CLI, watch out: the console's own
copy-from-editor has a real, repeatedly-confirmed quirk of injecting stray
blank lines and trailing whitespace into multi-line queries, which then
breaks re-pasting that text elsewhere (e.g. back into this file, or into
`monitoring.yaml`). Prefer pulling the text via the CLI instead —
`aws logs describe-query-definitions` for saved queries,
`aws cloudwatch get-dashboard --query 'DashboardBody'` for a dashboard's
widgets (see `infra/README.md`) — both return the raw string with no
rendering artifacts.

**Request rate over time (page views per day)** — the one genuinely
time-series query/widget here; every other one below is a point-in-time
breakdown over whatever range the dashboard's own time picker happens to
have selected, but this one buckets by day (`bin(1d)`) so it can render as
a line graph. Uses CloudWatch's native support for visualizing a Logs
Insights `bin()`-grouped result as a `"view": "timeSeries"` dashboard
widget, rather than the separate `AWS/RUM` CloudWatch metric namespace RUM
also publishes to (`PageViewCount` etc.) — keeps every query on this page
and in `infra/monitoring.yaml` on one mechanism, with no new dimension
names to get right and no new IAM permissions needed:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields @timestamp
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) as pageViews by bin(1d)
```

The dashboard also pins a second copy of this, "Request Rate (Last 3h)",
bucketed finer (`bin(15m)`) and pinned via widget-level `start`/`end`
(`-PT3H`/`P0D`) to always show the last 3 hours regardless of whatever the
dashboard's own time-range picker is set to — useful as an at-a-glance
"is anything happening right now" check independent of whoever else is
looking at the dashboard with a different range selected. Same query
shape, saved separately as `RequestRateRecentQuery` since a saved query
has no equivalent of that pinning (you'd pick your own range when running
it standalone):

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields @timestamp
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) as pageViews by bin(15m)
```

**Devices, browsers, OS, by session, not raw page-view count** — already
graphed natively in the Overview tab above with no query needed; the
equivalent Logs Insights query (useful if you want to cross-tabulate with
something the dashboard doesn't offer, or already have Logs Insights
open). `count_distinct(user_details.sessionId)`, not `count(*)`, same
reasoning as the platform-mix query below — a multi-page session
shouldn't inflate its own device/browser/OS bucket relative to a
single-page one.

**Two raw-value naming inconsistencies get normalized here before
grouping**, confirmed live from real session data: `osName` reports the
same OS as both `"Mac OS"` and `"macOS"` (different lengths — 6 vs 5
characters — confirmed via the diagnostic `strlen()` widget below, not
just eyeballed), and `browserName` reports the same browser as both
`"Chrome"` and `"Google Chrome"` (the bare `"Chrome"` form paired with
`osName: "iOS"` — likely Chrome-on-iOS's `CriOS` UA token parsing
differently than desktop/Android Chrome's). Neither is a bug in this
query — genuinely different raw values come from the client's own UA
string — but left ungrouped they silently split what's really one
OS/browser into two rows. Normalized toward whichever form is more
common/current (`"macOS"`, Apple's current branding; `"Google Chrome"`,
the more frequent of the two forms seen), deliberately **not** applied to
the Raw OS Permutations query below, which exists specifically to show
these values un-normalized — that's what exposed the inconsistency in the
first place:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields metadata.deviceType, metadata.browserName, metadata.osName, user_details.sessionId as sessionId
| filter event_type = "com.amazon.rum.page_view_event"
| fields case(metadata.osName = "Mac OS", "macOS", metadata.osName) as osName,
         case(metadata.browserName = "Chrome", "Google Chrome", metadata.browserName) as browserName
| stats count_distinct(sessionId) as sessions by metadata.deviceType, browserName, osName
| sort sessions desc
```

**Installed vs. browser tab** — a custom session attribute, not a built-in
dimension, but it lives in `metadata` too (see above), so the same query
shape works, session-deduplicated for the same reason:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields metadata.displayMode, user_details.sessionId as sessionId
| filter event_type = "com.amazon.rum.page_view_event"
| stats count_distinct(sessionId) as sessions by metadata.displayMode
```

**Platform mix — tablet, phone PWA, phone browser, or desktop (Mac/PC), by
session, not raw page-view count** — combines three dimensions (`osName`,
the `displayMode` session attribute above, and the `isTablet` session
attribute below) into one bucketed breakdown.
`count_distinct(user_details.sessionId)`, not `count(*)`, same reasoning
as every other non-Traffic query on this page (Pages Viewed and the two
Request Rate queries are the only ones that genuinely count raw page
loads, not sessions — a page LOAD is exactly what those are meant to
measure): a "how many visits looked like X" question should count each
SESSION once, not once per page viewed during it, or a multi-page visit
inflates its own bucket relative to a single-page one.
`user_details.sessionId`, not `metadata.sessionId` — see "Page loads vs.
sessions vs. users/devices" above; session/user identity lives under
`user_details`, not `metadata` (an earlier version of this query got that
wrong, since every OTHER field it needed genuinely does live under
`metadata`, easy to assume the session id would too):

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields metadata.osName, metadata.displayMode, metadata.isTablet, user_details.sessionId as sessionId
| filter event_type = "com.amazon.rum.page_view_event"
| fields case(
    metadata.isTablet = true and metadata.osName like /iOS/, "Tablet (iOS)",
    metadata.isTablet = true and metadata.osName like /Android/, "Tablet (Android)",
    metadata.osName like /iOS/ and metadata.displayMode = "standalone", "Phone PWA (iOS)",
    metadata.osName like /Android/ and metadata.displayMode = "standalone", "Phone PWA (Android)",
    metadata.osName like /iOS/, "Phone browser (iOS)",
    metadata.osName like /Android/, "Phone browser (Android)",
    metadata.osName like /Mac/, "Desktop (Mac)",
    metadata.osName like /Windows/, "Desktop (PC)",
    "Other"
  ) as platform
| stats count_distinct(sessionId) as sessions by platform
| sort sessions desc
```

**Tablet branches are checked first, before the phone (PWA/browser)
branches** — `case()` takes the first matching condition, so a tablet
would otherwise fall into a "Phone ..." bucket, matching by `osName`
alone the same as a phone would. `metadata.isTablet` isn't anything RUM
derives itself — it's a client-computed session attribute
(`src/lib/deviceFormFactor.ts`, set in `src/lib/rum.ts`'s
`sessionAttributes` the same way `displayMode` is), because neither
`osName` nor `deviceType` can tell a tablet from a phone or desktop, as
the next two paragraphs explain.

**Deliberately does NOT filter on `metadata.deviceType` at all, even
though "phone PWA/browser" sounds like exactly what that field is for.**
An earlier version required `deviceType = "mobile"` on every mobile
branch — confirmed live it silently misclassifies real traffic: RUM's own
`deviceType` reported `"desktop"` for a session whose `osName` was
correctly `"iOS"` and `browserName` was `"Mobile Safari"` (visible directly
in the **Devices, browsers, OS** widget/query above — that's what exposed
this). This is a known UA-parsing quirk, not a fluke: iPadOS has sent a
desktop-style User-Agent string by default since iPadOS 13 (Apple's own
"Request Desktop Website" default, so iPad gets full desktop sites) —
indistinguishable from actual macOS Safari by UA string alone unless a
parser also checks touch-capability signals, which apparently this one
doesn't. `osName`, by contrast, stayed correct for that same session — so
this query keys off `osName` alone (`"iOS"`/`"Android"` → phone/tablet,
`"Mac OS"`/`"Windows"` → desktop) rather than trusting `deviceType`. **The
same iPadOS-desktop-UA quirk is exactly why `deviceType` also can't
distinguish a tablet** — an iPad in its default browsing mode reports
`deviceType: "desktop"`, same as a real Mac; `isTablet`'s own detection
(`src/lib/deviceFormFactor.ts`) works around this the same way this query
already works around it for phone-vs-desktop: by checking signals other
than the UA-derived fields RUM itself reports (`navigator.platform` +
`navigator.maxTouchPoints`, not `osName`/`deviceType`).

Each `case()` branch is checked in order, so a session is only bucketed
into "Phone browser (...)" once the Tablet and Phone PWA branches for
that same OS have already failed to match — not a separate `and
displayMode != "standalone"`/`and isTablet != true` condition repeated on
every later branch. `"Other"` (the required final, condition-less branch)
catches anything that doesn't cleanly resolve to one of the buckets asked
for here — non-Mac/Windows desktop (Linux, ChromeOS), a genuinely
unknown/blank `osName`, or a desktop PWA install (this breakdown doesn't
split desktop by install mode, only phone/tablet, matching what was
actually asked for) — rather than silently mis-bucketing them or making
`case()` fail with no matching branch.

**Every OS branch uses `like /.../`, not `=`, including `iOS`/`Android` —
not just the two originally hedged this way (Mac/Windows).** An earlier
version used exact `=` for `"iOS"`/`"Android"`, reasoning they were
already clean, exact single-token values, unlike `"Mac OS"`. Confirmed
live this was wrong: a real iPhone (both a plain Safari-tab visit and the
installed PWA) showed `osName: "iOS"` in the **Devices, browsers, OS**
widget — a value that LOOKS identical to the query's own `"iOS"` literal —
and still landed in "Other" instead of either mobile bucket. Never fully
root-caused (a manually-pasted value can't rule out invisible whitespace
or another character the console's own copy quirk introduces — see this
section's own note on that), but switching to `like /iOS/` sidesteps the
question entirely: a substring match still matches cleanly even with
trailing whitespace or minor formatting differences the exact-match
version couldn't tolerate, at effectively zero cost (no other real
`osName` value contains "iOS" or "Android" as a substring, so there's no
new false-positive risk).

**Pages viewed** — also on the Overview tab, but for a plain ranked list:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields metadata.pageId
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) as views by metadata.pageId
| sort views desc
```

**Font size** — no dashboard equivalent as a widget query text (it's
pinned as "Font" on the dashboard itself), by session same as everything
else on this page except Traffic/Pages Viewed/Request Rate — this event
fires on every page load AND every subsequent change, so `count(*)` would
count the same session's own repeated preference changes as if they were
separate people:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.textSize, user_details.sessionId as sessionId
| filter event_type = "text_size_preference"
| stats count_distinct(sessionId) as sessions by event_details.textSize
```

**Level filter range** — same event, same session-dedup reasoning:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.min, event_details.max, user_details.sessionId as sessionId
| filter event_type = "dance_schedule_level_range"
| stats count_distinct(sessionId) as sessions by event_details.min, event_details.max
```

**Minimum-level histogram, bins in difficulty order** (not alphabetical —
`sort` has no notion of the slider's own custom order, so each label is
mapped to its slot position by hand before sorting on that). Logs Insights
QL has no C-style ternary operator — `case(cond1, val1, cond2, val2, ...,
default)` is the actual tool for this, up to 10 branches. `fields` only
ever *adds* fields — re-listing `minLevel`/`sessions` here (rather than
just the new `difficultyRank` expression) fails with "Ephemeral field is
already defined"; they stay in the output automatically. Session-deduped
for the same reason as Font size above — `dance_schedule_level_range`
fires on every change, not just once per session:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.min as minLevel, user_details.sessionId as sessionId
| filter event_type = "dance_schedule_level_range"
| stats count_distinct(sessionId) as sessions by minLevel
| fields case(minLevel = "SSD", 1,
              minLevel = "MS", 2,
              minLevel = "Plus", 3,
              minLevel = "A2", 4,
              minLevel = "C1", 5,
              minLevel = "C2", 6,
              minLevel = "C3A", 7,
              minLevel = "C3B", 8,
              9) as difficultyRank
| sort difficultyRank asc
```

The 8 labels/order above are `getLevelSlots(true, true)`'s output
(`src/lib/levelOrder.ts`), **after** `labelSlotsByPresence` relabels a
merged slot down to just one level name if only one of its two members
actually has any sessions event-wide (same file) — this event's registration
starts at A2 with no A1 sessions, and has C3B but no C4 sessions (confirmed
against `content/MotivateToSeattle/data/dance-schedule.xlsx`'s own "Hours by
Level" sheet: A2, C1, C2, C3A, C3B — no A1, no C4), so the merged slots read
as plain `"A2"` and `"C3B"`, not `"A1/A2"`/`"C3B+"`. **This mapping is tied
to the live event's actual data, not just its `combineA1A2`/`combineC3BC4`
flags** (`content/MotivateToSeattle/config.yaml`, both `true`) — a future
event with both members of a merge actually present would show the
combined label instead, and the `case()` branches need to match whichever
labels that event's data actually produces. Same technique works for the
**max** column, or for a joint `minLevel, maxLevel` breakdown — add a
second `case()` and a second `sort` key.

**Every min/max range combination, most common first**, each bar labeled
`<min>-<max>` — unlike the histogram above, this one sorts on the count
itself, so no `case()` mapping is needed. Session-deduped, same reasoning
as every other query on this page:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.min as minLevel, event_details.max as maxLevel, user_details.sessionId as sessionId
| filter event_type = "dance_schedule_level_range"
| fields concat(minLevel, "-", maxLevel) as range
| stats count_distinct(sessionId) as sessions by range
| sort sessions desc
```

**JS error rate over time** — same `bin(15m)`-as-timeSeries technique as
Request Rate (Last 3h) above, filtered to RUM's built-in JS-error event
instead of page views. Backs both the "JS Error Rate" dashboard widget and
`docs/design/alerting.md`'s `JsErrorAlarm` (the alarm itself evaluates the
separate `AWS/RUM` CloudWatch metric, not this query — see that doc for
why an alarm couldn't stay on Logs Insights the way everything else here
does — but this graph lets you see WHEN an alarm-triggering spike started,
not just that the alarm fired):

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields @timestamp
| filter event_type = "com.amazon.rum.js_error_event"
| stats count(*) as jsErrors by bin(15m)
```

**Individual JS errors, most recent first** — the rate graph's companion:
tells you WHICH errors, not just how many. `event_type =
"com.amazon.rum.js_error_event"` is confirmed (matches
`com.amazon.rum.page_view_event`'s own confirmed naming convention above),
but the specific `event_details.*` field names below
(`type`/`message`/`filename`/`lineno`) are RUM's documented JS-error
event-detail schema, **not yet confirmed against this account's actual
live data** — no credentials were available while writing this query. If
it comes back with blank columns once real errors exist, run `SOURCE
dataSource(['amazon_cloudwatch.rum_app_monitor']) | filter event_type =
"com.amazon.rum.js_error_event" | limit 1` first to see an actual event's
real field names, then fix the `fields` line here and its two other
copies (`infra/monitoring.yaml`'s `JsErrorsQuery`, and the dashboard
widget in `infra/dashboard.json`):

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields @timestamp, event_details.type as errorType, event_details.message as message, event_details.filename as filename, event_details.lineno as line, metadata.pageId as page
| filter event_type = "com.amazon.rum.js_error_event"
| sort @timestamp desc
```

## CloudFormation

Console: **CloudFormation → Stacks → `dance-schedule-monitoring`** (us-east-2).

- **Resources tab**: everything `infra/monitoring.yaml` defines — the
  Cognito unauthenticated identity pool + guest IAM role, the RUM app
  monitor, the JS-error alarm + its SNS topic/subscription, every saved
  `AWS::Logs::QueryDefinition`, and the dashboard itself.
- **Outputs tab**: `AppMonitorId` / `IdentityPoolId` / `Region` — the same
  values `infra/set-amplify-env.sh` reads to populate Amplify's environment
  variables — plus `AlertsTopicArn`, useful if you ever want to add a
  second SNS subscriber by hand. Cross-check here if the Amplify env vars
  above ever look wrong or stale.
- **Events tab**: deploy/update history for the stack itself (not to be
  confused with RUM's own Events tab above) — useful if `./infra/deploy.sh`
  ever fails partway through.

## Scripts reference

Every script below lives in `infra/` (one lives in `scripts/` at the repo
root instead, noted below) and requires the AWS CLI installed and
credentialed (`aws configure` or `aws sso login`). None of these run
automatically as part of a deploy — Amplify's own pipeline (`amplify.yml`)
only builds and publishes the app itself; everything here is a deliberate,
manual step. Fuller detail on each lives in `infra/README.md`, linked from
this doc's own sections above where relevant.

| Script | Does | Run it when |
| --- | --- | --- |
| `deploy.sh` | Deploys/updates `monitoring.yaml` — RUM app monitor, JS-error alarm + SNS topic, saved Logs Insights queries, the dashboard | After editing `monitoring.yaml`/`dashboard.json`, or to change a parameter (`AlertEmail`, `JsErrorAlarmThreshold`, `Domains`, `SessionSampleRate`, `RetainTelemetryBeyond30Days`) via `./infra/deploy.sh Key=Value ...` |
| `set-amplify-env.sh <app-id> [branch]` | Copies the RUM stack's outputs into Amplify's build-time env vars, triggers a rebuild | Once, right after the first `deploy.sh` (or if the RUM stack is ever recreated) |
| `disable-js-error-alarm.sh` | Mutes the JS-error alarm's SNS notifications — evaluation keeps running | Actively investigating a known issue, don't want repeat pages |
| `enable-js-error-alarm.sh` | Un-mutes it | Done investigating |
| `download-dashboard.sh` | Pulls the *live* CloudWatch dashboard definition back into `infra/dashboard.json` | After manually dragging/resizing a widget in the console, to fold that change back into source control |
| `apply-amplify-rewrites.sh [app-id]` | Pushes `infra/amplify-rewrites.json` (the SPA rewrite/redirect rules) to Amplify's hosting config via the API — auto-detects the app id if there's only one | After running the generator below, or any time the rewrite rules need to change |
| `../scripts/generate-amplify-rewrites.mjs` (repo root — `node scripts/generate-amplify-rewrites.mjs`) | Regenerates `infra/amplify-rewrites.json` from the actual `content/<set>/` directories | Whenever a content set (event) is added or removed — see `docs/adding-a-new-event.md`'s Step 7 |
| `deploy-email-forwarding.sh [address]` | Deploys/updates `email-forwarding.yaml` — SES receipt rule + forwarding Lambda for `help@sqdance.app` | After editing that template, or to change the forward-to address |
| `add-email-dns-records.sh` | Writes the email-forwarding stack's required DNS records (MX + 3 DKIM CNAMEs) into Route53 | Once, after the first `deploy-email-forwarding.sh`, or if the domain's DNS ever moves |

## Quick troubleshooting map

| Symptom | Check |
| --- | --- |
| No RUM data at all | Amplify env vars (set correctly? build run *after* they were set?) → CloudFormation stack exists and deployed cleanly → browser network tab for a `dataplane.rum.<region>.amazonaws.com` call, watch for a 403 (guest role/identity pool misconfigured) or nothing at all (env vars missing from the build) |
| RUM session/event counts look lower than expected | Check it's not just the known offline undercount above before assuming something's broken |
| Custom events missing but built-in telemetry (device/browser) works | `CustomEvents.Status` on the app monitor — must be `ENABLED` in `monitoring.yaml`, requires a stack redeploy if just added |
| Need counts/group-by, not just individual events | RUM's own Events tab can't do this — use CloudWatch Logs Insights against the log group `RetainTelemetryBeyond30Days` creates, see this doc's "Retention and aggregate reporting" section above |
| A route 404s after adding a content set | Run `node scripts/generate-amplify-rewrites.mjs && ./infra/apply-amplify-rewrites.sh` — see the Amplify Hosting table and Scripts reference above/below |
| Site looks stale after a deploy | This is a PWA with a service worker precache — a new build can sit "waiting" until the app's own update-prompt UI (or a manual `skipWaiting`) activates it; don't assume a redeploy is broken just because a browser tab still shows old content |
| Getting repeat JS-error alarm emails while already investigating | `./infra/disable-js-error-alarm.sh` to mute, `./infra/enable-js-error-alarm.sh` when done — see the Alerting section above |
