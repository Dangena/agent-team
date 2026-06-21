import assert from "node:assert/strict";
import { evaluateApprovalGate } from "../resources/lib/approval-gate.mjs";

const passing = evaluateApprovalGate({
  diffViewed: true,
  completionReport: {
    taskId: "task_gate",
    changed: ["packages/agent-team-core/src/acceptance.ts"],
    tests: [{ command: "node scripts/smoke-test.mjs", cwd: ".", exitCode: 0 }],
    risks: []
  },
  findings: []
});

assert.equal(passing.ok, true);

const blocked = evaluateApprovalGate({
  diffViewed: false,
  completionReport: {
    taskId: "task_gate",
    changed: ["packages/agent-team-core/src/acceptance.ts"],
    tests: [],
    risks: []
  },
  findings: [{ id: "finding_1", severity: "high", title: "Needs fix", resolved: false }]
});

assert.equal(blocked.ok, false);
assert.ok(blocked.reasons.includes("diff has not been viewed"));
assert.ok(blocked.reasons.includes("test evidence or waiver is required"));
assert.ok(blocked.reasons.includes("blocker/high review findings remain unresolved"));

console.log(JSON.stringify({ ok: true, checked: 2 }, null, 2));
