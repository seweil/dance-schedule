#!/usr/bin/env bash
# Keeps the dashboard's "## Releases" table (infra/dashboard.json's own
# release-history widget) current on EVERY push to main — not just the ones
# that touch monitoring.yaml/dashboard.json themselves, which is all
# deploy-infra.yml's own path filter triggers a full `./infra/deploy.sh` for.
#
# A full CloudFormation deploy on every ordinary app-code push would also
# work (the release table's own always-different timestamp guarantees a
# real, non-empty change set every time), but it's slower and touches far
# more of the stack than the one thing that actually changed. This calls
# `aws cloudwatch put-dashboard` directly instead: same end state (this
# generates the identical content deploy.sh would), one fast, idempotent API
# call against just the dashboard resource — using the SAME scoped
# cloudwatch:PutDashboard permission the deploy role already has for this
# exact resource (infra/github-oidc.yaml's AlarmAndDashboard statement), so
# no new IAM grant was needed to add this.
#
# Deliberately bypasses CloudFormation entirely, so this does NOT keep the
# stack's own stored template in sync — its copy of DashboardBody still
# reflects whatever the last real deploy.sh run baked in. Harmless: nothing
# ever reads the stack's own copy back (the LIVE dashboard, not the
# template, is what a human or download-dashboard.sh looks at), and the next
# real deploy.sh run (or this script) overwrites it again regardless.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

DASHBOARD_NAME=dance-schedule-dashboard
REGION=us-east-2

TMP_DASHBOARD="$(mktemp "${TMPDIR:-/tmp}/dance-schedule-dashboard.XXXXXX")"
trap 'rm -f "$TMP_DASHBOARD"' EXIT

./generate-dashboard-body.sh > "$TMP_DASHBOARD"

aws cloudwatch put-dashboard \
  --dashboard-name "$DASHBOARD_NAME" \
  --dashboard-body "file://$TMP_DASHBOARD" \
  --region "$REGION" \
  --query 'DashboardValidationMessages' \
  --output text
