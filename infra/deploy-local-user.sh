#!/usr/bin/env bash
# One-time bootstrap: deploys infra/local-deploy-user.yaml (the IAM user
# covering every infra/*.sh script infra/github-oidc.yaml's CI role doesn't
# — see that template's own header comment) and creates its access key.
#
# Run once, with real (for now: root) credentials — same chicken-and-egg as
# ./infra/deploy-github-oidc.sh. Re-running is safe for the STACK (updates
# in place) but skips key creation if one already exists, rather than
# minting a second one — see the key-creation step below.
#
# After this prints a key, wire it into your local AWS CLI:
#   aws configure --profile dance-schedule-deploy
# then use it for every infra/*.sh script from here on:
#   AWS_PROFILE=dance-schedule-deploy ./infra/set-amplify-env.sh <app-id>
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

STACK_NAME=dance-schedule-local-deploy-user
REGION=us-east-2
USER_NAME=dance-schedule-deploy

command -v jq >/dev/null || { echo "jq is required (brew install jq)" >&2; exit 1; }

# --- Resolve the two scoping parameters, same auto-discovery convention
# apply-amplify-rewrites.sh already uses for its own Amplify app id. ---

if [[ -n "${AMPLIFY_APP_ID:-}" ]]; then
  AMPLIFY_APP_ID_RESOLVED="$AMPLIFY_APP_ID"
else
  apps=$(aws amplify list-apps --region us-east-2 --query 'apps[].{name:name,appId:appId}' --output json)
  count=$(jq length <<<"$apps")
  if [[ "$count" -eq 0 ]]; then
    echo "No Amplify apps found in region us-east-2." >&2
    exit 1
  elif [[ "$count" -gt 1 ]]; then
    echo "Multiple Amplify apps found — set AMPLIFY_APP_ID explicitly:" >&2
    jq -r '.[] | "  \(.appId)  \(.name)"' <<<"$apps" >&2
    exit 1
  fi
  AMPLIFY_APP_ID_RESOLVED=$(jq -r '.[0].appId' <<<"$apps")
fi

if [[ -n "${ROUTE53_HOSTED_ZONE_ID:-}" ]]; then
  ZONE_ID_RESOLVED="$ROUTE53_HOSTED_ZONE_ID"
else
  ZONE_ID_RESOLVED=$(aws route53 list-hosted-zones-by-name \
    --dns-name sqdance.app --max-items 1 \
    --query 'HostedZones[0].Id' --output text | sed 's#/hostedzone/##')
  if [[ -z "$ZONE_ID_RESOLVED" || "$ZONE_ID_RESOLVED" == "None" ]]; then
    echo "No Route53 hosted zone found for sqdance.app — set ROUTE53_HOSTED_ZONE_ID explicitly." >&2
    exit 1
  fi
fi

echo "Amplify app id:        $AMPLIFY_APP_ID_RESOLVED"
echo "Route53 hosted zone id: $ZONE_ID_RESOLVED"
echo

aws cloudformation deploy \
  --template-file local-deploy-user.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameter-overrides \
    "AmplifyAppId=$AMPLIFY_APP_ID_RESOLVED" \
    "Route53HostedZoneId=$ZONE_ID_RESOLVED"

# --- Access key: created via a direct `aws iam` call, not as a
# CloudFormation resource — an AWS::IAM::AccessKey resource would put the
# secret into the stack's own template/state (and any NoEcho Output still
# leaves it sitting in CloudFormation's event history), which is a worse
# place for a long-lived secret to live than "printed once, then only in
# your local AWS credentials file." ---
existing_keys=$(aws iam list-access-keys --user-name "$USER_NAME" --region "$REGION" --query 'AccessKeyMetadata' --output json)
if [[ "$(jq length <<<"$existing_keys")" -gt 0 ]]; then
  echo
  echo "$USER_NAME already has an access key — not creating a second one."
  echo "Existing key id(s):"
  jq -r '.[].AccessKeyId' <<<"$existing_keys"
  echo "To rotate: aws iam create-access-key --user-name $USER_NAME, switch your"
  echo "local profile to the new key, THEN deactivate/delete the old one."
  exit 0
fi

echo
echo "Creating access key for $USER_NAME..."
aws iam create-access-key --user-name "$USER_NAME" --region "$REGION" --output json

echo
echo "Copy the AccessKeyId/SecretAccessKey above into a named profile — it will"
echo "NEVER be shown again after this:"
echo "  aws configure --profile dance-schedule-deploy"
echo
echo "Then use that profile for every infra/*.sh script this closes the gap for:"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/set-amplify-env.sh <app-id>"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/apply-amplify-rewrites.sh"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/deploy-email-forwarding.sh"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/add-email-dns-records.sh"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/enable-js-error-alarm.sh"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/disable-js-error-alarm.sh"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/deploy.sh"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/refresh-dashboard.sh"
echo "  AWS_PROFILE=dance-schedule-deploy ./infra/download-dashboard.sh"
