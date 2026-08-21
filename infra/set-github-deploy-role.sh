#!/usr/bin/env bash
# Reads infra/github-oidc.yaml's GitHubActionsDeployRoleArn output and sets
# it as a GitHub Actions repository VARIABLE (not a secret — the ARN grants
# nothing on its own without the role's own OIDC trust policy, see that
# file, also matching the caller). .github/workflows/deploy-infra.yml reads
# this variable to know which role to assume.
#
# Run ./infra/deploy-github-oidc.sh first. Requires jq (brew install jq)
# and the GitHub CLI, authenticated (gh auth login).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

STACK_NAME=dance-schedule-github-oidc
REGION=us-east-2

command -v jq >/dev/null || { echo "jq is required (brew install jq)" >&2; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI (gh) is required — https://cli.github.com" >&2; exit 1; }

outputs=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs')

role_arn=$(jq -r '.[] | select(.OutputKey=="GitHubActionsDeployRoleArn") | .OutputValue' <<<"$outputs")

if [[ -z "$role_arn" ]]; then
  echo "Couldn't read GitHubActionsDeployRoleArn from stack $STACK_NAME — has ./infra/deploy-github-oidc.sh been run?" >&2
  exit 1
fi

gh variable set AWS_DEPLOY_ROLE_ARN --body "$role_arn"

echo "Set AWS_DEPLOY_ROLE_ARN = $role_arn as a repository variable."
echo "Optional next step: ./infra/create-github-infra-environment.sh — adds a manual-approval gate before infra deploys run."
