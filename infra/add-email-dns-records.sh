#!/usr/bin/env bash
# Adds the MX + 3 DKIM CNAME records infra/email-forwarding.yaml's stack
# needs, directly to Route53 — only safe to run because sqdance.app's DNS
# is confirmed to live in Route53 (see docs/design/email-forwarding.md).
# Reads the record values fresh from the deployed stack's own outputs, so
# it stays correct even if the stack is ever redeployed.
#
# Refuses to touch the MX record if one already exists with a different
# value, rather than silently overwriting it — resolve that by hand if it
# happens (an unexpected pre-existing MX record on this domain would be
# surprising and worth understanding before overwriting either way).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

STACK_NAME=dance-schedule-email-forwarding
REGION=us-east-1
DOMAIN=sqdance.app

OUTPUTS_JSON=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query 'Stacks[0].Outputs' --output json)

get_output() {
  echo "$OUTPUTS_JSON" | jq -r --arg key "$1" '.[] | select(.OutputKey==$key) | .OutputValue'
}

MX_VALUE=$(get_output MxRecordValue)
DKIM1_NAME=$(get_output Dkim1RecordName); DKIM1_VALUE=$(get_output Dkim1RecordValue)
DKIM2_NAME=$(get_output Dkim2RecordName); DKIM2_VALUE=$(get_output Dkim2RecordValue)
DKIM3_NAME=$(get_output Dkim3RecordName); DKIM3_VALUE=$(get_output Dkim3RecordValue)

ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name "$DOMAIN" --max-items 1 \
  --query 'HostedZones[0].Id' --output text | sed 's#/hostedzone/##')

if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" = "None" ]; then
  echo "No Route53 hosted zone found for $DOMAIN" >&2
  exit 1
fi

EXISTING_MX=$(aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --query "ResourceRecordSets[?Name=='${DOMAIN}.' && Type=='MX']" --output json)

if [ "$(echo "$EXISTING_MX" | jq 'length')" -gt 0 ] \
  && [ "$(echo "$EXISTING_MX" | jq -r '.[0].ResourceRecords[0].Value')" != "$MX_VALUE" ]; then
  echo "An existing, different MX record is already set on $DOMAIN:" >&2
  echo "$EXISTING_MX" | jq . >&2
  echo "Refusing to overwrite automatically — resolve by hand." >&2
  exit 1
fi

CHANGE_BATCH=$(jq -n \
  --arg domain "${DOMAIN}." \
  --arg mx "$MX_VALUE" \
  --arg n1 "${DKIM1_NAME}." --arg v1 "$DKIM1_VALUE" \
  --arg n2 "${DKIM2_NAME}." --arg v2 "$DKIM2_VALUE" \
  --arg n3 "${DKIM3_NAME}." --arg v3 "$DKIM3_VALUE" \
  '{
    Changes: [
      { Action: "UPSERT", ResourceRecordSet: { Name: $domain, Type: "MX", TTL: 300, ResourceRecords: [{ Value: $mx }] } },
      { Action: "UPSERT", ResourceRecordSet: { Name: $n1, Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: $v1 }] } },
      { Action: "UPSERT", ResourceRecordSet: { Name: $n2, Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: $v2 }] } },
      { Action: "UPSERT", ResourceRecordSet: { Name: $n3, Type: "CNAME", TTL: 300, ResourceRecords: [{ Value: $v3 }] } }
    ]
  }')

aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch "$CHANGE_BATCH"

echo
echo "DNS records submitted. Propagation is usually fast within Route53"
echo "itself; SES domain verification can lag a few minutes behind that."
echo "Check status with:"
echo "  aws ses get-identity-verification-attributes --identities $DOMAIN --region $REGION"
