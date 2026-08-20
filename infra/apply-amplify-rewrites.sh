#!/usr/bin/env bash
# Pushes infra/amplify-rewrites.json to the Amplify app's "Rewrites and redirects"
# config via the API, instead of pasting into the console — the console's own
# copy-from-editor has the same stray-newline quirk infra/README.md already notes for
# CloudWatch dashboard queries/widgets. Regenerate the file first with
# `node scripts/generate-amplify-rewrites.mjs` after adding/removing a content set. See
# infra/README.md and docs/design/hosting.md's "Per-content-set Amplify rewrite rule"
# decision.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <amplify-app-id>" >&2
  echo "Find your app id with: aws amplify list-apps --region us-east-2 --query 'apps[].{name:name,appId:appId}'" >&2
  exit 1
fi

APP_ID="$1"
REGION=us-east-2
RULES_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/amplify-rewrites.json"

[[ -f "$RULES_FILE" ]] || { echo "$RULES_FILE not found — run: node scripts/generate-amplify-rewrites.mjs" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required (brew install jq)" >&2; exit 1; }

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
