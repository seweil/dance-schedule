#!/usr/bin/env bash
# Mutes docs/design/alerting.md's JS-error alarm — stops SNS email
# notifications while leaving the alarm itself evaluating (its ALARM/OK
# state still shows correctly on the CloudWatch console and dashboard, so
# muting doesn't mean flying blind, just not getting paged). Use this while
# actively investigating a known, already-noticed issue, not as a way to
# forget about it — nothing reminds you to re-enable. See
# ./infra/enable-js-error-alarm.sh to undo, and docs/ops.md's "Muting
# alerts" section.
set -euo pipefail

ALARM_NAME=dance-schedule-js-errors
REGION=us-east-2

aws cloudwatch disable-alarm-actions --alarm-names "$ALARM_NAME" --region "$REGION"

enabled=$(aws cloudwatch describe-alarms --alarm-names "$ALARM_NAME" --region "$REGION" --query 'MetricAlarms[0].ActionsEnabled')

echo "Muted $ALARM_NAME (ActionsEnabled: $enabled) - no more SNS notifications until ./infra/enable-js-error-alarm.sh is run."
