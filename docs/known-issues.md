# Known issues / follow-ups

Bugs and flakes found in passing, not yet worth fixing inline. Not
architectural decisions (see `docs/design/` for those) — just a running list.

## High priority: AWS deploys are running as the account's root user, not a scoped IAM identity

**Found 2026-08-21**, running `./infra/deploy.sh` in a Claude Code
session: `aws sts get-caller-identity` returned
`arn:aws:iam::038964339720:root` — not an IAM user or an assumed role.
Every `infra/*.sh` script (`deploy.sh`, `set-amplify-env.sh`,
`apply-amplify-rewrites.sh`, `enable-js-error-alarm.sh`/
`disable-js-error-alarm.sh`, `deploy-email-forwarding.sh`,
`add-email-dns-records.sh`) has been run — at least in this session —
with full, unscoped root credentials rather than a permission-bounded
identity.

**Why this matters:** root has no permission boundary at all. A leaked
credential, a scripting mistake (wrong `--stack-name`, typo'd `--region`,
a destructive command run against the wrong resource), or a compromised
local machine has unlimited blast radius across the *entire* AWS
account — not just this app's own stacks/buckets/domains. AWS's own
long-standing guidance is to avoid using root for routine work and
reserve it only for the handful of account-level tasks that genuinely
require it (closing the account, certain billing/support operations).

**Fix:** create a scoped IAM identity (an IAM user, or better, an SSO/
assumed role) covering exactly what these scripts touch —
CloudFormation (the `dance-schedule-monitoring` and
`dance-schedule-email-forwarding` stacks), Amplify (app + env-var
management), CloudWatch (Alarms, Logs, RUM), SNS, SES, Route53, and
Cognito (the identity pool `monitoring.yaml` creates) — then switch
local AWS CLI credentials (`aws configure` or an SSO profile) to that
identity for all day-to-day deploys, and stop signing in as root
entirely except for the rare account-level task that actually needs it.

**Narrowed 2026-08-21, not closed:** `infra/github-oidc.yaml` +
`.github/workflows/deploy-infra.yml` (see `infra/README.md`'s "Auto-deploy
on push" and `docs/design/monitoring.md`'s "Deployed via GitHub Actions
OIDC" decision) move the `dance-schedule-monitoring` stack's own deploys
onto a scoped IAM role assumed by GitHub Actions via OIDC, with no local
credentials involved at all for that one script. That's real progress —
the highest-frequency-change infra script no longer needs a human's root
session — but `set-amplify-env.sh`, `apply-amplify-rewrites.sh`,
`deploy-email-forwarding.sh`, and `add-email-dns-records.sh` are
untouched and still run locally as root. The fix above (a scoped identity
for local day-to-day use) is still the right direction for those.

**Fixed and verified 2026-08-26:** `infra/local-deploy-user.yaml` +
`infra/deploy-local-user.sh` (see `infra/README.md`'s "A scoped IAM
identity for the scripts CI doesn't cover") — an IAM user
(`dance-schedule-deploy`) covering every script listed above, so a human's
local, day-to-day AWS CLI use never needs root either, going forward. A
static access key, not an assumable role — SSO's own short-TTL-token-refresh
is what the very next entry below describes breaking under this sandbox,
and a static key has no refresh cycle to hit that.

Two real template bugs surfaced during the actual bootstrap deploy, both
fixed in `local-deploy-user.yaml`: the `Description` field exceeded
CloudFormation's 1024-character limit (trimmed, detail moved to a `#`
comment instead), and the policy — as an inline `AWS::IAM::User` policy —
exceeded IAM's 2048-byte inline-policy limit at ~4.8KB (converted to a
customer-managed `AWS::IAM::ManagedPolicy`, 6144-byte limit, attached to
the same user).

