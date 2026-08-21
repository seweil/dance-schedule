# Infra

This app is hosted on AWS Amplify Hosting, configured through the Amplify
console (see `docs/design/hosting.md` for why — there's no CloudFormation
stack for the Amplify app itself, no Terraform/CDK). The one piece of
monitoring infra that *is* worth managing as code is CloudWatch RUM, since it
needs a few interlocking IAM/Cognito resources. Plain CloudFormation was
picked over Terraform/CDK for this — see `docs/design/monitoring.md`.

## Amplify rewrite rules: `infra/amplify-rewrites.json`

The app's "Rewrites and redirects" config (Amplify console → Hosting →
Rewrites and redirects) is the one piece of the Amplify app's own hosting
config that *is* worth keeping in source control, even though the app
itself has no CloudFormation stack — see `docs/design/hosting.md`'s
"Per-content-set Amplify rewrite rule" decision for why this exists at
all: `react-router`'s client-side routing means a direct/bookmarked
request to any inner page (e.g. `/reset`, or `/backtrack2abq/help`) needs a
server-side rewrite to that content set's own `index.html`, or it 404s —
this bit us for real once (see git history around 2026-08-20 for the
debugging trail).

```bash
node scripts/generate-amplify-rewrites.mjs   # regenerates infra/amplify-rewrites.json
                                              # from the actual content/<set>/ directories
./infra/apply-amplify-rewrites.sh
```

