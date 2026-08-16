# CloudWatch dashboard revamp: 3 sections + traffic trend

## Context

`infra/dashboard.json` grew widget-by-widget over several debugging
sessions (each one added to answer a specific question in the moment —
Browser/OS, Installed?, Traffic, Font, MinLevel/MaxLevel/Level Range,
Platform Mix, Raw OS Permutations) with no overall design. This was
already recorded as an open item in `docs/design/monitoring.md`
("Revamp the dashboard", lines 403–431) citing three specific gaps: no
time-series/trend view exists anywhere on the dashboard; "Pages viewed"
has a saved query (`PagesViewedQuery`) but isn't pinned as a widget; and
raw-activity counts (`count(*)`) sit visually mixed in with
session-deduplicated counts (`count_distinct(user_details.sessionId)`)
with nothing distinguishing the two.

The user has now specified the exact target structure, resolving that
open item:
1. **Traffic** — a request-rate graph over time, a pages-viewed table
   sorted by count descending, and the existing totals
   (pages/sessions/devices) widget.
2. **Sessions & Devices** — existing Browser/OS, Installed? (PWA),
   Platform Mix, and Raw OS Permutations widgets.
3. **Session Demographics** — existing MinLevel, MaxLevel, and Level
   Range widgets ("3 level charts"), plus the existing Font widget.

All 9 existing widgets are repositioned/resized only — their `query`
text stays byte-identical — so this stays a reviewable layout diff plus
two genuinely new widgets, not a query rewrite bundled into a reorg.

## Approach

### Time-series trend: Logs Insights `bin()` + `view: "timeSeries"`, not the `AWS/RUM` metric namespace

Confirmed against AWS's own Dashboard Body Structure reference: a
`"type": "log"` widget's `view` property accepts `timeSeries`
specifically to render a `bin()`-grouped Logs Insights result as a line
graph — no different from the `table`/`bar` widgets already in this
file, just a different `view` value plus a `bin()` clause for the time
axis. This is deliberately chosen over CloudWatch RUM's separately
published `AWS/RUM` metric namespace (`PageViewCount` etc.), because
that namespace's exact dimension key (e.g. `application_name`) isn't
verifiable from this repo or from me — I can't run authenticated `aws`
commands in this environment, only prepare scripts for the user to run
— whereas staying on Logs Insights keeps the entire dashboard on one
proven query mechanism with no new IAM surface.

Query (bucketed daily — traffic volume is low, so daily is more
legible than hourly):
```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
| fields @timestamp
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) as pageViews by bin(1d)
```

### Section headers: markdown `text` widgets

CloudWatch dashboards support a `"type": "text"` widget
(`properties.markdown`, `width`/`height`, no `region`/`view`/`query`)
for exactly this purpose. Three of them (`## Traffic`,
`## Sessions & Devices`, `## Session Demographics`), each `height: 2`
(a bare `height: 1` is tight for a `##`-heading with CloudWatch's
default padding — flagged in Verification below to confirm/adjust after
seeing it rendered).

### Layout (24-column grid; all 9 existing widgets keep identical `query`, `title`, `view` — only position/size changes)

| y-range | Widget | x,w,h |
|---|---|---|
| 0–2 | text: `## Traffic` | 0,24,2 |
| 2–8 | **NEW** Request Rate (timeSeries) | 0,16,6 |
| 2–8 | Traffic (existing totals) | 16,8,6 |
| 8–14 | **NEW** Pages Viewed (table, reuses `PagesViewedQuery` text) | 0,24,6 |
| 14–16 | text: `## Sessions & Devices` | 0,24,2 |
| 16–22 | Browser/OS | 0,12,6 |
| 16–22 | Installed? | 12,12,6 |
| 22–28 | Platform Mix | 0,12,6 |
| 22–28 | Raw OS Permutations (diagnostic) | 12,12,6 |
| 28–30 | text: `## Session Demographics` | 0,24,2 |
| 30–36 | MinLevel | 0,8,6 |
| 30–36 | MaxLevel | 8,8,6 |
| 30–36 | Font | 16,8,6 |
| 36–42 | Level Range | 0,24,6 |

## Files to change

### `infra/dashboard.json` — full rewrite to the 14-widget layout above

Every existing widget's `query` string is copied byte-identical from
the current file (only `x`/`y`/`width`/`height` change). New widgets
follow this file's existing query-string convention exactly: single
JSON string, `SOURCE dataSource(...) logGroups(namePrefix: [],
class: "STANDARD") |\n` prefix, `\n` between pipeline stages (confirmed
by reading the current file — every existing widget uses this exact
`logGroups(...)` form, distinct from the plain `SOURCE dataSource(...)`
form used in `monitoring.yaml`/`docs/ops.md` for the same underlying
queries).