**Verified against the real account, same session:** `enable-js-error-alarm.sh`,
`apply-amplify-rewrites.sh`, `add-email-dns-records.sh`, and
`deploy-email-forwarding.sh` all succeeded under the new profile with no
`AccessDenied`. `set-amplify-env.sh` also succeeded — note it triggers a
real production build unconditionally (not just when env vars actually
change), so running it as a "just verifying permissions" check still
redeployed the live site. `disable-js-error-alarm.sh` specifically wasn't
exercised (blocked by Claude Code's own auto-mode classifier, unrelated to
AWS IAM — `enable` exercises the identical `cloudwatch:*AlarmActions` grant,
so this isn't believed to be a real gap, just untested by that one session).

**Not yet done, still needs a human:** deactivating whatever root
credentials were in local day-to-day use before this (IAM console → My
Security Credentials — not something the AWS CLI can do on root's own
behalf). **Update 2026-08-26:** confirmed there's no long-lived root
*access key* to deactivate at all in this account — day-to-day root use
here is via `aws login` (console-session-bridging, see that entry below),
not a static key. So there's nothing to deactivate in IAM; the real
remaining step is to stop *signing into the console as root* day-to-day.

**Paused mid-decision 2026-08-26 — resume here:** decided against IAM
Identity Center for personal console login (real tradeoffs discussed —
temporary sessions, cleaner CloudTrail identity, scales to future
accounts/people — but all low-value for a genuinely single-operator
account) in favor of a plain IAM user with `AdministratorAccess`,
console-login-only (password + MFA), deliberately **no access key** (no
CLI use needed under this identity — `dance-schedule-deploy` already
covers the infra scripts). Not yet created. Next steps when resuming:
1. IAM console → Users → create the user, attach `AdministratorAccess`
   (or a scoped-down policy if preferred on reflection), enable console
   access with a password, set up MFA.
2. Start signing into the console as that user instead of root for
   everyday work; reserve root sign-in for genuinely account-level tasks.
3. Nothing to touch in this repo for this step — it's pure AWS account
   configuration, no infra/*.sh or template changes.

## Claude Code's own sandbox can't launch Chromium — fixed, but only for the exact allowlisted command forms

**Resolved 2026-08-01** (commit `084f6b1`, `.claude/settings.json`) — but
resurfaces if Playwright is invoked any way other than the two exact forms
below, so read the "Only works for these exact invocations" section even if
this looks fixed.

**Originally found:** 2026-07-30. Every attempt to launch Chromium from
inside a Claude Code Bash tool call failed identically, at the
browser-launch step, before any test even started:

```
FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS.
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer...: Permission denied (1100)
```

Root cause: a macOS Mach-port/bootstrap-namespace restriction from the
coding agent's own Seatbelt sandbox — not a Playwright flag, not a generic
project-config issue (`--no-sandbox` is already passed to Chromium and
doesn't help, since this check happens before Chromium's own internal
sandboxing even engages).

**The fix:** `.claude/settings.json`'s `sandbox.excludedCommands` routes
specific command strings around the sandbox entirely, rather than trying to
loosen it in general. `allowMachLookup` (present since this project's
scaffold commit) was tried first and is **not sufficient on its own** — it
only covers Mach-service *lookups*, not the *registration/check-in* step
Chromium's Mach port rendezvous actually needs — see that commit's message
for the full reasoning:

```json
"sandbox": {
  "excludedCommands": ["pnpm test:e2e *", "npx playwright *"],
  "network": {
    "allowMachLookup": ["com.apple.coresimulator.*", "org.chromium.Chromium.MachPortRendezvousServer.*"]
  }
}
```

**Only works for these exact invocations.** `excludedCommands` matches the
literal Bash command string, not "whatever eventually runs Playwright" — so
`pnpm test:e2e ...` and `npx playwright ...` (any arguments) both work, but
`pnpm exec playwright test ...`, a bare `playwright test ...`, or any other
equivalent phrasing do **not** match either pattern and get sandboxed like
normal, hitting the exact same Mach-port failure above. **Confirmed
2026-08-13:** `pnpm exec playwright test e2e/app.spec.ts` failed with this
error on all 14 tests; switching to the identical spec via `pnpm test:e2e
e2e/app.spec.ts` (and then the full `pnpm test:e2e`, 52 specs) passed
cleanly in the same session with no config change — confirming the fix
still works today and the earlier failure was an invocation mistake, not a
regression. (This also explains an apparent "no longer reproduces as of
2026-08-12" entry from an earlier version of this doc — that session likely
just happened to invoke it correctly.)

**Takeaway for a future session:** always run e2e tests via `pnpm test:e2e`
(optionally with a spec path/args after it) — never `pnpm exec playwright`
or a bare `playwright` invocation. If `pnpm test:e2e ...` itself somehow
still fails with the Mach-port error, that would be a genuine regression
worth investigating (start with whether `.claude/settings.json`'s
`sandbox.excludedCommands` still contains the `"pnpm test:e2e *"` entry);
until then, don't assume it's unfixable. Fallbacks, if still needed:

1. Check the GitHub Actions run for the relevant branch/PR
   (`.github/workflows/ci.yml`'s `e2e` job runs on a normal `ubuntu-latest`
   runner, with no nested sandbox, so Chromium launches there without issue)
   — see `docs/testing.md` for exactly where to find its results.
2. Use the `claude-in-chrome` MCP browser-automation tool against a real
   `pnpm build && pnpm preview` for live/manual verification.
3. Ask the user to run `pnpm test:e2e` locally (outside Claude Code's
   sandbox) and report back the result.

## Claude Code's own sandbox blocks macOS Keychain writes — every `git push` warns "failed to store: 100001"

**Found:** 2026-08-04, while pushing commits during a Claude Code session in
this repo.

Every `git push` over HTTPS (this repo's remote) succeeds — the ref updates
correctly — but the command also prints:

```
failed to store: 100001
```

Reproduced directly and confirmed it's unrelated to this repo or GitHub
specifically — the identical failure happens against a fake host:

```
$ printf 'protocol=https\nhost=example.com\nusername=x\npassword=y\n' | git credential-osxkeychain store
failed to store: 100001
```

The user's global `~/.gitconfig` sets `credential.helper=osxkeychain`; after
a successful HTTPS auth, git's normal flow calls that helper's `store`
action to refresh the cached credential. That write to the macOS Keychain
(Security framework) is blocked by the coding agent's own OS-level sandbox —
the same category of restriction as the Playwright/Chromium entry below
(this environment's sandbox denies interaction with system frameworks like
the Keychain, not just filesystem paths outside the project).

**Impact:** cosmetic/noisy only. Auth itself still works (`get` succeeds,
presumably via an already-cached keychain entry created outside the
sandbox), so every push completes and the branch ref updates as expected.
The message can look alarming — it reads like a failure — even though the
push it's attached to succeeded.

**Not a repo bug — no code-side fix.** Changing `credential.helper` (e.g. to
`cache`, which stores in-memory instead of the Keychain) would silence it,
but that's a git-config edit, and this project's Claude Code instructions
prohibit updating git config under any circumstance — and the sandbox
itself can't be disabled from within a session either. A user who wants it
silenced would need to run something like
`git config --local credential.helper cache` themselves (scoped to just
this repo, not their global config) — not something a Claude Code session
will do on its own.

## Claude Code's own sandbox blocks `aws login`'s token refresh — `aws` CLI calls fail with "Operation not permitted" a few minutes after login

**Found:** 2026-08-21, running `infra/*.sh` scripts (deploying
`monitoring.yaml`, running Logs Insights queries) across a long Claude Code
session in this repo. AWS CLI calls that worked fine right after the user
logged in started failing again after a few minutes, every time, with:

```
aws: [ERROR]: [Errno 1] Operation not permitted: '/Users/sweil/.aws/login/cache/<token-id>.json'
```

**Corrected 2026-08-26** (originally misdiagnosed as IAM Identity Center
SSO): the command involved is `aws login` — a built-in AWS CLI v2 feature
("Login for local development using AWS Management Console credentials,"
per `aws login help`), not SSO. It bridges whatever identity you're signed
into the **AWS Management Console** as (in this account's case, confirmed
via `aws sts get-caller-identity`: literally the root user) into local CLI
credentials — a short-lived access token plus a longer-lived refresh token,
both cached at `~/.aws/login/cache/*.json`. Not an AWS-side rejection (that
would read as an expired/invalid session token error) — an OS-level
permission error on a local file *write*. Same category of restriction as
the git/Keychain entry above: once the short-lived access token expires
(routine, well under an hour), the AWS CLI normally uses the refresh token
to silently mint a new one and write it back to that same cache file — and
that write is what the coding agent's own OS-level sandbox blocks, the same
way it blocks git's Keychain `store` write. The `aws login` command itself
(run once, presumably outside/before the sandbox's restrictions applied to
that process) succeeds and leaves a fresh, temporarily-writable token
behind, which is why it looks like "login only lasts a few minutes" rather
than "refresh keeps getting silently blocked."

**Impact:** every `aws` CLI call from within a Claude Code session in this
sandbox eventually fails this way, need re-running `aws login` — outside
the sandboxed session, same as the git Keychain issue — to get a fresh
writable token again. Genuinely disruptive here, unlike the cosmetic git
warning: mid-task `aws` commands (an `infra/deploy.sh` run, a Logs Insights
query) just fail outright rather than completing with a harmless extra
message.

**Not a repo bug — no code-side fix**, and the sandbox itself can't be
disabled from within a session.

**Mitigation shipped 2026-08-26:** `infra/local-deploy-user.yaml` (see the
root-user entry above) — a static IAM access key has no refresh cycle to
hit this at all. Confirmed live: every `infra/*.sh` script run under
`AWS_PROFILE=dance-schedule-deploy` in the same long session worked with no
"Operation not permitted" recurrence, unlike `default`/root's `aws login`
session. Doesn't fix `aws login` itself (still needed for anything that
genuinely requires root, or for console browsing under whatever identity
you sign in as day-to-day) — just means this project's own infra scripts no
longer depend on it.

## Claude in Chrome's debugging banner shows in every Chrome window, not just the profile it's scoped to

**Found:** 2026-08-04, user question about scoping the `claude-in-chrome`
browser tools to a dedicated test Chrome profile, kept separate from their
personal one.

The user set up a dedicated Chrome profile for `claude-in-chrome` (extension
enabled only there; confirmed **disabled** — the actual toggle in
`chrome://extensions`, not just unpinned — in their personal profile) and
expected the "[Claude] is debugging this browser" infobar to appear only in
that test profile's windows. It appeared in every open Chrome window
instead, including the personal profile's, despite the extension genuinely
being off there.

**Root cause (confirmed architecture, inferred conclusion):** on macOS,
Chrome's built-in profile picker runs every open profile inside **one
shared Chrome application process**, not fully separate OS processes —
profiles isolate data/extensions/cookies from each other, but they're
windows within the same running app instance. The debugging infobar most
likely renders at that shared-process level rather than being scoped to
the specific profile window whose extension actually attached the
debugger — so a debugger session started in the test profile can visually
surface the banner across every window of that same Chrome launch,
personal profile included.

**Not a real isolation gap, as far as this session dug in** — the banner
showing up everywhere looks like a cosmetic side effect of the shared
process, not evidence of actual cross-profile access. `chrome.debugger`
attachment itself is per-tab and driven by the extension's own code, which
isn't running at all in the personal profile (confirmed disabled there) —
so there's nothing to attach a debugger to on that side, regardless of what
the banner visually implies.

**Not fully verified, and not a repo bug either way** — this is
Claude-in-Chrome/Chrome-profile behavior, unrelated to this codebase. Two
decisive tests were suggested but not yet run by the user: (1) quit Chrome
entirely and relaunch with *only* the test profile open — if the banner
still shows, that's fully consistent with the shared-process theory and
rules out any personal-profile involvement; (2) do a real browser action
and confirm it only ever lands on a test-profile tab, never a personal one,
regardless of where the banner appears. User said this "sounds benign" and
asked to revisit later rather than chase it further now.

## `combineA1A2` silently defaults to `false`, opposite of the documented recommendation

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`vite-plugin-content-config.ts`'s `DEFAULT_CONTENT_CONFIG` (used when
`config.yaml` is absent) and its missing-key fallback (`?? false`) both
default `features.combineA1A2` to `false`. But `docs/adding-a-new-event.md`
explicitly documents skipping `config.yaml` entirely as producing "sensible
defaults," and its own example recommends `combineA1A2: true` ("set to true
unless yours genuinely needs A1 and A2 kept separate").

**Impact:** any new event that follows the guide and omits `config.yaml` (an
explicitly encouraged shortcut) silently gets the *opposite* of the
documented default — a split A1/A2 slider stop instead of combined — with no
warning anywhere.

**Fixed (2026-07-30):** both `DEFAULT_CONTENT_CONFIG` and the missing-key
fallback in `vite-plugin-content-config.ts` now default `combineA1A2` (and
the newer `combineC3BC4`, added the same day — see
`docs/design/dance-schedule.md`'s "second merge flag" decision) to `true`,
matching the docs — including `content/automated-testing/config.yaml`, which
briefly overrode `combineC3BC4` back to `false` to keep
`e2e/room-schedule.spec.ts`'s hardcoded slot indices stable, then dropped
that override in favor of updating the test's indices instead (that set is
never deployed to a real event, so there's no reason for its config to differ
from the recommended default — see `docs/design/content-config.md`'s
"both combine both pairs" decision). The uncombined case still has full
coverage, just in unit tests (`src/lib/levelOrder.test.ts` and friends)
rather than a live content set.

## Level taxonomy is hardcoded to modern western square dance only

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`src/types/danceSchedule.ts`'s `LEVEL_CODES` (and `levelOrder.ts`'s
`LEVEL_ORDER`/`getLevelSlots`) hardcode the square-dance skill taxonomy
(SSD/MS/Plus/A1/A2/C1–C4) with no config-driven way for a new event to
define a different one.

**Failure scenario:** both existing real events' own home-page copy
advertises "square and round dancing," but a round-dance session entered
with a real round-dance level (e.g. `Bronze` or `Phase 4`) fails
`isValidLevel` and breaks the entire build with "Unrecognized level code" —
that content can't be represented at all without a code change.

**Fix direction:** making the taxonomy itself content-set-configurable (for a
genuinely different dance form) is a bigger design question — worth a
`docs/design/` entry of its own if a real round-dance or contra event is
ever added, rather than a quick fix here.

**Partially resolved (2026-07-30):** the *compounding* half of this issue —
`getLevelSlots`'s combined-mode branch hand-duplicating `LEVEL_ORDER`'s items
as a second literal array, silently dropping any future `LEVEL_ORDER`
insertion a combined-mode branch forgot to also update — is fixed. Adding a
second independent merge flag (`combineC3BC4`, for a "C3B+" slot) was the
forcing function: `getLevelSlots` now derives every merge's slot from
`LEVEL_ORDER` programmatically (`buildLevelSlots`, given a list of
`{ label, levels }` merges, asserting contiguity) instead of hand-writing a
combined-mode array per flag/flag-combination — see
`docs/design/dance-schedule.md`'s "second merge flag" decision. The
broader hardcoded-taxonomy issue above is unaffected by this fix.

## Dance-schedule time range with no AM/PM on either side isn't cross-checked

**Found:** 2026-07-29, deep code review for correctness/generality bugs.

`parseTimeRange.ts`'s meridiem-inference only fires when exactly one side
of a range has AM/PM and the other doesn't. When *neither* side specifies
it, both parse as literal 24-hour values with no plausibility check.

**Failure scenario:** a volunteer enters `1-3` meaning 1:00 PM–3:00 PM
(afternoon session, meridiem omitted as "obviously" afternoon). Both sides
parse as literal 24-hour (1:00 AM, 3:00 AM); since 1am < 3am the
start-before-end check doesn't throw — the session is silently scheduled
at 1–3 AM instead of 1–3 PM, with no build error.

**Fix direction:** undecided — could require at least one side to specify
AM/PM when both raw hours are ≤12 (failing loudly instead), or restrict the
literal-24-hour fallback to hours that couldn't plausibly be 12-hour (13–23).
Needs a decision on which real-world inputs should still be allowed bare.

## Flaky: "nav links to the schedule page, which renders events"

**Found:** 2026-07-26, same verification pass.

`e2e/app.spec.ts`'s basic schedule-nav test failed once when run for real
(`pnpm test:e2e` in a real terminal), but the identical flow (click Schedule
link → heading visible → list item visible) reproduced correctly every time
when walked through manually via browser automation against
`pnpm build && pnpm preview`.

**Suspected cause:** a timing/first-load race (e.g. service-worker
registration or the PWA update-prompt) rather than a real functional
regression.

**Next step:** re-run `pnpm test:e2e` a few times to confirm it's actually
flaky rather than a one-off fluke; if it recurs, look at SW registration
timing on that route.

## PWA manifest: icons never added, description still a placeholder

**Found:** 2026-07-26, while verifying the Amplify Hosting deploy
(unrelated to hosting — pre-existing; DevTools → Application → Manifest
surfaced it against the live Amplify URL).

Chrome's manifest audit reports:
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`
  all fail to load (404)
- "No supplied icon is at least 144px square" / "Most operating systems
  require square icons" — a consequence of the above, not a separate defect
- `description` field renders as the literal string
  `"TODO: one-line description of what this app does."`

**Root cause:** `public/manifest.webmanifest` references all three icon
paths correctly, but `public/icons/` only contains a `.gitkeep` — the actual
PNG files were never added (confirmed both in the source tree and in a local
`dist/` build). The `description` field is the unfilled placeholder text,
same wording as the still-TODO project-overview line in `CLAUDE.md`.

**Not just cosmetic:** per `CLAUDE.md`, PWA audit regressions are meant to
be build-breaking, not optional cleanup — a missing valid icon set is a real
installability gap (affects the actual "Add to Home Screen" / install
experience), not merely a "richer UI" nice-to-have.

**Fix direction:** design/export real 192×192, 512×512, and a maskable
512×512 icon (with safe-area padding per Chrome's maskable-icon guidance),
add them under `public/icons/`, and replace the `description` placeholder
with a real one-line summary once the project overview in `CLAUDE.md` is
also written (same TODO, two places).

**Lower priority (same audit pass, cosmetic only):** no manifest
`screenshots` entries with `form_factor: "wide"` (desktop) or without/other
than `wide` (mobile) — only affects the "richer install UI" presentation,
not installability itself. Worth doing once real screenshots exist, not
urgent.

## Future work: native "Install" button on Chrome/Android via `beforeinstallprompt`

**Raised:** 2026-07-26, while writing the Installation page's manual
instructions ("tap the ⋮ menu → Add to Home screen").

Chrome/Android (and other Chromium browsers) fire a `beforeinstallprompt`
event when the page is installable, which can be captured and deferred to
show a custom "Install" button that triggers the browser's native install
prompt directly — nicer than asking the user to find the menu item
themselves. iOS Safari has no equivalent API (no installability detection,
no programmatic prompt), so manual instructions stay required there
regardless.

**Why deferred:** manual instructions are correct and sufficient for now;
this is a UX polish item, not a gap. No standard package is worth adding for
it (surveyed in conversation — the install-prompt ecosystem is thin and
fragmented; the one community option, `pwa-install`, is an unofficial web
component and would mean handing install UI/copy to a third-party dependency
instead of this repo's hand-editable content).

**Direction when picked up:** a small custom hook (listen for
`beforeinstallprompt`, call `.preventDefault()`, store the event, expose a
`promptInstall()` that calls `event.prompt()`) — Android/Chrome only, ~15
lines, no dependency needed. Would need to live in a component (not the
plain-markdown Installation page), likely surfaced as a button in `Nav` or
on the Installation page itself once that page can host interactive
elements again.

## Dance-schedule cards: long wrapping text clips on very short (~30min) sessions

**Found:** 2026-07-26, live-measuring card content height while adding the
GCA-hidden row-compaction feature (`DanceScheduleGrid.tsx`'s
`UNIT_HEIGHT_PX_WITH_GCA`/`UNIT_HEIGHT_PX_WITHOUT_GCA`) — pre-existing,
unrelated to that change itself.

A session short enough to occupy only 2 row units (~30 minutes at the
grid's 15-min/unit granularity) can have a details line (event type +
caller name(s), or a roomless description) long enough to wrap to a second
line — measured live on the real Saturday data, e.g. "GCA Caller Showcase
Dance - Michael Maltenfort" and "Medallion Tip - Vic Ceder" both wrap and
get visibly cut off (`.card`'s `overflow: hidden` clips rather than
growing the card, since row height is fixed by time span, not content).
Confirmed via `contentScrollHeight` measurements exceeding the actual
rendered card height by 13-28px on real cards, and directly visually (a
caller's name cut off mid-word in a screenshot).

**Not related to the "Show GCA callers" toggle specifically** — these
particular overflowing cards don't have GCA data at all, so hiding GCA
doesn't reduce their content; they were already clipping before that
toggle existed. The new GCA-hidden compaction (a smaller shared per-unit
height, since `showGca` is a global toggle) does make this pre-existing
overflow marginally worse in absolute pixels for these specific cards
(measured: 20% worse at an initially-tried 16px/unit, ~10% worse at the
18px/unit value actually shipped) — factored into picking 18 over a more
aggressive 16, but not eliminated.

**Partial mitigation shipped 2026-07-27:** `src/lib/estimateCardFit.ts`'s
`shouldCombinePrimaryAndDetails` (word-wrap simulated via
`src/lib/estimateWrappedLineCount.ts`, real widths measured by
`src/lib/measureTextWidth.ts`'s Canvas 2D `measureText`) estimates whether
a card's level + details (+ GCA) lines will exceed its actual available
height and, if so, combines the level and details text onto one line
instead of two. Live-verified against the real Saturday data: of 57
cards, 16 still overflow and all 16 were correctly flagged and combined
(no false negatives) — combining fully resolved overflow for 1 of them
(e.g. "Medallion Tip - Vic Ceder"), while the remaining 15 (mostly "GCA
Caller Showcase Dance - <name>" cards, whose combined text still needs 3
wrapped lines in a 2-row-unit card) still clip, just by less than before.

**Fix shipped (2026-07-30): the axis is stretched to make room, instead of
clipping.** The remaining cases needed a real design decision (recorded
above as undecided) between growing a card taller than its strict
time-proportional row span, or accepting truncation with a `title`
tooltip. Landed on the former, implemented as the direct expansion
counterpart to this same file's existing elision mechanism (a long
roomless session's excess *empty* time already got compressed *out* of
the axis — see `docs/design/dance-schedule.md`'s "elided from the time
axis itself" decision) — run in reverse: `src/lib/estimateCardFit.ts`'s
`estimateCardFit` now also reports a real `neededHeightPx` (crediting the
combine mitigation first), `src/lib/estimateCardExpansion.ts` turns a
positive deficit into a capped row count (`MAX_EXPANSION_ROWS_PER_SESSION
= 4`, a defensive ceiling, not a "just enough" tuning), and
`computeDanceScheduleTimeAxis.ts`'s `expandDanceScheduleTimeAxis` inserts
those extra rows right after the overflowing placement's own trailing
edge — shifting every later row (and any concurrent placement in another
room/lane sharing that same row) down with it, the same "adjust the axis
itself so every consumer stays self-consistent" property elision already
had. Live-verified against the real Saturday data: both previously-cited
cards ("GCA Caller Showcase Dance - Michael Maltenfort" and the
overlap-lane case below) now render their full text with no clipping.

Two accepted, deliberate consequences of this design (not defects): a
stretch adds harmless shared vertical slack to every other room/lane's
card at that same moment, even ones whose own text already fit fine
(unlike elision, which only ever touches provably-empty time); and no
visual marker renders at a stretch point (unlike elision's zigzag) — an
initial version added one, but it read as too noisy/frequent against real
data (many consecutive short overflowing cards in a row) and was removed,
so a stretched row is currently silent. A session whose deficit exceeds
the per-session cap still clips its residual overflow, same as before
this fix — a strict improvement (less clipping), not a guarantee of zero
clipping in every case.

**Compounded by overlap lanes in the level-columns view (2026-07-28,
covered by the same fix above):** `DanceScheduleLevelGrid.tsx`'s
side-by-side lane rendering (see `docs/design/dance-schedule.md`'s
Overlap lanes decision) halves a card's width whenever it shares a level
at an overlapping time — the same overflow mechanism as above, just
triggered by less horizontal room instead of less vertical room.
Confirmed live: "Ballroom West Skirt Work Hour - Wendy VanderMeulen" in a
2-lane SSD column previously still clipped even after the primary+details
combine heuristic correctly triggered, because the combined text itself
needed more lines than a 75px-wide, 1-hour-tall card had room for — now
resolved the same way, since `computeDanceScheduleLevelLayout.ts` runs
the identical deficit/expansion pass using the lane-aware `textWidthPx`.

**Bug fixed same day:** the lane-split cards were initially rendering
wider than their actual lane (bleeding into the neighboring lane/column)
because `.card` had no `box-sizing: border-box` — an explicit percentage
`width` set content-width only, with padding added on top. Fixed by
adding `box-sizing: border-box` to `.card`/`.roomlessCard`
(`DanceScheduleGrid.module.css`) and correcting the lane-card
`textWidthPx` estimate to divide the column's track width by `laneCount`
before subtracting padding, rather than subtracting the (margin+padding)
overhead before dividing — the two aren't equivalent, and the old formula
overestimated available width, undertriggering the combine heuristic.

**Second bug fixed same day — the room-columns grid's primary label can
itself overflow horizontally:** reported live as "Jarry/Joyce" clipping
in the level-columns view's SSD column. Two compounding gaps, both fixed:
(1) `estimateCardFit.ts`'s `shouldCombinePrimaryAndDetails` hardcoded
`primaryLines` to 1 regardless of the primary text's own length — a safe
assumption for the room-columns grid's primary text (level codes, always
short) but not for the level-columns grid's (room names, sometimes long
enough to wrap on their own, e.g. "Drummond Ballroom") — now estimated via
`estimateWrappedLineCount` the same way `detailsLines` already was. (2)
Even so, "Jarry/Joyce" specifically has no space for the word-wrap
estimate (or the browser's default line-breaking) to break at, so it was
overflowing the card box horizontally and getting silently clipped by
`.card`'s `overflow: hidden` rather than wrapping — `overflow-wrap:
anywhere` added to `.levels`/`.details` so the browser can break
anywhere, including mid-word, when nothing else fits. Note the JS
estimate still can't predict *where* a mid-word break like this lands (it
only reasons about whitespace-delimited words), so a case like this can
still end up needing more vertical space than estimated — falls into the
same already-documented, accepted vertical-overflow category above, just
no longer silently clipped horizontally with no wrap at all.

**The 2026-07-30 axis-stretch fix above was reverted 2026-07-31, deliberately
— vertical clipping is expected to return until real future work lands.**
Live feedback on the sticky time column (see `docs/design/dance-schedule.md`'s
"the axis is not a clock" decision) concluded the whole fixed-height,
linear-time-proportional row model was itself the underlying problem, not
just its overflow edge case — `expandDanceScheduleTimeAxis`/
`estimateCardExpansion.ts` (the expansion mechanism this fix added) only
existed to defend a *proportional* scale's promise that row height ∝ real
duration; once that promise was dropped in favor of an ordinal "one row per
distinct event boundary" axis, there was nothing left for expansion to
defend, so it was deleted rather than adapted. The horizontal-overflow fix
(`overflow-wrap: anywhere`) and the primary+details combine mitigation
(`shouldCombinePrimaryAndDetails`) are both untouched and still active — only
the vertical row-growing mechanism is gone. A short/text-heavy card can once
again clip vertically in the interim. The real fix — rows that grow via
native HTML/CSS sizing (e.g. `grid-auto-rows`/table-like natural height,
matching actual content instead of a JS heuristic guessing at a fixed-height
box) — is explicit, deliberately deferred future work, not done as part of
this change.

**Resolved 2026-07-31 — rows now grow via native CSS sizing, the deferred
fix above.** `DanceScheduleGrid.tsx`/`DanceScheduleLevelGrid.tsx`'s
`gridTemplateRows` changed from a fixed `repeat(N, <px>px)` (live-tuned
constants, `danceScheduleCardSizing.ts`) to `repeat(N, minmax(28px, auto))`
— a row now sizes to whatever content is actually inside it, including
correctly distributing a row-spanning card's height need across the rows it
spans (standard CSS Grid track-sizing behavior, no JS involved). This closes
the vertical-clipping gap for ordinary content; live-verified against real
data (`automated-testing` and `dance-schedule`) with zero clipped cards.

The whole `shouldCombinePrimaryAndDetails`/`estimateCardFit.ts`/
`estimateWrappedLineCount.ts`/`measureTextWidth.ts` combine-onto-one-line
mitigation (and the parallel `roomTextWidthPx`/`levelTextWidthPx` text-width
plumbing) is deleted, not adapted — it only ever existed to dodge a *fixed*
row height, and there's no "will this fit?" decision left to make once a row
grows to match its content.

Growth needed a heuristic ceiling, though: every row is a shared ordinal
tick (`docs/design/dance-schedule.md`'s "the axis is not a clock" decision),
so one pathological card (e.g. a session listing ten callers) growing its
row would force every OTHER card sharing that row — in every other room or
level column — to stretch to match, even though their own content is short.
A `max-height` on the row track itself can't prevent that without
reintroducing clipping (a track's min-content floor wins over its own max in
CSS Grid's sizing algorithm), so the cap lives on the card text instead:
`.levels`/`.details`/`.gca` (`DanceScheduleGrid.module.css`) get a
`-webkit-line-clamp`/`line-clamp` (2/4/2 lines respectively) with
`text-overflow: ellipsis`. An element with `overflow: hidden` reports its
own clamped box height to the grid track sizing algorithm, not its unclamped
content height, so the row never needs to grow past what the clamp allows.
This is strictly better than the old plain `overflow: hidden` clipping it
replaces: a genuinely-too-long line now truncates visibly (a "…"), not
silently mid-line — live-verified with a deliberately pathological
ten-caller test entry (`scripts/edit-test-data.mjs`, reverted after
checking): the card truncated cleanly at 4 lines with a visible ellipsis,
and its row-sharing neighbors stayed their normal short height.

Not unit-tested directly — jsdom (Vitest) doesn't run real CSS layout, so
neither intrinsic row growth nor line-clamp truncation can be asserted by a
unit test; coverage is the live verification above plus a Playwright e2e
test would be the natural next step for durable regression coverage (not
added here — Playwright can't be run from this project's sandbox to
validate it; flagged as a possible follow-up).

## Unstyled "Loading…" flash on a fresh page load

**Found:** 2026-07-31, during a usability review.

`App.tsx`'s route-level `<Suspense fallback={<p>Loading…</p>}>` is plain,
unstyled text — no spinner, no skeleton, not even the page's usual font
sizing. Briefly visible on any *fresh* (non-client-routed) navigation, e.g.
typing a URL directly, a hard refresh, or a first visit — each route's own
code-split chunk has to actually load before its real content can render.
Not visible on ordinary in-app navigation (clicking a nav tab), since the
chunk is normally already cached by then.

**Impact:** cosmetic only — the fallback is accurate and brief (a local dev
chunk load is near-instant; a real deployed build's chunks are small too),
but it looks noticeably rougher than the rest of the app's polish. Worth a
real loading UI (matching the app's own type/color, maybe a simple spinner)
if this turns out to be visible often enough in production to matter —
not fixed here since it's a minor polish item, not a functional bug.
