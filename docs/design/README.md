# Design docs

This directory holds living design documents for significant architectural
work — the kind of decision that's expensive to re-litigate or re-derive
later, and that future contributors (human or Claude) will want the
reasoning behind, not just the outcome.

## Convention

One file per topic: `docs/design/<topic-slug>.md`. Each doc has four
sections, in this order:

1. **Context** — the problem or goal driving this design, and why now.
2. **Sub-problems** — a checklist of the distinct questions that need
   answers before the design is complete, written up front as an outline:
   - `[ ]` open
   - `[x]` decided — link to the Decisions entry that resolved it
3. **Decisions** — one entry per resolved sub-problem: the decision itself,
   a short **Why** (rationale, and alternatives considered and rejected),
   and the date.
4. **Open questions** — anything raised but deliberately deferred, so it
   doesn't get silently dropped.

Update the doc live during the conversation that produces it, not after the
fact. As soon as a sub-problem is resolved, move it from the checklist into
a Decisions entry — don't let decisions pile up unwritten.

Within a single working session, mirror the sub-problem checklist in the
TaskCreate/TaskList tool so progress is visible turn-to-turn. The markdown
doc is the persistent source of truth once the session ends; the task list
is just the in-session view of the same checklist.
