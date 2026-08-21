#!/usr/bin/env bash
# Un-mutes docs/design/alerting.md's JS-error alarm — the inverse of
# ./infra/disable-js-error-alarm.sh (see that script's own comment for what
# muting does and doesn't affect).
set -euo pipefail

ALARM_NAME=dance-schedule-js-errors
REGION=us-east-2

aws cloudwatch enable-alarm-actions --alarm-names "$ALARM_NAME" --region "$REGION"

enabled=$(aws cloudwatch describe-alarms --alarm-names "$ALARM_NAME" --region "$REGION" --query 'MetricAlarms[0].ActionsEnabled')

echo "Unmuted $ALARM_NAME (ActionsEnabled: $enabled) - SNS notifications resume on the next state change."
