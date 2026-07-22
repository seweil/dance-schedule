#!/usr/bin/env python3
"""PreToolUse hook: deny Write/Edit/NotebookEdit/Bash operations that touch
paths outside this project directory.

For Write/Edit/NotebookEdit this is a hard guarantee — those tools report a
single, unambiguous file_path field.

For Bash it is a best-effort heuristic only, NOT a hard guarantee: shell
commands are effectively unbounded (variables, `cd`, `eval`, symlinks,
downloaded scripts) and can reference paths in ways no regex can fully catch.
This blocks the common/obvious cases (an absolute path or ~-path outside the
project appearing directly in the command) but a determined or convoluted
command can still slip through. For a real enforced boundary on Bash, use
Claude Code's sandbox filesystem settings instead.
"""
import json
import os
import re
import sys

PROJECT_ROOT = os.path.realpath(os.getcwd())


def deny(reason):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    sys.exit(0)


def is_inside_project(path):
    candidate = path if os.path.isabs(path) else os.path.join(PROJECT_ROOT, path)
    real = os.path.realpath(candidate)
    return real == PROJECT_ROOT or real.startswith(PROJECT_ROOT + os.sep)


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    tool_name = payload.get("tool_name")
    tool_input = payload.get("tool_input") or {}

    paths = []

    if tool_name in ("Write", "Edit", "NotebookEdit"):
        file_path = tool_input.get("file_path") or tool_input.get("notebook_path")
        if file_path:
            paths.append(file_path)
    elif tool_name == "Bash":
        command = tool_input.get("command", "")
        # ':' is excluded from the lookbehind so "https://host/path" (and other
        # scheme://... URLs) aren't misread as an absolute filesystem path.
        for match in re.findall(r"(?<![\w./:-])(/[\w./-]+|~[\w./-]*)", command):
            paths.append(os.path.expanduser(match))

    for path in paths:
        if not is_inside_project(path):
            deny(
                f"Path '{path}' resolves outside the project directory "
                f"({PROJECT_ROOT}). Tool access is restricted to files within "
                f"the project."
            )

    sys.exit(0)


if __name__ == "__main__":
    main()
