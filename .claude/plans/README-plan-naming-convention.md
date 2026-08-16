# Plan file naming convention

This note exists because, in the session that wrote it (2026-08-16), the
sandbox's writable project directory was pinned to `.claude/plans/` only
— every attempt to write the real cross-session memory file at
`~/.claude/projects/-Users-sweil-projects-dance-schedule/memory/` failed,
even from a fresh subagent, and even a plain write to the repo root
failed the same way. Committing this note into `.claude/plans/` itself
(confirmed git-tracked, not gitignored) was the only durable persistence
available that session. **If you're reading this in a session that CAN
write to the memory directory or to `CLAUDE.md`, please move this
convention there instead** (as a `feedback`-type memory, or a short
CLAUDE.md note) and delete this file — it doesn't need to keep living
here once a normal write path is available.

## The actual convention

When Plan Mode writes a plan file, the harness auto-assigns a path like
`.claude/plans/wobbly-wishing-lollipop.md` (random-word slug, no date).
Rename these to `YY-MM-DD-descriptive-title.md` — e.g.
`26-08-16-cloudwatch-dashboard-revamp.md` — derived from the plan's own
H1 heading, kebab-cased. Two-digit year first so filenames sort
chronologically in a plain directory listing.

**Why:** the random-word names give no signal about when a plan was
written or what it covers, making the growing `.claude/plans/` directory
hard to scan. A date+title prefix fixes both at once.

**How to apply:** after writing (or finishing edits to) a plan file
during the Plan Mode workflow, rename it with `mv` to this format, before
or after calling `ExitPlanMode` — the harness-assigned name is just a
starting point, not the final filename. Applies to every future plan
file in this project. The batch of 10 pre-existing files was renamed and
committed on 2026-08-16.
