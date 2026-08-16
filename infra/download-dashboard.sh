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

# `jq '.'` re-pretty-prints AWS's own (compact, single-line) response —
# without it, every download would replace the whole file in one line and
# make `git diff` useless for seeing what actually changed. Needs jq
# (`brew install jq`), same as set-amplify-env.sh.
aws cloudwatch get-dashboard \
  --dashboard-name "$DASHBOARD_NAME" \
  --region "$REGION" \
  --query 'DashboardBody' \
  --output text | jq '.' > dashboard.json

echo "Wrote $(pwd)/dashboard.json — review with 'git diff infra/dashboard.json', then commit."
