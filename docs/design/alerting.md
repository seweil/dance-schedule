# Alerting

## Context

`docs/design/monitoring.md` covers analytics — learning about traffic and
device mix, all pull-based (you have to go look at a dashboard or run a
query). It never addressed a different question: how do you find out
*without looking* that something's actually broken? Prompted by a direct
ask: "how can I know if the site is down, or if users are seeing errors."
Scoped down to just the second half for now — client-side JS errors, using
telemetry already flowing in via CloudWatch RUM (`infra/monitoring.yaml`).
Uptime/availability monitoring (an external synthetic check hitting the site
from outside AWS) is a deliberately separate, not-yet-built piece — see Open
questions.

## Sub-problems

- [x] Where to alarm from, given RUM's data — see Decisions
- [x] How to get notified — see Decisions
- [x] Alarm sensitivity/threshold — see Decisions
- [x] Seeing the error rate/history, not just getting notified when it
      crosses a threshold — see Decisions
- [x] Seeing the alarm's own current state without opening CloudWatch
      separately — see Decisions
- [x] Filtering noise from a single stuck/stale client re-triggering the
      alarm repeatedly for an already-known issue — see Decisions ("M out
      of N")

## Decisions

### Alarm on RUM's native `AWS/RUM` CloudWatch metric, not a Logs Insights query
**Why:** Every other piece of `infra/monitoring.yaml` (its saved
`QueryDefinition`s, the dashboard) deliberately stays on CloudWatch Logs
Insights against RUM's managed data source, specifically avoiding the
`AWS/RUM` metric namespace — see `RequestRateQuery`'s own comment: its exact
dimension key wasn't verifiable without a live, authenticated
`aws cloudwatch list-metrics` call. A `CloudWatch::Alarm` breaks that
consistency on purpose: an alarm is fundamentally a metric-threshold
primitive (`Namespace`/`MetricName`/`Dimensions`/`Statistic`/`Period`), and
there's no CloudFormation-clean way to alarm on a Logs Insights query
directly. The alternative — a `Logs::MetricFilter` over the RUM-managed
CloudWatch Logs group — doesn't work either: that log group's name isn't
fixed or predictable at template-authoring time (only discoverable *after*
deploy, via `aws rum get-app-monitor` — see `docs/ops.md`), so a
`MetricFilter` resource has nothing valid to reference `LogGroupName` with
in the same template that creates the app monitor.

The `AWS/RUM` namespace's `JsErrorCount` metric, dimensioned by
`application_name`, is standard, documented AWS RUM behavior (published
automatically once `Telemetries` includes `errors`, which it already does —
see `RumAppMonitor`'s `AppMonitorConfiguration`). **Confirmed working
2026-08-21**: a real client-side error (`InvalidStateError`/"newestWorker
is null" — see `docs/known-issues.md` and `UpdatePrompt.tsx`'s own fix
commit) tripped the alarm for real, `describe-alarms` showing "Threshold
Crossed: 1 datapoint... was greater than or equal to the threshold" — this
wasn't just theoretical AWS documentation, it fired on genuine production
traffic the same day it was deployed.

### SNS topic + plain email subscription, not a paging tool
**Why:** A community-event site at a few-hundred-user scale doesn't need
on-call rotations or escalation policies (PagerDuty, Opsgenie) — a single
email is the right amount of ceremony. `AlertsTopic` (`AWS::SNS::Topic`) is
still its own resource, not a bare `Endpoint` on the alarm directly, so a
second subscriber (a phone number, a Slack-webhook Lambda) can be added
later without touching the alarm itself — see the stack's `AlertsTopicArn`
output.

CloudFormation can create the `AWS::SNS::Subscription`, but **cannot
auto-confirm it** — SNS emails a one-time confirmation link to `AlertEmail`
on first deploy (or whenever that parameter changes), and no notification
delivers until it's clicked. Same one-time-confirmation shape
`infra/email-forwarding.yaml`'s SES identity verification already has (see
`infra/README.md`), so this isn't a new pattern for this app's infra.

`AlertEmail` defaults to `steve.weil@gmail.com` — matching
`deploy-email-forwarding.sh`'s own existing default for the same person,
rather than inventing a different default contact for a second alerting
channel.

### Threshold defaults to 1 error per 5-minute window, `TreatMissingData: notBreaching`
**Why:** The whole point of this alarm is finding out about errors "without
looking" — a low default (any single recorded error notifies) matches that,
since at this traffic volume even a real, all-users-affected bug likely
only produces a handful of error events in any given window, not a spike
obviously distinguishable from noise. Exposed as `JsErrorAlarmThreshold`
(CloudFormation Parameter) specifically so it's easy to raise later without
a template edit, if real traffic makes a threshold of 1 too noisy (a single
user's broken browser extension, for instance).

`TreatMissingData: notBreaching` — most 5-minute periods at this app's
traffic volume have zero RUM data points at all (nobody visiting that
instant, let alone erroring), which the alarm shouldn't treat as anything
other than "no problem detected." `OKActions` (not just `AlarmActions`)
notifies on recovery too, matching CLAUDE.md's own PWA-update-flow
principle of never leaving someone to wonder about state silently — here,
whether a firing alarm is still ongoing.

### Dashboard graph + listing on Logs Insights, not the `AWS/RUM` metric the alarm uses
**Why:** The alarm itself had to break `infra/monitoring.yaml`'s
"everything on Logs Insights" convention out of necessity (see above) — the
dashboard graph doesn't share that constraint, since a dashboard `log`-type
widget can already query RUM's managed data source directly
(`SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])`, the same
mechanism every other widget/query in this file already uses successfully),
with no log-group-name problem the way an alarm's `MetricFilter` would
have. Staying on Logs Insights here also gets a second thing the metric
alone can't: `JsErrorsQuery` enumerates individual error events
(timestamp, message, filename/line, page) sorted most-recent-first, not
just a count — a rate graph alone tells you *something* broke, not *what*.
Added as a new "## Errors" dashboard section (`JsErrorRateQuery` graphed as
a line chart, `JsErrorsQuery` as a table) — appended at the bottom of
`infra/dashboard.json` rather than reordered near the top, matching
`infra/README.md`'s own stated preference for repositioning dashboard
widgets by dragging in the console (then syncing back via
`./infra/download-dashboard.sh`) over hand-editing every other widget's `x`/`y`
coordinates to make room.

### A real `type: "alarm"` dashboard widget for the alarm's own state, not another metric/log widget
**Why:** `JsErrorRateQuery`'s graph and `JsErrorsQuery`'s listing both show
the underlying *data* the alarm watches, but neither shows the alarm's own
current *state* (`OK`/`ALARM`/`INSUFFICIENT_DATA`) — someone glancing at
the dashboard still couldn't tell whether it had actually crossed the
threshold without separately opening CloudWatch → Alarms. CloudWatch
Dashboards have a dedicated widget type for exactly this
(`"type": "alarm"`, distinct from `"type": "metric"`/`"type": "log"`) —
renders as a colored state indicator plus a small graph of the underlying
metric with the alarm's threshold overlaid, covering both "a graph" and "a
banner" in one widget rather than needing to build both separately.

Needs the alarm's full ARN (`arn:aws:cloudwatch:<region>:<account-id>:alarm:
<name>`), which embeds the AWS account id — a value `infra/dashboard.json`
itself has no way to express portably (it's spliced into `monitoring.yaml`
as literal static JSON, not processed by CloudFormation's own `!Sub`/`!Ref`
the way the rest of that template is). Rather than hardcoding this one
account's id into a file meant to stay portable, `dashboard.json` uses a
`__ACCOUNT_ID__` placeholder, resolved by `./infra/deploy.sh` via `aws sts
get-caller-identity` at deploy time — same placeholder-substitution
mechanism the file already uses for its own JSON-into-YAML splicing, just a
second pass. `./infra/download-dashboard.sh` (the reverse direction) has to
undo the same substitution on the way back down, or every download would
silently re-hardcode the real account id into the committed file.

### Active-session widgets moved into "## Traffic", not left in their own section
**Why:** Per direct product decision — "Active Now" was originally its own
appended-at-the-bottom section (see above), but active-session count is
fundamentally a traffic question, not an errors-adjacent one, so it reads
more naturally grouped with Request Rate/Pages Viewed. Unlike the "##
Errors" section's own placement, this move DID require hand-editing every
subsequent widget's `y` coordinate (see `infra/dashboard.json`) — accepted
here since it was a direct, explicit request rather than a default worth
avoiding busywork for.

Same field-name caveat as the alarm's metric: `event_type =
"com.amazon.rum.js_error_event"` is confirmed (matches
`com.amazon.rum.page_view_event`'s own already-confirmed naming pattern),
but `JsErrorsQuery`'s specific `event_details.*` fields
(`type`/`message`/`filename`/`lineno`) are RUM's documented schema, not yet
checked against this account's real data — see that query's own comment in
`infra/monitoring.yaml` for how to fix it if the column values come back
blank.

### "M out of N" alarm evaluation, not a version-scoped or distinct-sessions alarm
**Why:** Triggered by a real incident (2026-08-21) — the alarm fired
repeatedly (135+ events over 24h) from a single stuck macOS Safari client
— `userId 92297ae1-b928-4ee5-9e2a-144bc8ba2166`, `appVersion b5f501a`
(several commits behind `HEAD`, predating `4e3d658`'s actual fix for the
exact error it kept throwing: `InvalidStateError`/"newestWorker is null"
from `UpdatePrompt.tsx`'s unguarded `registration.update()`). Confirmed
via `JsErrorsQuery`'s enriched fields (`appVersion`, `userId`) that this
was one already-known, already-fixed-going-forward client repeatedly
re-triggering the alarm, not live/spreading traffic. Muted via
`./infra/disable-js-error-alarm.sh` while investigating; the machine was
suspected stuck and got rebooted, but rather than just wait and see, this
was settled directly since a decision was needed anyway.

Two more precise designs were discussed and rejected, both real
increases in infrastructure/risk for a problem that recurs rarely at this
traffic volume:
1. **Version-scoped alarm** (`AWS::Logs::MetricFilter` matching
   `application_version = "<current>"`, replacing the alarm's `AWS/RUM`
   metric source) — rejected over its **silent total failure** mode: if
   the tracked "current version" value doesn't exactly match live traffic
   (a hash-length mismatch, or a deploy pipeline out of sync), the alarm
   goes quiet **including for real, current bugs**, with no visible sign
   anything's wrong. Unlike today's alarm, which can only ever be *too
   noisy*, this could make it fail exactly the way it's not allowed to.
2. **Distinct-sessions-affected alarm** — rejected because
   `AWS::Logs::MetricFilter` has no distinct-value aggregation (it can
   only count matching log lines, or sum/extract one numeric field per
   line), so "count distinct sessionId with an error" needs a scheduled
   Lambda (an EventBridge rule running the equivalent
   `stats count_distinct(sessionId)` Logs Insights query periodically,
   pushing the result via `PutMetricData`) — genuinely *more*
   infrastructure than option 1, not less. (Session id as a metric
   *dimension* instead was also considered and rejected: high-cardinality
   dimensions are a known CloudWatch custom-metrics cost/cardinality
   anti-pattern.)

**Chosen instead:** tune the *existing* alarm's own evaluation — CloudWatch's
native "M out of N" periods, via `EvaluationPeriods`/`DatapointsToAlarm` on
the same `AWS::CloudWatch::Alarm` resource (defaults: `EvaluationPeriods: 5`,
`DatapointsToAlarm: 3` — 3 of the last 5 5-minute windows, exposed as
`JsErrorAlarmEvaluationPeriods`/`JsErrorAlarmDatapointsToAlarm` CloudFormation
Parameters, same pattern as `JsErrorAlarmThreshold`). No new infrastructure,
no new failure mode beyond what the alarm already has, and it filters an
isolated blip (one window with one error) the way the stuck-client incident
would have looked if it had erred only once instead of continuously.
**Accepted limitation, not fixed by this:** a client erroring *continuously*
(as the actual stuck Safari client did) still breaches M of N just like real
spreading traffic would — this change narrows "isolated blip" noise, it does
not distinguish "one persistently-broken device" from "a few real affected
users." If that distinction is ever actually needed, revisit option 1 or 2
above rather than tightening M-out-of-N further (a wider N/M just delays
detection of a real problem without solving the underlying ambiguity).

## Open questions

- **Uptime/availability monitoring** — the original ask's other half ("how
  can I know if the site is down"), deliberately not built here. A JS-error
  alarm only fires for someone who successfully loaded the app; it says
  nothing about DNS/CDN/deploy failures serving nothing at all. Recommended
  direction discussed but not implemented: an external synthetic check
  (e.g. UptimeRobot's free tier) hitting `https://sqdance.app` every few
  minutes from outside AWS entirely — deliberately NOT AWS CloudWatch
  Synthetics, which would cost more and add infra for a check this app's
  traffic volume doesn't need running from inside AWS's own blast radius.
- Should `HttpErrorCount` (also in RUM's `AWS/RUM` namespace, also already
  enabled via the `http` telemetry) get its own alarm too, or does JS-error
  coverage plus manually checking Amplify's own 4xx/5xx metrics
  (`docs/ops.md`'s "Aggregate metrics" row) cover that adequately for now?
- A second SNS subscriber (SMS, a Slack webhook) if email turns out to be
  too easy to miss in practice.
