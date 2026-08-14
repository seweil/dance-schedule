#!/usr/bin/env bash
# Copies infra/monitoring.yaml's CloudFormation outputs into the Amplify
# app's environment variables and triggers a rebuild so they take effect.
# See infra/README.md. Requires jq (brew install jq).
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <amplify-app-id> [branch-name]" >&2
  echo "Find your app id with: aws amplify list-apps --region us-east-2 --query 'apps[].{name:name,appId:appId}'" >&2
  exit 1
fi

APP_ID="$1"
BRANCH_NAME="${2:-main}"
STACK_NAME=dance-schedule-monitoring
REGION=us-east-2

command -v jq >/dev/null || { echo "jq is required (brew install jq)" >&2; exit 1; }

outputs=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs')

app_monitor_id=$(jq -r '.[] | select(.OutputKey=="AppMonitorId") | .OutputValue' <<<"$outputs")
identity_pool_id=$(jq -r '.[] | select(.OutputKey=="IdentityPoolId") | .OutputValue' <<<"$outputs")
rum_region=$(jq -r '.[] | select(.OutputKey=="Region") | .OutputValue' <<<"$outputs")

if [[ -z "$app_monitor_id" || -z "$identity_pool_id" || -z "$rum_region" ]]; then
  echo "Couldn't read all three outputs from stack $STACK_NAME — has ./infra/deploy.sh been run?" >&2
  exit 1
fi

# update-app replaces the whole environment-variables map, so merge with
# whatever's already set rather than overwriting unrelated vars.
existing=$(aws amplify get-app --app-id "$APP_ID" --region "$REGION" --query 'app.environmentVariables')

env_args=$(jq -r \
  --arg a "$app_monitor_id" \
  --arg i "$identity_pool_id" \
  --arg r "$rum_region" \
  '. + {VITE_RUM_APP_MONITOR_ID: $a, VITE_RUM_IDENTITY_POOL_ID: $i, VITE_RUM_REGION: $r}
   | to_entries | map("\(.key)=\(.value)") | join(",")' <<<"$existing")

aws amplify update-app --app-id "$APP_ID" --region "$REGION" --environment-variables "$env_args" >/dev/null

aws amplify start-job \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH_NAME" \
  --job-type RELEASE \
  --region "$REGION" >/dev/null

echo "Updated app $APP_ID and started a RELEASE build on branch $BRANCH_NAME."
