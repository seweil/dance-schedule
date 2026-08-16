#!/usr/bin/env bash
# Deploys infra/email-forwarding.yaml: an SES + Lambda stack that receives
# mail sent to help@<domain> and forwards it to a real inbox, so the
# contact address never has to appear as a plain, spam-crawlable mailto:
# link. See infra/README.md and docs/design/email-forwarding.md.
#
# Usage:
#   ./infra/deploy-email-forwarding.sh [forward-to-address]
# Defaults to steve.weil@gmail.com if no address is given — pass a new one
# any time to redirect forwarding, e.g.:
#   ./infra/deploy-email-forwarding.sh someone-else@gmail.com
#
# SES inbound email receiving is only available in a handful of regions —
# NOT us-east-2, where infra/monitoring.yaml's stack lives. This deploys
# to us-east-1 instead; check AWS's current region-support list before
# changing REGION below.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

STACK_NAME=dance-schedule-email-forwarding
REGION=us-east-1
DOMAIN=sqdance.app
RECIPIENT_LOCAL_PART=help
FORWARD_TO="${1:-steve.weil@gmail.com}"

echo "Deploying $STACK_NAME to $REGION, forwarding ${RECIPIENT_LOCAL_PART}@${DOMAIN} -> $FORWARD_TO"

aws cloudformation deploy \
  --template-file email-forwarding.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameter-overrides \
    Domain="$DOMAIN" \
    RecipientLocalPart="$RECIPIENT_LOCAL_PART" \
    ForwardToAddress="$FORWARD_TO"

RULE_SET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='RuleSetName'].OutputValue" --output text)

# CloudFormation creates the receipt rule set but has no property to mark
# it "active" — SES only ever runs one active rule set per account/region.
# Safe to re-run every deploy.
aws ses set-active-receipt-rule-set --rule-set-name "$RULE_SET_NAME" --region "$REGION"

# SES sandbox (the default for new accounts) only allows sending to
# verified addresses, and forwarding a copy counts as sending. Only ask
# AWS to (re-)send the verification email if it's not already verified.
VERIFIED=$(aws ses get-identity-verification-attributes \
  --identities "$FORWARD_TO" --region "$REGION" \
  --query "VerificationAttributes.\"$FORWARD_TO\".VerificationStatus" --output text 2>/dev/null || echo "NotFound")
if [ "$VERIFIED" != "Success" ]; then
  aws ses verify-email-identity --email-address "$FORWARD_TO" --region "$REGION"
  echo
  echo "AWS just emailed a verification link to $FORWARD_TO — click it"
  echo "before forwarding will actually deliver (SES sandbox requirement)."
fi

echo
echo "Stack deployed. If you haven't already, add these DNS records"
echo "wherever $DOMAIN is hosted (Route53 console or your registrar):"
echo
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey!='RuleSetName' && OutputKey!='BucketName' && OutputKey!='FunctionArn'].[OutputKey,OutputValue]" \
  --output table

echo
echo "MX and DKIM records can take a few minutes (occasionally longer) to"
echo "propagate and for SES to detect domain verification. Check status:"
echo "  aws ses get-identity-verification-attributes --identities $DOMAIN --region $REGION"
