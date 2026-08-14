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

Then in the CloudWatch console → **Logs → Logs Insights**, pick that log
group and run a query. Custom event fields live under `event_details.*`; the
event's own type string is `event_type` (built-in RUM events use a
`com.amazon.rum.*`-namespaced type; this app's three custom ones don't).
Examples for each of `src/lib/rum.ts`'s call sites:

```
fields event_details.min, event_details.max
| filter event_type = "dance_schedule_level_range"
| stats count(*) by event_details.min, event_details.max
```

```
fields event_details.textSize
| filter event_type = "text_size_preference"
| stats count(*) by event_details.textSize
```

```
fields event_details.date
| filter event_type = "dance_schedule_date_selected"
| stats count(*) by event_details.date
```
