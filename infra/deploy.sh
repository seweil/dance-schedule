#!/usr/bin/env bash
# Deploys infra/monitoring.yaml (see infra/README.md) and prints the stack
# outputs to copy into Amplify's console-managed environment variables.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

STACK_NAME=dance-schedule-monitoring
REGION=us-east-2

# RetainTelemetryBeyond30Days is passed explicitly, not left to the template's
# own Default — `cloudformation deploy` keeps an existing stack's previous
# value for any parameter you don't pass, so editing the Default alone
# wouldn't actually change it on an already-deployed stack.
aws cloudformation deploy \
  --template-file monitoring.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameter-overrides RetainTelemetryBeyond30Days=true

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs'