The generator reads `content/`'s subdirectories directly, so it can never
forget a content set the way hand-typing rules into the console (or a
manually-maintained list) could — run it again any time a content set is
added or removed, then re-apply. The apply script pushes the file straight
to the Amplify API (`aws amplify update-app --custom-rules`) rather than
pasting into the console's rewrite editor, which has a known quirk of
injecting stray newlines into copy-pasted rules (same issue
`infra/dashboard.json`'s own note below describes for CloudWatch).

It auto-detects the app id via `aws amplify list-apps` since there's only
one Amplify app today — pass one explicitly
(`./infra/apply-amplify-rewrites.sh <amplify-app-id>`) once a second app
exists; the script refuses to guess if it finds more than one.

Rewrite/redirect changes take effect immediately on Amplify's edge —
no rebuild needed, unlike environment variable changes (below). Verify
with e.g. `curl -I https://<your-domain>/reset` — expect `200`, not `404`,
from a machine with no cached service worker to mask a broken rule.

## What needs no infra-as-code at all: Amplify access logs

Every Amplify Hosting app already logs every request (path, status, referrer,
User-Agent, timestamp) with no setup. There is nothing to deploy:

1. Amplify console → your app → **Monitoring** → **Access logs**.
2. Pick a (max two-week) date range → **Download** → CSV.

That's it. Amplify doesn't support continuously exporting these to an S3
bucket you own (as of this writing there's no CloudFormation property for
it either) — logs live in Amplify for the app's lifetime, and you query the
console per two-week window. To analyze at any real scale, drop the
downloaded CSVs into an S3 bucket yourself and query with Athena (AWS's docs
on [CloudFront log tables](https://docs.aws.amazon.com/athena/latest/ug/cloudfront-logs.html#create-cloudfront-table)
cover the same CSV schema). At this app's traffic volume, `grep`/`awk`/a
spreadsheet is honestly enough — the User-Agent column is what gives you
device/browser info; there's no need to write a script until that gets
tedious.

## CloudWatch RUM: deploying `monitoring.yaml`

This stack creates a Cognito unauthenticated identity pool + guest IAM role
(RUM's web client needs *some* AWS credentials to call `PutRumEvents`, and an
unauth identity pool scoped to only that one action is the standard way to
give a public web page temporary, minimal-privilege credentials) and the RUM
app monitor itself.

```bash
./infra/deploy.sh
```

This deploys the stack (`aws cloudformation deploy`, same `--stack-name
dance-schedule-monitoring` / `--region us-east-2` as below) and then prints
its outputs. Run it again after editing `monitoring.yaml` — `deploy` updates
the stack in place. Requires the AWS CLI installed and credentialed (`aws
configure` or `aws sso login`) with permissions to create the stack's
CloudFormation/IAM/Cognito/RUM resources.

Equivalent by hand, if you'd rather not use the script:

```bash
aws cloudformation deploy \
  --template-file infra/monitoring.yaml \
  --stack-name dance-schedule-monitoring \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-2 \
  --parameter-overrides RetainTelemetryBeyond30Days=true

aws cloudformation describe-stacks \
  --stack-name dance-schedule-monitoring \
  --region us-east-2 \
  --query 'Stacks[0].Outputs'
```

Copy `AppMonitorId` / `IdentityPoolId` / `Region` into Amplify's build-time
environment variables, either by hand (Amplify console → your app →
**Hosting** → **Environment variables**, as `VITE_RUM_APP_MONITOR_ID` /
`VITE_RUM_IDENTITY_POOL_ID` / `VITE_RUM_REGION`) or via the CLI:

```bash
./infra/set-amplify-env.sh <amplify-app-id> [branch-name]
```

This reads the three values straight from the `dance-schedule-monitoring`
stack's outputs (so they never need retyping), merges them into whatever
environment variables the app already has (`update-app` replaces the whole
map, so a plain overwrite would silently delete unrelated vars), and
triggers a `RELEASE` build on the given branch (default `main`) so they take
effect immediately. Needs `jq` (`brew install jq`). Find the app id with:

```bash
aws amplify list-apps --region us-east-2 --query 'apps[].{name:name,appId:appId}'
```

Vite picks up any `VITE_`-prefixed variable already present in the build
environment automatically (no `.env` file needed), so the next Amplify build
will bake them into the client bundle — see `src/lib/rum.ts`. Locally,
`pnpm dev`/`pnpm build` without these set simply skips RUM initialization
(see that file), so no local `.env` is required either.

### Updating the stack

Editing `infra/monitoring.yaml` (e.g. adding a domain, changing the sample
rate) and re-running `./infra/deploy.sh` updates the stack in place — or
just push to `main`, see the next section.

### Auto-deploy on push

`.github/workflows/deploy-infra.yml` runs `./infra/deploy.sh` in CI on
every push to `main` that touches `infra/monitoring.yaml` or
`infra/dashboard.json` — a normal `git push` is enough, no one needs to
also run the script locally afterward. See
`docs/design/monitoring.md`'s "Deployed via GitHub Actions OIDC" decision
for the full rationale.

**One-time setup, by hand, before this works for the first time:**

1. Deploy `infra/github-oidc.yaml` — a separate small stack, kept apart
   from `monitoring.yaml` on purpose (see that file's own header comment).
   Needs real AWS credentials the same way any first deploy does:
   ```bash
   ./infra/deploy-github-oidc.sh
   ```
2. Wire the role ARN it printed into this repo as a GitHub Actions
   variable (`AWS_DEPLOY_ROLE_ARN` — a repository *variable*, not a
   secret; the ARN grants nothing by itself without the role's own OIDC
   trust condition also matching the caller, so there's nothing sensitive
   to hide). Requires `jq` and the GitHub CLI (`gh auth login`):
   ```bash
   ./infra/set-github-deploy-role.sh
   ```
3. Optional — a manual approval click before each infra deploy actually
   runs, via a required-reviewer rule on a GitHub Environment named
   `aws-infra`:
   ```bash
   ./infra/create-github-infra-environment.sh
   ```
   **Deliberately skipped by default** — `.github/workflows/deploy-infra.yml`
   has no `environment:` line, so a push to `main` touching
   `monitoring.yaml` deploys to AWS immediately, matching how the app
   itself already deploys via Amplify with no approval step (see
   `docs/design/monitoring.md`'s "One accepted trade-off" note for why
   that's an acceptable risk here: this stack is pure observability infra,
   a bad deploy degrades monitoring rather than the live site, and the
   scoped IAM role limits the blast radius regardless). To add the gate
   back later, run the script above and add `environment: aws-infra` back
   to the `deploy` job in the workflow.

After that, no further manual step is needed — editing `monitoring.yaml`
and merging to `main` deploys it, the same way editing app code and
merging deploys the app via Amplify.

**Doesn't cover:** `set-amplify-env.sh`, `apply-amplify-rewrites.sh`,
`deploy-email-forwarding.sh`, `add-email-dns-records.sh`, or the alarm
mute/unmute scripts — those still need a human running them locally with
their own AWS credentials (see `docs/known-issues.md`'s root-user entry).

### Redeploying after a domain change

If you add or change a custom domain in the Amplify console, update
`Domains` in `infra/monitoring.yaml` to match and redeploy — RUM silently
drops events from origins not in that list.

## JS-error alerting

`./infra/deploy.sh` also creates an SNS topic + CloudWatch alarm that emails
you when RUM records a client-side JS error — see
`docs/design/alerting.md` for the full reasoning (including an honest
caveat: the metric this alarms on hasn't been confirmed against a live
account, only written from documented AWS RUM behavior).

**One-time step after the first deploy**: check `AlertEmail`
(`steve.weil@gmail.com` by default — override with
`./infra/deploy.sh AlertEmail=someone@example.com`) for an SNS
subscription-confirmation email, and click **Confirm subscription**. No
notifications deliver until that's done — same shape as
`deploy-email-forwarding.sh`'s SES verification step below.

**To verify it actually works**, since it's untested against a real
account: visit `/debug/dance-schedule` on the live site and click "Trigger
a test JS error" at the very bottom
(`src/components/RawDanceScheduleDebugPage.tsx`) — safe to click
repeatedly, doesn't break the page. The alarm now needs
`JsErrorAlarmDatapointsToAlarm` breaching 5-minute windows (default 3 of
the last `JsErrorAlarmEvaluationPeriods`, i.e. 5) before it actually fires
— see docs/design/alerting.md's "M out of N" decision — so a single click
alone won't trip it. The metric (`JsErrorCount`, dimensioned only by
`application_name`) sums errors across *all* sessions in each 5-minute
window — it isn't per-session, so what matters is **spreading clicks
across 3+ separate 5-minute windows**, not opening multiple tabs/sessions
(several sessions clicking within the same window still only breaches
that one window). One tab is enough: click once now, wait for the next
5-minute wall-clock boundary and click again, then a third time in
another window — 3 breaching windows out of the trailing 5 trips it,
usually within 15-25 minutes depending on spacing.

**Avoid the temptation to temporarily override
`JsErrorAlarmEvaluationPeriods=1 JsErrorAlarmDatapointsToAlarm=1` for a
one-click test** — `cloudformation deploy` keeps a stack's *previous*
value for any parameter you don't pass explicitly (see the
`RetainTelemetryBeyond30Days` comment in `deploy.sh`), so a bare
follow-up `./infra/deploy.sh` with no args does **not** restore the
Defaults, it silently keeps the test override in place. That's a real
footgun now that deploys also run unattended in CI
(`.github/workflows/deploy-infra.yml`) with no overrides of its own — a
forgotten test override would stick around indefinitely with nothing
flagging it. If you do use this for a quick check, you must revert with
the Defaults passed explicitly:
`./infra/deploy.sh JsErrorAlarmEvaluationPeriods=5
JsErrorAlarmDatapointsToAlarm=3`.

Check the alarm's state in the CloudWatch console (**Alarms** →
`dance-schedule-js-errors`) — the confirmed email address should get a
notification once it moves to `ALARM`. Move it back to `OK` by waiting out
a window with no further errors (or just confirm the metric shows a data
point — `aws cloudwatch get-metric-statistics --namespace AWS/RUM
--metric-name JsErrorCount --dimensions
Name=application_name,Value=dance-schedule --start-time <recent> --end-time
now --period 300 --statistics Sum --region us-east-2`).

To change the sensitivity later: `./infra/deploy.sh JsErrorAlarmThreshold=3`
(default `1` — any error in a breaching window counts) or
`./infra/deploy.sh JsErrorAlarmEvaluationPeriods=10
JsErrorAlarmDatapointsToAlarm=5` (the M-out-of-N window itself), or edit
the Defaults directly in `monitoring.yaml` and redeploy with no args.

The dashboard below (its own "## Errors" section) graphs the same data this
alarm watches, plus a table enumerating individual errors — useful for
seeing *when* a spike started and *which* errors they actually were,
beyond just the alarm firing.

### Muting alerts while investigating

```bash
./infra/disable-js-error-alarm.sh   # stop SNS notifications
./infra/enable-js-error-alarm.sh    # resume them
```

Mutes only the alarm's *notifications* (`ActionsEnabled`) — the alarm keeps
evaluating and its `ALARM`/`OK` state still shows correctly in the console
and on the dashboard, so muting doesn't mean losing visibility, just not
getting paged while you look into something already noticed. No
redeploy needed either direction, and nothing reminds you to re-enable —
see `docs/ops.md`'s "Muting alerts" note.

## Dashboard

`monitoring.yaml`'s `RumDashboard` resource (an `AWS::CloudWatch::Dashboard`)
pins several of the queries above, plus a couple of event-specific ones
that don't get their own standalone saved query (min/max level histograms,
tied to whichever slots the CURRENT event's data actually populates — see
`docs/ops.md`'s own note on why those aren't saved as reusable
`QueryDefinition`s either), as always-visible widgets — no need to open
Logs Insights and pick a query each time. Deploys with the rest of the
stack (`./infra/deploy.sh`); find it at **CloudWatch → Dashboards →
`dance-schedule-dashboard`** (or whatever `AppMonitorName` is set to, plus
`-dashboard`).

