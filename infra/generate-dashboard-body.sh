#!/usr/bin/env bash
# Prints infra/dashboard.json's own content to stdout, with its two
# placeholders substituted for real, current values: __ACCOUNT_ID__ (this
# AWS account's id, needed by the JS-error-alarm widget's ARN — see
# monitoring.yaml's own AlarmAndDashboard comment) and __RELEASE_HISTORY__
# (the "## Releases" table's markdown, generated fresh from the last 20
# commits to origin/main — CloudWatch has no live git data source, so this
# is only ever as fresh as whichever script last ran this file).
#
# Factored out of deploy.sh so BOTH of this repo's two ways of updating the
# live dashboard share one generator instead of drifting apart:
#   - deploy.sh splices this into monitoring.yaml's DASHBOARD_JSON_PLACEHOLDER
#     before a full CloudFormation stack deploy (needed whenever anything
#     ELSE about the stack changed too, not just the dashboard).
#   - refresh-dashboard.sh pushes this SAME content straight to AWS via
#     `aws cloudwatch put-dashboard`, no CloudFormation involved — see that
#     script's own comment for why that's the better fit for keeping the
#     Releases table current on every ordinary push, not just infra changes.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# A failed fetch (offline, no network) falls through to whatever origin/main
# ref is already known locally rather than aborting the whole thing over a
# non-essential widget.
git fetch origin main --quiet 2>/dev/null || true
RELEASE_LOG=$(git log -20 --pretty=format:'%h|%as|%s' origin/main 2>/dev/null || git log -20 --pretty=format:'%h|%as|%s' HEAD)

python3 - "$ACCOUNT_ID" "$RELEASE_LOG" <<'PYEOF'
import json
import sys
from datetime import datetime, timezone

account_id = sys.argv[1]
release_log = sys.argv[2]

with open('dashboard.json') as f:
    text = f.read().rstrip('\n')

text = text.replace('__ACCOUNT_ID__', account_id)

rows = []
for line in release_log.splitlines():
    if not line.strip():
        continue
    commit_hash, date, summary = line.split('|', 2)
    # A `|` inside a commit summary would otherwise break out of the
    # markdown table's own column structure.
    summary = summary.replace('|', '\\|')
    rows.append(f'| `{commit_hash}` | {date} | {summary} |')

generated_at = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
# Must keep starting with "*As of " — download-dashboard.sh matches on that
# exact prefix to re-placeholder this widget when pulling the live dashboard
# back into source control, so a live-only snapshot never gets committed.
release_markdown = '\n'.join([
    f'*As of {generated_at} — refreshed automatically on every push to `main` '
    '(`.github/workflows/refresh-dashboard.yml`). If this looks stale, check '
    'the Actions tab for a failed "Refresh dashboard" run.*',
    '',
    '| Commit | Date | Summary |',
    '|---|---|---|',
    *rows,
])
text = text.replace('__RELEASE_HISTORY__', json.dumps(release_markdown)[1:-1])

print(text)
PYEOF
