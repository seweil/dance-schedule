# Managing Claude Code in WebStorm's Terminal

A quick reference for running Claude Code inside WebStorm's Terminal tool
window, especially while multiple subtasks (background agents/forks) are
running at once. Print this, or keep it open in a split pane.

> macOS shortcuts only. Shortcuts can also shift slightly between Claude
> Code versions — if something below doesn't match what you see, type
> `/help` inside Claude Code for the authoritative current list.

---

## 1. WebStorm Terminal tool window — navigating the panel itself

| Action | Shortcut |
|---|---|
| Focus/toggle the Terminal tool window | `Alt+F12` (or `⌘+4` on some keymaps) |
| Search the scrollback buffer | `⌘+F` |
| Jump to top / bottom of scrollback | `Fn+Left` / `Fn+Right`, or `⌘+Home` / `⌘+End` |
| Scroll a screenful at a time | `Fn+Up` / `Fn+Down` (Page Up/Down) |
| Clear visible scrollback (doesn't erase Claude's own history) | `⌘+K` or right-click → Clear Buffer |
| New terminal tab | `+` button, or `⌘+Shift+T` |
| Split the terminal pane | right-click tab → Split Right/Down |
| Return focus to the editor | `Esc` |

**If old turns disappear**: `Settings → Tools → Terminal → Terminal buffer
size` — raise it or set to "Unlimited."

**Running more than one Claude session at once?** Give each its own
terminal *tab* (not just a scrolled-up view of one tab) — one tab per
`claude` process, so you can flip between truly independent conversations
with `⌘+1`…`⌘+9` (or click the tab).

---

## 2. Claude Code keyboard shortcuts (while it's running)

| Key | Effect |
|---|---|
| `Esc` | Interrupt/cancel the current response or tool call |
| `↑` / `↓` | Cycle through your own previous prompts |
| `Tab` | Autocomplete a file path after typing `@` |
| `Shift+Tab` | Cycle the permission mode (see table below) |
| `Ctrl+D` (twice, within 800ms) | Exit the session |
| `/` at the start of a line | Slash commands (`/clear`, `/help`, `/fast`, `/permissions`, `/tasks`, …) |
| `!` at the start of a line | Run a one-off shell command yourself — output lands directly in the conversation |
| `@path/to/file` | Reference a file by path in your message |

Verified against the official keybindings reference (see source at the
bottom) — `Ctrl+C` on its own is *interrupt*, not *exit*; exiting is `Ctrl+D`
alone, pressed twice.

---

## 3. Background tasks & subagents — the actual controls

This is the part most people misremember (there's no single "expand
subtask" key) — these are the real, documented actions:

| Key / command | Effect |
|---|---|
| `/tasks` | Opens the dedicated background-task view — **not** the same as the to-do checklist below |
| `Ctrl+O` | Toggle verbose transcript — expands collapsed tool/subagent output inline instead of the one-line summary |
| `Ctrl+T` | Toggle Claude's to-do checklist (a different thing from `/tasks`, easy to conflate) |
| `Ctrl+B` (or `Ctrl+X Ctrl+B`) | Push the *current* task into the background |
| `Ctrl+X Ctrl+K` | Stop every running background subagent in this session |
| `←`/`→` then `Enter` in the footer | Navigate to and open a footer item (tasks, teams, diff, artifacts) |

---

## 4. Permission modes — what they are, when to use each

Set via `/permissions`, cycled with `Shift+Tab`, or configured as a default
in `.claude/settings.json` (`permissions.defaultMode`).

| Mode | What it does | Best for |
|---|---|---|
| **Plan** | Read-only — can explore/research and write to a plan file, but can't edit code or run non-read-only commands until you approve a plan | Reviewing a big or risky change *before* anything touches disk; auditing/analysis requests like "review X and tell me what's shared" |
| **Default** | Asks permission before anything risky (edits, destructive git commands, sending things) | Normal day-to-day work where you want to stay in the loop on every change |
| **Accept Edits** | Auto-approves file edits, but still confirms the riskiest actions (force-push, deleting branches, etc.) | Once you trust the direction and want background agents/subtasks to keep writing files without a prompt for every single edit |
| **Don't Ask** | Fully autonomous — no prompts at all | Long, tightly-scoped unattended runs (e.g. an overnight `/loop`); use sparingly, only on a task you've scoped narrowly enough to trust unattended |

**Rule of thumb for parallel subtasks specifically:** start a multi-part
task in **Plan** mode so you approve the shape of the work once, then
switch to **Accept Edits** while the actual (possibly parallel) execution
runs, so you're not interrupted by every individual file write across every
subtask.

---

## 5. Managing several subtasks running in parallel

- A background agent (a "fork" or a dispatched sub-agent) doesn't block the
  main conversation — you can keep typing, ask questions, or start another
  task while it runs.
- When a background task finishes, you'll get a **notification** injected
  into the conversation automatically — you don't need to poll or ask "is
  it done yet?" repeatedly.
- Check what's actually running any time with `/tasks`, or expand a
  subagent's own inline output with `Ctrl+O`, rather than guessing.
- If you ask "what's the status of X" before it's finished, the honest
  answer is "still running" — there's no way to peek at partial results
  without waiting for that notification.
- Each subtask's own detailed output stays out of the main conversation by
  design (that's the point of forking/dispatching) — you get a synthesized
  summary when it completes, not a raw transcript dump.
- If something runs away or you no longer need it, `Ctrl+X Ctrl+K` stops
  every background subagent in the session at once.
- If you want two things happening *at once* that are otherwise unrelated
  (not sub-parts of one request), it's cleaner to open a second WebStorm
  terminal tab with its own `claude` process than to force one conversation
  to juggle two unrelated threads of work.
- Avoid rapid-fire `Esc` interrupts while waiting on a background subtask —
  interrupting the *main* session doesn't cancel already-dispatched
  background work, it just stops you from seeing the next update cleanly.

---

## 6. Quick answers to "which mode right now?"

- **About to ask for a big refactor or an audit/review?** → Plan mode.
- **Already mid-implementation, want fewer interruptions?** → Accept Edits.
- **Kicking off a long unattended loop overnight?** → Don't Ask (narrow
  scope only).
- **Everything else, day to day?** → Default.

---

*Sources: [Customize keyboard shortcuts — Claude Code Docs](https://code.claude.com/docs/en/keybindings)*