Its bottom "## Releases" section is a table of the last 20 commits to
`origin/main` (hash, date, summary) — baked in as static markdown at
deploy time, since CloudWatch has no live git data source. **This is only
as fresh as the last `./infra/deploy.sh` run, not automatically updated on
each real app release** — the widget's own generated timestamp says so
explicitly, so re-run `deploy.sh` (safe — see "JS-error alerting" above,
same "only touches what actually changed" behavior applies) whenever you
want it current.

That name is deliberately NOT whatever a dashboard you built by hand in
the console was already called — CloudFormation can't adopt an existing,
unmanaged resource just by matching its name; deploying a
`AWS::CloudWatch::Dashboard` whose name collides with one that already
exists outside CloudFormation fails outright, it doesn't take it over. If
you had a hand-built dashboard before this existed, confirm the new,
CloudFormation-managed one looks right, then delete the old one yourself
(**CloudWatch → Dashboards** → select it → **Delete**) so you're not
maintaining two.

### The widget JSON lives in its own file: `infra/dashboard.json`

Plain CloudFormation has no way to `include` an external file directly in
a template, so `monitoring.yaml` doesn't embed the widget JSON inline —
`RumDashboard`'s `DashboardBody` is instead a literal placeholder line
(`__DASHBOARD_JSON_PLACEHOLDER__`), and `./infra/deploy.sh` splices
`dashboard.json`'s own content in as plain text (re-indented to match)
before deploying, from a temp file it generates on the fly — never
`monitoring.yaml` directly. (A `String` Parameter was tried first — it's
the more "native" CloudFormation mechanism — but fails outright:
Parameter values are hard-capped at 4096 bytes, and this dashboard's own
JSON is already over 6000. See `docs/design/monitoring.md` for the full
story.) Net effect is the same either way: the actual widget definitions
live in one plain, self-contained JSON file — readable and diffable on
its own, in a normal JSON editor/viewer, not buried inside a YAML block
scalar — while `monitoring.yaml` just marks where it goes.

