import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bridgeBin = join(root, "resources", "bin", "agent-team-bridge.mjs");
const fakeAgentBin = join(root, "packages", "test-fixtures", "bin", "fake-agent-cli.mjs");
const storePath =
  process.env.AGENT_TEAM_BRIDGE_STORE ??
  join(mkdtempSync(join(tmpdir(), "agent-team-flow-")), "store.json");
const sessionId = process.env.AGENT_TEAM_SESSION_ID ?? "ses_fake_flow";

function envFor(agentId, role) {
  return {
    ...process.env,
    AGENT_TEAM_SESSION_ID: sessionId,
    AGENT_TEAM_AGENT_ID: agentId,
    AGENT_TEAM_ROLE: role,
    AGENT_TEAM_BRIDGE_STORE: storePath
  };
}

function bridge(agentId, role, args) {
  return JSON.parse(
    execFileSync(process.execPath, [bridgeBin, ...args], {
      cwd: root,
      env: envFor(agentId, role),
      encoding: "utf8"
    })
  );
}

function send(agentId, role, args, payload) {
  return bridge(agentId, role, [
    "send",
    ...args,
    "--payload",
    JSON.stringify(payload)
  ]).event;
}

function inbox(agentId, role, after = null) {
  const args = after ? ["inbox", "--after", after] : ["inbox"];
  return bridge(agentId, role, args);
}

function ack(agentId, role, eventId) {
  return bridge(agentId, role, ["ack", eventId]);
}

function runFakeAgent(agentId, role) {
  return JSON.parse(
    execFileSync(process.execPath, [fakeAgentBin, "--role", role, "--act-once"], {
      cwd: root,
      env: envFor(agentId, role),
      encoding: "utf8"
    })
  );
}

const assigned = send(
  "planner",
  "planner",
  ["--type", "task.assigned", "--to", "executor", "--task", "task_flow"],
  {
    objective: "Implement a fake bridge flow",
    scope: { paths: ["packages/**"], notes: "deterministic smoke flow" },
    acceptance: [{ id: "acc_1", text: "executor completes task", required: true }],
    assigneeAgentId: "executor",
    assigneeRole: "executor"
  }
);

const executorAction = runFakeAgent("executor", "executor");
assert.equal(executorAction.action.acted, true);
assert.equal(executorAction.action.consumed, assigned.eventId);
const completedEventId = executorAction.action.produced;
const evidenceEventId = executorAction.action.evidence;
const diffEvidenceEventId = executorAction.action.diffEvidence;

const plannerCompletionInbox = inbox("planner", "planner");
const completed = plannerCompletionInbox.events.find((event) => event.eventId === completedEventId);
assert.ok(completed);
ack("planner", "planner", completed.eventId);
const evidence = plannerCompletionInbox.events.find((event) => event.eventId === evidenceEventId);
assert.ok(evidence);
ack("planner", "planner", evidence.eventId);
const diffEvidence = plannerCompletionInbox.events.find((event) => event.eventId === diffEvidenceEventId);
assert.ok(diffEvidence);
ack("planner", "planner", diffEvidence.eventId);

const reviewRequested = send(
  "planner",
  "planner",
  ["--type", "review.requested", "--to", "reviewer", "--task", "task_flow"],
  {
    taskId: "task_flow",
    reviewerAgentId: "reviewer",
    focus: ["protocol", "bridge"]
  }
);

const reviewerAction = runFakeAgent("reviewer", "reviewer");
assert.equal(reviewerAction.action.acted, true);
assert.equal(reviewerAction.action.consumed, reviewRequested.eventId);
const reviewReportedEventId = reviewerAction.action.produced;

const plannerReviewInbox = inbox("planner", "planner", completed.eventId);
const reviewReported = plannerReviewInbox.events.find((event) => event.eventId === reviewReportedEventId);
assert.ok(reviewReported);
ack("planner", "planner", reviewReported.eventId);

const approval = send(
  "planner",
  "planner",
  ["--type", "approval.granted", "--to", "executor", "--task", "task_flow"],
  {
    taskId: "task_flow",
    diffViewed: true,
    evidenceIds: [completed.eventId, evidence.eventId, diffEvidence.eventId],
    note: "fake flow approved"
  }
);

const store = JSON.parse(readFileSync(storePath, "utf8"));
assert.equal(store.events.length, 7);
assert.equal(store.acks.length, 6);

console.log(
  JSON.stringify(
    {
      ok: true,
      sessionId,
      storePath,
      eventCount: store.events.length,
      ackCount: store.acks.length,
      finalEvent: approval.eventId
    },
    null,
    2
  )
);
