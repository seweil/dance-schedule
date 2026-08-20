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
see `RumAppMonitor`'s `AppMonitorConfiguration`). **Caveat, honestly stated:
this hasn't been confirmed against a live AWS account** — no credentials
were available to run `aws cloudwatch list-metrics --namespace AWS/RUM`
while writing this. After deploying, verify the metric is actually
populating (trigger a real JS error, or wait for one, then check the alarm's
own CloudWatch console page shows data points) rather than assuming this
works untested.

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
