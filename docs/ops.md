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
fields metadata.deviceType, metadata.browserName, metadata.osName
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) by metadata.deviceType, metadata.browserName, metadata.osName
```

**Pages viewed** — also on the Overview tab, but for a plain ranked list:

```
fields metadata.pageId
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) as views by metadata.pageId
| sort views desc
```

**Font size** — no dashboard equivalent (it's a custom event); this is the
only way to see the distribution:

```
fields event_details.textSize
| filter event_type = "text_size_preference"
| stats count(*) by event_details.textSize
```

**Level filter range** — same, custom-event-only:

```
fields event_details.min, event_details.max
| filter event_type = "dance_schedule_level_range"
| stats count(*) by event_details.min, event_details.max
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
| Custom events missing but built-in telemetry (device/browser) works | `CustomEvents.Status` on the app monitor — must be `ENABLED` in `monitoring.yaml`, requires a stack redeploy if just added |
| Need counts/group-by, not just individual events | RUM's own Events tab can't do this — use CloudWatch Logs Insights against the log group `RetainTelemetryBeyond30Days` creates, see this doc's "Retention and aggregate reporting" section above |
| A route 404s after adding a content set | Amplify's Rewrites and redirects — needs a new rule pair, console-only, see the Amplify Hosting table above |
| Site looks stale after a deploy | This is a PWA with a service worker precache — a new build can sit "waiting" until the app's own update-prompt UI (or a manual `skipWaiting`) activates it; don't assume a redeploy is broken just because a browser tab still shows old content |