**To make a manual widget edit (recommended for anything visual — dragging
a widget to reposition/resize it is far easier than hand-editing
coordinates) and fold it back into source control:**

1. Edit the dashboard directly in the CloudWatch console.
2. `./infra/download-dashboard.sh` — pulls the live definition back out and
   overwrites `infra/dashboard.json` with it (pretty-printed via `jq`, so
   the diff stays readable rather than replacing the whole file as one
   line).
3. `git diff infra/dashboard.json` to review, then commit.

**To make a text edit instead** (e.g. changing a query, matching an update
in `docs/ops.md`): edit `infra/dashboard.json` directly, then
`./infra/deploy.sh` to push it.

Either direction, the two scripts are exact inverses of each other:
`deploy.sh` pushes the file's contents up to AWS; `download-dashboard.sh`
pulls AWS's current state back down to the file. Whichever one you run
last wins — if you edit in the console AND locally without running the
matching sync script in between, the next deploy/download will silently
overwrite one side with the other.

The console's own copy-from-widget-editor has a known quirk of injecting
stray blank lines into multi-line queries — pulling the JSON via the CLI
(as above) avoids that entirely, same as `docs/ops.md`'s own note on
copying saved queries.

## Aggregate reporting: CloudWatch Logs Insights

The RUM console's Events tab only lets you browse individual events, not run
group-by/count queries. `RetainTelemetryBeyond30Days` (`CwLogEnabled` on the
app monitor, on by default — see `infra/monitoring.yaml`) mirrors every RUM
event, including custom ones, into a CloudWatch Logs group RUM manages
itself. Find its exact name (it isn't a fixed, predictable string):

```bash
aws rum get-app-monitor --name dance-schedule --region us-east-2 \
  --query 'AppMonitor.DataStorage.CwLog.CwLogGroup'
```

Then in the CloudWatch console → **Logs → Logs Insights** → **Queries**
tab, the queries below (device/browser/OS mix, installed-vs-browser,
platform mix, pages viewed, and each of `src/lib/rum.ts`'s custom events)
are already there, saved as `AWS::Logs::QueryDefinition` resources in
`monitoring.yaml` — no copy-pasting from this file, and no need to pick a
log group first, since each one's own `SOURCE dataSource(...)` clause
queries RUM's managed data directly. See `docs/ops.md`'s "Retention and
aggregate reporting" section for the full, most-current list with the
reasoning behind each one — `monitoring.yaml`'s copies are meant to
mirror that doc exactly, kept in sync by hand. (Excluded: the "minimum-
level histogram" query — it needs hand-editing per event's own actual
schedule data, so a permanently-saved copy would just go stale; see that
doc's own note.)

Custom event fields live under `event_details.*`; the
event's own type string is `event_type` (built-in RUM events use a
`com.amazon.rum.*`-namespaced type; this app's three custom ones don't).
Examples for each of `src/lib/rum.ts`'s call sites:

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.min, event_details.max
| filter event_type = "dance_schedule_level_range"
| stats count(*) by event_details.min, event_details.max
```

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.textSize
| filter event_type = "text_size_preference"
| stats count(*) by event_details.textSize
```

```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields event_details.date
| filter event_type = "dance_schedule_date_selected"
| stats count(*) by event_details.date
```

## Email forwarding: `help@sqdance.app`

`infra/email-forwarding.yaml` is a separate stack (own region, no shared
resources — see `docs/design/email-forwarding.md`) that receives mail sent
to `help@sqdance.app` via SES and forwards it to a real inbox via a small
Lambda, so that address never has to appear as a plain, spam-crawlable
`mailto:` link anywhere on the site.

```bash
./infra/deploy-email-forwarding.sh [forward-to-address]
```

Defaults to `steve.weil@gmail.com` if no address is given. Pass a
different address any time to redirect forwarding — it's a stack
parameter, not hardcoded, so this is just a redeploy, no code change:

```bash
./infra/deploy-email-forwarding.sh someone-else@example.com
```

The script deploys the stack (`--stack-name dance-schedule-email-forwarding`,
`--region us-east-1` — **not** `us-east-2` like the monitoring stack; SES
inbound receiving isn't available there, see the design doc), activates the
receipt rule set (CloudFormation can create one but has no property to mark
it active), and verifies the forward-to address with SES if it isn't
already (SES sandbox only allows sending to verified addresses, and
forwarding a copy counts as sending — this triggers a one-time confirmation
email to click).

After deploying, it prints the DNS records the stack needs (an MX record
plus 3 DKIM CNAMEs) — deploying the stack itself never writes DNS (see the
design doc's reasoning). Since `sqdance.app` is confirmed to live in
Route53, add them with:

```bash
./infra/add-email-dns-records.sh
```

This reads the record values straight from the stack's outputs (so
there's no copy-pasting, and it stays correct across redeploys) and
`UPSERT`s them into Route53 — except it refuses to touch the MX record if
one already exists with a different value, rather than silently
overwriting it. Only needs to be run once, or again if the domain's DNS
ever moves. Records can take a few minutes (occasionally longer) to
propagate; check verification status with:

```bash
aws ses get-identity-verification-attributes --identities sqdance.app --region us-east-1
```
