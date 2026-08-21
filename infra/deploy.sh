#!/usr/bin/env bash
# Deploys infra/monitoring.yaml (see infra/README.md) and prints the stack
# outputs to copy into Amplify's console-managed environment variables.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

STACK_NAME=dance-schedule-monitoring
REGION=us-east-2

# monitoring.yaml itself is NOT deployed directly — it contains a literal
# placeholder line (__DASHBOARD_JSON_PLACEHOLDER__, inside RumDashboard's
# own DashboardBody block scalar; see that resource's own comment) instead
# of the actual dashboard widget JSON. infra/dashboard.json is its own
# file specifically so it's readable/diffable on its own (see
# infra/download-dashboard.sh for the reverse direction) — but it can't be
# wired in via a CloudFormation Parameter (tried first: fails outright,
# CloudFormation Parameter values are hard-capped at 4096 bytes and this
# JSON is already over 6000). So this substitutes it in as plain text
# instead: read monitoring.yaml, replace the placeholder line with
# dashboard.json's own content — each line re-indented to match the
# placeholder's own indentation, so it lands correctly inside the YAML
# block scalar — and deploy the RESULT from a temp file, never
# monitoring.yaml directly. A block scalar (`|-`), not a quoted string, is
# what makes this substitution safe to do with plain line-by-line text
# splicing: it needs no quote/backslash escaping of the JSON's own content,
# only consistent indentation.
# "${TMPDIR:-/tmp}/...XXXXXX", not a bare `mktemp` — macOS's mktemp doesn't
# actually respect $TMPDIR for its own default directory (it resolves the
# system-managed per-user temp dir directly instead), which matters for
# anyone running this from a sandboxed/restricted shell (e.g. an AI coding
# agent) that only grants write access to $TMPDIR itself, not wherever
# mktemp would otherwise pick. Explicit and portable either way — on an
# unrestricted shell this still resolves to the same place mktemp's own
# default normally would.
TMP_TEMPLATE="$(mktemp "${TMPDIR:-/tmp}/dance-schedule-monitoring.XXXXXX")"
trap 'rm -f "$TMP_TEMPLATE"' EXIT

# dashboard.json's own "JS Error Alarm State" widget needs the JS-error alarm's
# full ARN, which embeds the AWS account id — a value dashboard.json itself has
# no way to express (it's plain static JSON, spliced in as literal text above,
# not processed by CloudFormation's own !Sub/!Ref the way monitoring.yaml is).
# Resolved here instead and substituted the same way as the dashboard JSON
# itself, via a __ACCOUNT_ID__ placeholder in dashboard.json — keeps that file
# portable across AWS accounts rather than hardcoding this one's id into it.
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# The dashboard's "## Releases" table (last 10 commits to origin/main, which
# is what Amplify's own auto-deploy pipeline actually builds from) is baked
# in as static markdown at deploy time — CloudWatch dashboards have no live
# git data source, so this is only ever as fresh as the last time
# ./infra/deploy.sh ran, NOT automatically updated on each real app release.
# The generated markdown says so explicitly (see the Python block below), so
# that staleness is visible on the dashboard itself rather than silently
# assumed away. A failed fetch (offline, no network) falls through to
# whatever origin/main ref is already known locally rather than aborting the
# whole deploy over a non-essential widget.
git fetch origin main --quiet 2>/dev/null || true
RELEASE_LOG=$(git log -10 --pretty=format:'%h|%as|%s' origin/main 2>/dev/null || git log -10 --pretty=format:'%h|%as|%s' HEAD)

python3 - "$TMP_TEMPLATE" "$ACCOUNT_ID" "$RELEASE_LOG" <<'PYEOF'
import json
import sys
from datetime import datetime, timezone

out_path = sys.argv[1]
account_id = sys.argv[2]
release_log = sys.argv[3]

with open('monitoring.yaml') as f:
    template_lines = f.read().splitlines()
with open('dashboard.json') as f:
    dashboard_lines = f.read().rstrip('\n').splitlines()

result = []
for line in template_lines:
    if line.strip() == '__DASHBOARD_JSON_PLACEHOLDER__':
        indent = line[: len(line) - len(line.lstrip())]
        result.extend(indent + dline for dline in dashboard_lines)
    else:
        result.append(line)

text = '\n'.join(result).replace('__ACCOUNT_ID__', account_id)

rows = []
for line in release_log.splitlines():
    if not line.strip():
        continue
    commit_hash, date, summary = line.split('|', 2)
    # A `|` inside a commit summary would otherwise break out of the
    # markdown table's own column structure.
    summary = summary.replace('|', '\\|')
    rows.append(f'| `{commit_hash}` | {date} | {summary} |')

generated_at = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
release_markdown = '\n'.join([
    f'*As of {generated_at} — refreshes on the next `./infra/deploy.sh` run, not automatically on each app release.*',
    '',
    '| Commit | Date | Summary |',
    '|---|---|---|',
    *rows,
])
text = text.replace('__RELEASE_HISTORY__', json.dumps(release_markdown)[1:-1])

with open(out_path, 'w') as f:
    f.write(text + '\n')
PYEOF

# RetainTelemetryBeyond30Days is passed explicitly, not left to the template's
# own Default — `cloudformation deploy` keeps an existing stack's previous
# value for any parameter you don't pass, so editing the Default alone
# wouldn't actually change it on an already-deployed stack.
#
# "$@" forwards any extra Key=Value pairs this script itself was called with
# (e.g. `./infra/deploy.sh AlertEmail=someone@example.com
# JsErrorAlarmThreshold=3`) as additional --parameter-overrides — lets a
# caller override infra/README.md's other stack parameters (AlertEmail,
# JsErrorAlarmThreshold, Domains, SessionSampleRate) without editing this
# script or monitoring.yaml's own Default values.
aws cloudformation deploy \
  --template-file "$TMP_TEMPLATE" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameter-overrides RetainTelemetryBeyond30Days=true "$@"

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs'