New Request Rate widget query string (matching that convention):
```
SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor']) logGroups(namePrefix: [], class: "STANDARD") |
fields @timestamp
| filter event_type = "com.amazon.rum.page_view_event"
| stats count(*) as pageViews by bin(1d)
```
`view: "timeSeries"`, `title: "Request Rate"`.

New Pages Viewed widget: reuse `PagesViewedQuery`'s query text
(`fields metadata.pageId | filter ... | stats count(*) as views by
metadata.pageId | sort views desc`), `view: "table"`,
`title: "Pages Viewed"`.

### `infra/monitoring.yaml` — new `RequestRateQuery` resource

Insert after `PagesViewedQuery` (both are traffic/page-view queries),
before `FontSizeQuery`:
```yaml
  RequestRateQuery:
    Type: AWS::Logs::QueryDefinition
    Properties:
      Name: !Sub '${AppMonitorName}/Request rate over time'
      QueryString: |-
        SOURCE dataSource(['amazon_cloudwatch.rum_app_monitor'])
        | fields @timestamp
        | filter event_type = "com.amazon.rum.page_view_event"
        | stats count(*) as pageViews by bin(1d)
```
Matches the established pattern: every dashboard-pinned query that
isn't tied to a specific event's own schedule data (unlike
MinLevel/MaxLevel's difficulty-rank `case()`, which stays
un-saved per the existing comment) gets both a saved `QueryDefinition`
and a dashboard widget. Add a one-line comment above it noting the
`bin(1d)`/`view: "timeSeries"` reasoning (why this and not the
`AWS/RUM` metric namespace), mirroring this file's existing habit of
explaining *why* a query looks the way it does.

### `docs/ops.md` — new entry in "Retention and aggregate reporting"

Add a "Request rate over time (page views per day)" entry (prose +
query block, matching the section's existing style) before the
"Devices, browsers, OS" entry, since Request Rate now leads the
dashboard's Traffic section. Explain the `bin(1d)`/`timeSeries` choice
briefly, consistent with the `monitoring.yaml` comment.

### `docs/design/monitoring.md` — Open Question → Decision

- **Remove** the "Revamp the dashboard" bullet (lines 403–431) from
  `## Open questions`, leaving the Athena bullet as the sole remaining
  entry there.
- **Add** a new Decision entry after "The hand-built CloudWatch
  Dashboard, exported into `monitoring.yaml` too" (i.e. at the end of
  `## Decisions`, right before `## Open questions`) titled something
  like "Dashboard reorganized into three sections, plus a real
  time-series widget", covering: the three-section split resolving the
  three points from the open item it replaces; the new Pages Viewed
  widget (existing query, newly pinned); and the `bin()`/`timeSeries`
  vs. `AWS/RUM` metric-namespace decision with its rationale (avoids a
  second AWS service surface / unverifiable dimension name / new IAM
  permissions). Note explicitly that all 9 pre-existing widgets kept
  byte-identical query text — only position/size moved.

No changes needed to `infra/deploy.sh` or `infra/download-dashboard.sh`
— the placeholder-splice mechanism is agnostic to what's inside
`dashboard.json`.

## Verification

I can't run `aws` commands or render the dashboard myself — the user
runs `./infra/deploy.sh` themselves. After that, check in the CloudWatch
console:

1. **Request Rate renders a line, not blank/error.** If it looks empty
   or single-dot, widen the dashboard's own top-right time-range picker
   (e.g. to 1 week/month) — daily bucketing needs a multi-day window to
   show more than one point; this is expected, not a bug.
2. **Section headers render as actual headings**, not literal `##`
   text — confirms the markdown widget parsed correctly.
3. **Header `height: 2` doesn't look like wasted whitespace** — if it
   does, drop to `1` and redeploy (the one non-guaranteed layout call
   in this plan).
4. **Pages Viewed table is sorted by views descending**, with real
   route-like `pageId` values (not `undefined`/empty).
5. **Traffic totals widget** (now `h: 6`, up from `h: 3`) doesn't look
   awkwardly sparse next to the taller Request Rate widget — resize
   independently if so, they don't need to match.
6. **Platform Mix and Raw OS Permutations still show real data** after
   repositioning — pure layout change shouldn't affect results, but
   these two had the most debugging history (three past query bugs
   documented in `docs/design/monitoring.md`), worth a sanity glance.
7. **Overall dashboard height (42 grid rows)** doesn't feel excessively
   long in a typical browser viewport — if so, Session Demographics'
   3-across row could go back to 2-across + Font on its own row.
8. Once satisfied, run `./infra/download-dashboard.sh` and diff against
   what was deployed, confirming the CloudFormation splice round-tripped
   cleanly.
