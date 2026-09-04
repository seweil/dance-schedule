# Mailto diagnostics (build/client info on "Email us" links)

## Context

Every content page's `mailto:` link (e.g. `[Email us](mailto:help@sqdance.app)`
in `content/MotivateToSeattle/pages/25 help.md`) automatically gets a
build/client diagnostics block folded into its body, so someone reporting a
problem doesn't have to separately dig up and paste in which build/browser/
state they were on — see `src/lib/mailtoDiagnostics.ts` and `App.tsx`'s
`MdxA` override. A companion `mailto_link_clicked` CloudWatch RUM custom
event on the same click is covered in `docs/design/monitoring.md`, not here.

This doc covers a real bug found shortly after that feature shipped: on
**macOS, Chrome specifically**, the diagnostics never showed up in Mail.app's
compose window — the body was completely empty, only the recipient
populated.

## Sub-problems

- [x] Root cause — see Decisions
- [x] What to actually do about it, given no clean single fix exists — see
      Decisions

## Decisions

### Root cause: an undocumented body-length cutoff in Chrome's own macOS mailto handoff, not a content/encoding bug
**Why/how found:** Direct report — "From Macos Chrome, the help links don't
populate tech details in Mac Mail." Diagnosed by elimination, testing
locally via `pnpm dev` (this feature has no PWA/service-worker dependency,
so no need to wait on a real deploy for each round):

1. **Two content-level hypotheses looked plausible at first and were
   fixed regardless, but neither was the actual cause:**
   - macOS/iOS Mail (14.6+) has a confirmed Apple bug where a mailto:
     body's `%0D%0A` sequences render as the literal text `<BR>` instead
     of a real line break (Apple's own explanation: rich-content support
     was stripped from mailto handling as a security fix). The reported
     symptom was a **completely empty** body, not garbled `<BR>` text, so
     this didn't match — but it's real and independently worth avoiding,
     so `\n` (not `\r\n`) was kept anyway.
   - Mail.app's mailto parsing has a documented history of choking on
     non-ASCII bytes (RFC 6068 examples assume us-ascii). The diagnostics
     block's `·` separator was swapped for `-` defensively. (Later
     reverted — see the next Decision — once this turned out not to
     matter either.)
2. **The decisive test: cross-browser/cross-platform comparison.** The
   exact same (long, undiminished) link populated correctly in Safari and
   Firefox on the same Mac, and in Chrome on iOS and Android (emulator).
   Only macOS desktop Chrome failed. This ruled out the mailto body's
   *content* as the cause entirely — whatever was wrong was specific to
   one browser's one platform's handoff mechanism.
3. **Ruled out "Chrome never passes body at all" categorically**: a
   minimal test link (`mailto:test@example.com?body=hello%20world`)
   pasted directly into Chrome's address bar worked fine. So it wasn't a
   blanket Chrome bug — something about the *amount* of content mattered.
4. **Binary search, live, directly against Chrome's own address bar** —
   generating test mailto: links with a known encoded body length (filler
   `X` characters, not real diagnostics text, to isolate length from
   content) and testing each one by hand:

   | Encoded body length | Result |
   | --- | --- |
   | 136 | worked |
   | 284 | worked |
   | 358 | worked |
   | 395 | worked |
   | 432 (the original full diagnostics block, unmodified) | **failed** |

   Bisected the cutoff to somewhere in **(395, 432]** characters, on this
   one browser/OS/mail-client combination. Not narrowed further — once it
   became clear this doesn't change what to actually build (see next
   Decision), more precision stopped being worth the manual testing time.
5. **No documented number exists to design against.** Checked directly:
   - Chromium's own source — `external_protocol_handler.cc` (cross-
     platform mailto handling) and `platform_util_mac.mm` (the macOS-
     specific code that calls `[NSWorkspace sharedWorkspace] openURL:...]`)
     — neither has any length check or truncation logic. Chrome hands the
     URL straight to Apple's own API unmodified.
   - Apple's NSWorkspace/NSURL docs publish no length limit for this path
     either.
   - Generic mailto compatibility guides commonly cite 2046–2083
     characters as "the" limit — those all trace back to the old Internet
     Explorer URL-length cap and don't match what was actually observed
     here (a failure at 432, an order of magnitude below those figures).
     Whatever's failing is happening inside Mail.app/Launch Services
     itself, undocumented.

### Keep full diagnostics richness — don't permanently trim content to duck under an unknown, narrowly-scoped limit
**Why:** First attempt (before the cross-platform comparison above fully
landed) trimmed the block hard — dropped the full `navigator.userAgent`
(the single biggest line) and a descriptive intro sentence, reasoning the
user agent was redundant with the `mailto_link_clicked` RUM event anyway.
That worked, but **per direct product decision, was reverted**: since
every other real platform (Safari/Firefox on the same Mac, Chrome on iOS
and Android) already handles the full, richer version correctly, this is
narrowly a macOS-desktop-Chrome quirk — degrading the report for every
*other* platform to work around one browser's one-OS bug isn't the right
trade. `navigator.userAgent` and the `·` separator (see the reverted
non-ASCII theory above) both came back.

**What was kept from the trimming pass, and why each survives on its own
merits, independent of the length question:**
- `\n` instead of `\r\n` — the separate, real, independently-confirmed
  Apple Mail `<BR>` bug above.
- The intro sentence shortened from "If you are reporting a technical
  problem, these details will help us diagnose" to just `Details:` — a
  content simplification worth doing regardless of the Chrome bug.

**Turned out to be enough on its own, measured after the fact — not by
deliberate design:**

```
old (long intro, \r\n):  424 encoded characters — in the failing zone
new (short intro, \n):   310 encoded characters — well under the 395 ceiling
```

The savings: shortening the intro sentence accounts for most of it; `\n`
vs `\r\n` saves 3 encoded characters per line break (`%0A` vs `%0D%0A`) ×
7 line breaks ≈ 21 characters. Confirmed live afterward — the reported
bug is fixed. This leaves real headroom (310 vs. the 395 ceiling) for a
longer page URL or build string before risking the failing zone again,
but **no code enforces that budget** — see Open questions.

## Open questions

- **Nothing currently guards against the diagnostics block silently
  growing back past ~395 encoded characters** (e.g., a future field added
  to the block, or a much longer page URL on some route). There's no
  regression test pinning a length budget — a deliberate choice at the
  time (the exact threshold isn't ours to control or fully know, and an
  arbitrary test ceiling felt like false precision), but worth
  reconsidering if this regresses again.
- The (395, 432] gap was never narrowed further, and the failure was
  never root-caused inside Mail.app/Launch Services itself (no access to
  Apple's closed-source implementation) — if this resurfaces on a
  different macOS/Chrome version pairing, the threshold may have moved.
