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
| Rewrites and redirects | App settings → Rewrites and redirects | SPA fallback rules — one root rule plus one rewrite+redirect pair per content set (`automated-testing`, `test`, ...). **Console-only, not in the repo** — see `docs/design/hosting.md`'s "Per-content-set Amplify rewrite rule" decision. Check this first if a direct link to a non-root route 404s after adding a new content set. |
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
| `dance_schedule_level_range` | On every page load, and on every subsequent change (slider drag, or an automatic re-scope when switching to a date with a narrower present range) | `{ min: "<slot label>", max: "<slot label>" }` (e.g. `"A2"`, `"C3B+"`) |
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

**Devices, browsers, OS** — already graphed natively in the Overview tab
above with no query needed; the equivalent Logs Insights query (useful if
you want to cross-tabulate with something the dashboard doesn't offer, or
already have Logs Insights open):

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields metadata.deviceType, metadata.browserName, metadata.osName
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) by metadata.deviceType, metadata.browserName, metadata.osName
```

**Installed vs. browser tab** — a custom session attribute, not a built-in
dimension, but it lives in `metadata` too (see above), so the same query
shape works:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields metadata.displayMode
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) by metadata.displayMode
```

**Pages viewed** — also on the Overview tab, but for a plain ranked list:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields metadata.pageId
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) as views by metadata.pageId
| sort views desc
```

**Font size** — no dashboard equivalent (it's a custom event); this is the
only way to see the distribution:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.textSize
| filter event_type = "text_size_preference"
| stats count(*) by event_details.textSize
```

**Level filter range** — same, custom-event-only:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.min, event_details.max
| filter event_type = "dance_schedule_level_range"
| stats count(*) by event_details.min, event_details.max
```

**Minimum-level histogram, bins in difficulty order** (not alphabetical —
`sort` has no notion of the slider's own custom order, so each label is
mapped to its slot position by hand before sorting on that). Logs Insights
QL has no C-style ternary operator — `case(cond1, val1, cond2, val2, ...,
default)` is the actual tool for this, up to 10 branches. `fields` only
ever *adds* fields — re-listing `minLevel`/`sessions` here (rather than
just the new `difficultyRank` expression) fails with "Ephemeral field is
already defined"; they stay in the output automatically:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.min as minLevel
| filter event_type = "dance_schedule_level_range"
| stats count(*) as sessions by minLevel
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
itself, so no `case()` mapping is needed:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.min as minLevel, event_details.max as maxLevel
| filter event_type = "dance_schedule_level_range"
| fields concat(minLevel, "-", maxLevel) as range
| stats count(*) as sessions by range
| sort sessions desc
```

## CloudFormation

Console: **CloudFormation → Stacks → `dance-schedule-monitoring`** (us-east-2).

- **Resources tab**: the Cognito unauthenticated identity pool, its guest
  IAM role, and the RUM app monitor — three resources total, matching
  `infra/monitoring.yaml`.
- **Outputs tab**: `AppMonitorId` / `IdentityPoolId` / `Region` — the same
  values `infra/set-amplify-env.sh` reads to populate Amplify's environment
  variables. Useful to cross-check if the Amplify env vars above ever look
  wrong or stale.
- **Events tab**: deploy/update history for the stack itself (not to be
  confused with RUM's own Events tab above) — useful if `./infra/deploy.sh`
  ever fails partway through.

## Quick troubleshooting map

| Symptom | Check |
| --- | --- |
| No RUM data at all | Amplify env vars (set correctly? build run *after* they were set?) → CloudFormation stack exists and deployed cleanly → browser network tab for a `dataplane.rum.<region>.amazonaws.com` call, watch for a 403 (guest role/identity pool misconfigured) or nothing at all (env vars missing from the build) |
| RUM session/event counts look lower than expected | Check it's not just the known offline undercount above before assuming something's broken |
| Custom events missing but built-in telemetry (device/browser) works | `CustomEvents.Status` on the app monitor — must be `ENABLED` in `monitoring.yaml`, requires a stack redeploy if just added |
| Need counts/group-by, not just individual events | RUM's own Events tab can't do this — use CloudWatch Logs Insights against the log group `RetainTelemetryBeyond30Days` creates, see this doc's "Retention and aggregate reporting" section above |
| A route 404s after adding a content set | Amplify's Rewrites and redirects — needs a new rule pair, console-only, see the Amplify Hosting table above |
| Site looks stale after a deploy | This is a PWA with a service worker precache — a new build can sit "waiting" until the app's own update-prompt UI (or a manual `skipWaiting`) activates it; don't assume a redeploy is broken just because a browser tab still shows old content |
