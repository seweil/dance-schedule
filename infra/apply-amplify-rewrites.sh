#!/usr/bin/env bash
# Pushes infra/amplify-rewrites.json to the Amplify app's "Rewrites and redirects"
# config via the API, instead of pasting into the console — the console's own
# copy-from-editor has the same stray-newline quirk infra/README.md already notes for
# CloudWatch dashboard queries/widgets. Regenerate the file first with
# `node scripts/generate-amplify-rewrites.mjs` after adding/removing a content set. See
# infra/README.md and docs/design/hosting.md's "Per-content-set Amplify rewrite rule"
# decision.
set -euo pipefail

REGION=us-east-2
RULES_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/amplify-rewrites.json"

[[ -f "$RULES_FILE" ]] || { echo "$RULES_FILE not found — run: node scripts/generate-amplify-rewrites.mjs" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required (brew install jq)" >&2; exit 1; }

# Auto-discovers the app id when there's only one Amplify app in the account/region
# (true today) — pass one explicitly ($1) once a second app exists, so this doesn't
# silently guess wrong.
if [[ $# -ge 1 ]]; then
  APP_ID="$1"
else
  apps=$(aws amplify list-apps --region "$REGION" --query 'apps[].{name:name,appId:appId}' --output json)
  count=$(jq length <<<"$apps")
  if [[ "$count" -eq 0 ]]; then
    echo "No Amplify apps found in region $REGION." >&2
    exit 1
  elif [[ "$count" -gt 1 ]]; then
    echo "Multiple Amplify apps found — pass one explicitly: $0 <amplify-app-id>" >&2
    jq -r '.[] | "  \(.appId)  \(.name)"' <<<"$apps" >&2
    exit 1
  fi
  APP_ID=$(jq -r '.[0].appId' <<<"$apps")
fi

# update-app replaces the whole custom-rules list (same "whole map gets replaced"
# behavior set-amplify-env.sh already works around for environment variables) — safe
# here specifically because generate-amplify-rewrites.mjs always regenerates the
# COMPLETE rule set from every content/<set>/ directory, never a partial one, so
# there's nothing pre-existing worth merging in.
aws amplify update-app \
  --app-id "$APP_ID" \
  --region "$REGION" \
  --custom-rules "file://$RULES_FILE" >/dev/null

echo "Applied $(jq length "$RULES_FILE") rewrite rules to app $APP_ID."
echo "Rewrite/redirect rules take effect immediately — no rebuild needed. Verify with: curl -I https://<your-domain>/reset"
