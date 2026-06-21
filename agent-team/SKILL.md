---
name: agent-team
description: Coordinate local coding agents as a role-based team using Codex, Claude Code, MiMo Code, OpenCode, or generic CLI tools. Use when starting or improving the Agent Team workflow, assigning planner/executor/reviewer roles, exchanging task/review messages through a smux/tmux bridge, verifying diffs and tests before approval, or adapting this workflow into a desktop app with structured Bridge communication.
---

# Agent Team

Use this skill to run or adapt a local multi-agent coding workflow. Treat the current shell
scripts as the tmux implementation of the Agent Team protocol; preserve the protocol ideas when
building other hosts such as a desktop app.

## Core Contract

- Separate CLI identity from role. Codex, Claude Code, MiMo Code, OpenCode, or a generic CLI can
  be assigned as planner, executor, reviewer, or observer when the host supports it.
- Keep one active planner responsible for decomposition, assignment, review routing, and final
  acceptance.
- Keep one executor for a shared working tree unless each executor has an isolated Git worktree.
- Keep reviewers read-only by default. Reviewers can recommend approval or changes, but do not
  provide final acceptance.
- Require real evidence before approval: inspect the diff, run or record tests, and close or waive
  high-severity findings.
- Do not bypass CLI permission prompts, auto-confirm destructive operations, or store model
  account credentials.

## Existing tmux Workflow

The repo includes a runnable tmux version:

- `bin/agent-team`: session manager for start, task, add-mimo, attach, status, and stop.
- `bin/agent-team-role`: role launcher that injects the prompt for Codex, Claude, or MiMo.
- `bin/tmux-bridge`: vendored smux-style bridge for pane discovery, read guards, typing, and keys.
- `prompts/`: role prompts for planner, executor, and reviewer.

Prefer `agent-team start "<task>"` for the default two-agent session. Add MiMo only when a separate
reviewer is useful.

## Bridge Rules

Use the bridge command name provided by the repo, `tmux-bridge`. If a user says "smux-bridge",
treat that as the smux-style bridge concept unless they provide a different executable.

Always read a target pane before sending input:

```bash
tmux-bridge read claude 30
tmux-bridge message claude 'TASK task-001 ...'
tmux-bridge read claude 30
tmux-bridge keys claude Enter
```

Do not poll another agent's pane. Send a clear task or review request, then wait for that agent to
reply through the bridge.

## Task Messages

Send executor work as:

```text
TASK task-NNN
OBJECTIVE <single objective>
SCOPE <allowed files or behavior>
ACCEPTANCE <verifiable criteria>
RETURN <required summary, tests, risks>
```

Executor completion must include changed behavior, test command/results, and known risks. Reviewer
results must include findings by severity, test gaps, and `APPROVE` or `CHANGES_REQUIRED`.

## Desktop Adaptation

When adapting Agent Team into a desktop app:

- Keep the Agent Team protocol as the product core, but do not bind the app to tmux panes.
- Use a structured Desktop Bridge for inbox, send, ack, task, review, approval, evidence, and audit
  events. Use smux/tmux bridge compatibility only as an adapter layer.
- Show real terminals for transparency and human takeover, but do not parse ANSI terminal text as
  the source of task state.
- Store event, task, delivery, evidence, and audit records in a local append-only model so a session
  can be replayed after crashes.
- Let the user add workspaces on the left and add role-bound agent windows on the right. The same
  CLI can be used for different roles when the adapter and permissions allow it.
- Gate final approval on diff review, test evidence or waiver, and unresolved high-severity review
  findings.

## Safety Checks

Before reporting success to the user:

1. Inspect the actual repository diff.
2. Confirm required tests ran, or record why they could not run.
3. Confirm the executor stayed within scope.
4. Confirm reviewer findings were fixed, downgraded with evidence, or explicitly waived by the user.
5. Report remaining risks plainly.
