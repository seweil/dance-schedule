#!/usr/bin/env bash
# One-time bootstrap: deploys infra/github-oidc.yaml, the small stack that
# lets GitHub Actions deploy infra/monitoring.yaml via OIDC instead of a
# human running ./infra/deploy.sh locally with their own AWS credentials.
# See infra/github-oidc.yaml's own header comment and infra/README.md's
# "Auto-deploy on push" section for the full picture.
#
# Run once. Re-running is safe (cloudformation deploy updates the stack in
# place) and only needed again if github-oidc.yaml itself changes, e.g. a
# different GitHubRepo default.
#
# Next step after this: ./infra/set-github-deploy-role.sh, which reads the
# role ARN this prints and wires it into the GitHub repo.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

STACK_NAME=dance-schedule-github-oidc
REGION=us-east-2

aws cloudformation deploy \
  --template-file github-oidc.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION"

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs'
