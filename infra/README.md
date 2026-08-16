# Infra

This app is hosted on AWS Amplify Hosting, configured through the Amplify
console (see `docs/design/hosting.md` for why — there's no CloudFormation
stack for the Amplify app itself, no Terraform/CDK). The one piece of
monitoring infra that *is* worth managing as code is CloudWatch RUM, since it
needs a few interlocking IAM/Cognito resources. Plain CloudFormation was
picked over Terraform/CDK for this — see `docs/design/monitoring.md`.

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
rate) and re-running `./infra/deploy.sh` updates the stack in place.

### Redeploying after a domain change

If you add or change a custom domain in the Amplify console, update
`Domains` in `infra/monitoring.yaml` to match and redeploy — RUM silently
drops events from origins not in that list.

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
