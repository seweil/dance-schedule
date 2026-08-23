#!/usr/bin/env bash
# The reverse direction of ./infra/deploy.sh: pulls the CURRENTLY DEPLOYED
# dashboard's widget JSON out of AWS and overwrites infra/dashboard.json with
# it. Run this after making a manual edit directly in the CloudWatch console
# (e.g. dragging a widget to reposition/resize it — far easier to do visually
# than by hand-editing JSON coordinates) to fold that change back into source
# control, rather than losing it the next time deploy.sh runs and overwrites
# the console's own version with whatever's still on disk.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

DASHBOARD_NAME=dance-schedule-dashboard
REGION=us-east-2

# The live dashboard has the real account id baked into the JS-error alarm
# widget's ARN (deploy.sh resolves it at deploy time — see that script's own
# comment on why dashboard.json itself can't express it via CloudFormation
# intrinsics). Substituted back to the __ACCOUNT_ID__ placeholder here so a
# download doesn't silently re-hardcode this one account's id into the
# committed, meant-to-be-portable file.
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# The live "## Releases" widget holds a timestamped git-log snapshot
# generate-dashboard-body.sh produced at its last run (see that script's own
# comment — deploy.sh and refresh-dashboard.sh both just call it) — baking
# that back into the committed file would permanently destroy the
# __RELEASE_HISTORY__ placeholder it needs to regenerate next time, and
# would make every future download's diff noisy (the timestamp alone
# changes on every run). Matched by its own leading "*As of " marker text,
# which MUST stay in sync with generate-dashboard-body.sh's own generated
# markdown — re-placeholdered here the same way __ACCOUNT_ID__ is below.
#
# jq's default output is already pretty-printed (unlike AWS's own compact,
# single-line response) — without that, every download would replace the
# whole file in one line and make `git diff` useless for seeing what
# actually changed. Needs jq (`brew install jq`), same as
# set-amplify-env.sh.
aws cloudwatch get-dashboard \
  --dashboard-name "$DASHBOARD_NAME" \
  --region "$REGION" \
  --query 'DashboardBody' \
  --output text \
  | jq '(.widgets[] | select(.properties.markdown != null and (.properties.markdown | startswith("*As of "))) | .properties.markdown) = "__RELEASE_HISTORY__"' \
  | sed "s/$ACCOUNT_ID/__ACCOUNT_ID__/g" > dashboard.json

echo "Wrote $(pwd)/dashboard.json — review with 'git diff infra/dashboard.json', then commit."
