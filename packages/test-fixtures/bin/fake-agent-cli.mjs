#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const defaultBridgeBin = join(root, "resources", "bin", "agent-team-bridge.mjs");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith("--")) {
    args.set(arg.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true);
  }
}

const role = args.get("role") ?? process.env.AGENT_TEAM_ROLE ?? "observer";
const agentId = process.env.AGENT_TEAM_AGENT_ID ?? `fake-${role}`;
const bridgeBin = args.get("bridge-bin") ?? process.env.AGENT_TEAM_BRIDGE_BIN ?? defaultBridgeBin;

function bridge(commandArgs) {
  return JSON.parse(
    execFileSync(process.execPath, [bridgeBin, ...commandArgs], {
      cwd: root,
      env: {
        ...process.env,
        AGENT_TEAM_AGENT_ID: agentId,
        AGENT_TEAM_ROLE: role
      },
      encoding: "utf8"
    })
  );
}

function send(type, toAgentId, taskId, payload) {
  const commandArgs = ["send", "--type", type];
  if (toAgentId) {
    commandArgs.push("--to", toAgentId);
  }
  if (taskId) {
    commandArgs.push("--task", taskId);
  }
  commandArgs.push("--payload", JSON.stringify(payload));
  return bridge(commandArgs).event;
}

function firstEventOfType(events, type) {
  return events.find((event) => event.type === type);
}

function actAsExecutor() {
  const inbox = bridge(["inbox"]);
  const assigned = firstEventOfType(inbox.events, "task.assigned");
  if (!assigned) {
    return { acted: false, reason: "no task.assigned event" };
  }

  bridge(["ack", assigned.eventId]);
  const completed = send("task.completed", assigned.fromAgentId, assigned.taskId, {
    taskId: assigned.taskId,
    changed: ["packages/protocol/src/index.ts"],
    tests: [{ command: "node scripts/smoke-test.mjs", cwd: root, exitCode: 0 }],
    risks: [],
    summary: `fake executor completed: ${assigned.payload?.objective ?? assigned.taskId}`
  });
  const evidence = send("evidence.test_recorded", assigned.fromAgentId, assigned.taskId, {
    taskId: assigned.taskId,
    command: "node scripts/smoke-test.mjs",
    cwd: root,
    exitCode: 0,
    note: "fake executor recorded smoke test evidence"
  });
  const diffEvidence = send("evidence.diff_captured", assigned.fromAgentId, assigned.taskId, {
    taskId: assigned.taskId,
    baseRef: "HEAD",
    headRef: "WORKTREE",
    diffArtifactPath: ".agent-team/evidence/fake-flow.patch",
    summary: "fake executor captured the task diff"
  });

  return {
    acted: true,
    consumed: assigned.eventId,
    produced: completed.eventId,
    evidence: evidence.eventId,
    diffEvidence: diffEvidence.eventId
  };
}

function actAsReviewer() {
  const inbox = bridge(["inbox"]);
  const request = firstEventOfType(inbox.events, "review.requested");
  if (!request) {
    return { acted: false, reason: "no review.requested event" };
  }

  bridge(["ack", request.eventId]);
  const reported = send("review.reported", request.fromAgentId, request.taskId, {
    taskId: request.taskId,
    findings: [],
    testGaps: [],
    recommendation: "approve"
  });

  return {
    acted: true,
    consumed: request.eventId,
    produced: reported.eventId
  };
}

function actOnce() {
  if (role === "executor") {
    return actAsExecutor();
  }

  if (role === "reviewer") {
    return actAsReviewer();
  }

  return {
    acted: false,
    reason: `role ${role} has no act-once behavior`
  };
}

const ready = {
  type: "fake-agent.ready",
  role,
  agentId,
  bridge: process.env.AGENT_TEAM_SOCKET ?? process.env.AGENT_TEAM_BRIDGE_STORE ?? null
};

if (args.has("act-once")) {
  console.log(JSON.stringify({ ...ready, action: actOnce() }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify(ready, null, 2));

if (!args.has("once")) {
  process.stdin.resume();
}
