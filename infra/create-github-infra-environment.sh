#!/usr/bin/env bash
# Optional: creates the "aws-infra" GitHub Environment that
# .github/workflows/deploy-infra.yml targets, with the current
# gh-authenticated user as a required reviewer — a manual approval click
# before any infra deploy actually runs. Without this, a push to main that
# touches infra/monitoring.yaml deploys to AWS immediately, no pause.
#
# Safe to skip entirely (just delete the `environment:` line from
# .github/workflows/deploy-infra.yml) if you'd rather infra deploy with the
# same zero-friction the app itself does via Amplify.
#
# Requires the GitHub CLI, authenticated (gh auth login) with admin rights
# on the repo. Not exhaustively tested against the live GitHub API from
# this checkout — if it errors, the equivalent manual steps are repo →
# Settings → Environments → New environment → name it "aws-infra" → add
# yourself as a required reviewer.
set -euo pipefail

command -v gh >/dev/null || { echo "GitHub CLI (gh) is required — https://cli.github.com" >&2; exit 1; }

user_id=$(gh api user -q .id)

gh api --method PUT "repos/{owner}/{repo}/environments/aws-infra" --input - <<EOF
{
  "reviewers": [
    { "type": "User", "id": ${user_id} }
  ]
}
EOF

echo "Created/updated the 'aws-infra' environment with you as a required reviewer."
