# Email forwarding

## Context

The Help page needs a way for attendees to reach the event organizer for
app or event questions, without putting a plain-text email address
somewhere spam scrapers can harvest it (a visible `mailto:` link, or the
address itself as text). Gmail's own forwarding (a throwaway Gmail address
set to forward to a real inbox) was considered but rejected as unreliable.

## Sub-problems

- [x] Where does `help@sqdance.app` actually deliver — see Decisions
- [x] Which AWS region — see Decisions
- [x] How the forwarding target is changed later — see Decisions
- [x] DNS records (MX, domain verification) — see Decisions
- [x] SES sandbox mode — see Decisions

## Decisions

### SES inbound receiving + a small Lambda forwarder, not a GitHub-issue contact form
**Why:** A public form that files GitHub issues was considered too — GitHub
already notifies the repo owner on new issues, so no separate notification
plumbing would be needed. But it requires a public write endpoint (rate
limiting / abuse protection, a scoped PAT to manage) for what's fundamentally
a "forward this email" problem. SES receiving + Lambda is the standard,
well-documented pattern for exactly this, costs pennies at this app's
volume, and needed no new dependency beyond AWS itself (`infra/monitoring.yaml`
already established AWS + CloudFormation as this project's infra platform).

### `infra/email-forwarding.yaml`, a separate stack from `infra/monitoring.yaml`
**Why:** No shared resources between RUM monitoring and email forwarding —
keeping them as separate stacks means either can be redeployed or torn down
independently. Also forced by the region decision below: the two stacks
can't share a region anyway.

### Deployed to `us-east-1`, not `us-east-2` like the monitoring stack
**Why:** SES inbound email *receiving* (as opposed to sending) is only
available in a handful of regions, and `us-east-2` (Ohio) — where
`infra/monitoring.yaml` already lives — isn't one of them. `us-east-1` is a
safe, long-standing choice. Worth double-checking AWS's current
region-support list before changing `REGION` in
`infra/deploy-email-forwarding.sh` if a different region is ever preferred.

### `ForwardToAddress` is a CloudFormation parameter, not hardcoded in the Lambda
**Why:** The recipient is expected to change over time (event organizer
changes, or just a different personal inbox). Keeping it as a stack
parameter means redirecting forwarding is a one-line redeploy —
`./infra/deploy-email-forwarding.sh new-address@example.com` — with no code
change. The Lambda reads it from an environment variable
(`FORWARD_TO`) set from the parameter.

### SES sandbox handled by verifying the forward-to address, not requesting production access
**Why:** New SES accounts start in a sandbox that only allows sending to
*verified* addresses — and forwarding a copy counts as sending. Requesting
full production access is an AWS Support case with unpredictable turnaround,
overkill for a single, low-volume forwarding target. Instead
`deploy-email-forwarding.sh` calls `ses verify-email-identity` for whatever
`ForwardToAddress` currently is (skipping it if already verified), which
just requires clicking a link in a one-time confirmation email — cheap
enough to redo whenever the recipient changes.

### DNS records (MX + 3 DKIM CNAMEs) printed by `deploy-email-forwarding.sh`, added via a separate `add-email-dns-records.sh`
**Why:** Mirrors this project's existing precedent for anything DNS/domain
related — `docs/design/hosting.md`'s "Platform-provided domain first, then
`sqdance.app` added later" decision notes the custom domain itself was
added "purely in the console, zero repo changes." `deploy-email-forwarding.sh`
prints the exact record name/value pairs (pulled from the stack's own
`AWS::SES::EmailIdentity` resource's `DkimDNSTokenName*`/`Value*`
attributes, plus the constructed MX target
`inbound-smtp.<region>.amazonaws.com`) rather than writing them anywhere
itself — deploying the stack shouldn't silently also mutate DNS.
Once `sqdance.app` was confirmed to actually live in Route53 (not every
domain does, even if hosted on Amplify — Amplify's domain UI works against
an external registrar's DNS too), a second, separate script
(`add-email-dns-records.sh`) was added to actually write those records via
`route53 change-resource-record-sets` — kept as its own script, not folded
into `deploy-email-forwarding.sh`, since writing to a live production
domain is a distinct, riskier action than deploying a CloudFormation stack,
and shouldn't run implicitly as a side effect of every redeploy. It refuses
to overwrite an existing, different MX record rather than clobbering it —
an unexpected pre-existing MX on this domain would be worth investigating
by hand rather than silently replacing.

### The Lambda does lightweight regex header rewriting, not a full MIME parser
**Why:** Good enough for a low-volume contact inbox, not meant as a
general-purpose mail relay. It strips the original message's
`DKIM-Signature` (invalid once headers are rewritten — SES re-signs the
outgoing copy with `sqdance.app`'s own DKIM key instead), rewrites `To`
to the forwarding target, and turns the original `From` into a `Reply-To`
so a reply from the recipient's inbox goes back to the original sender —
the same shape as well-known open-source SES-forwarder implementations
(e.g. `arithmetic/aws-lambda-ses-forwarder`), reimplemented inline here
(small enough to fit CloudFormation's inline `ZipFile` size limit) rather
than pulled in as a dependency.

## Open questions

- Should the Help page's contact link actually go live once this is
  deployed and verified, or should this stay infra-only until a specific
  need for it comes up?
