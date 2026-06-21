import { describe, expect, it } from "vitest";
import { evaluateApprovalGate } from "./acceptance";
import { assertSingleExecutor, ROLE_CONTRACTS } from "./roles";
import { assertTaskTransition, canTransitionTask } from "./state-machine";

describe("agent team core constraints", () => {
  it("enforces task transitions and role authority", () => {
    expect(canTransitionTask("assigned", "acknowledged")).toBe(true);
    expect(canTransitionTask("assigned", "approved")).toBe(false);
    expect(() => assertTaskTransition("approved", "in_progress")).toThrow(/invalid task transition/);
    expect(() => assertSingleExecutor(["executor", "planner", "executor"])).toThrow(/one executor/);
    expect(ROLE_CONTRACTS.reviewer.canWriteWorkspace).toBe(false);
    expect(ROLE_CONTRACTS.reviewer.canApproveTasks).toBe(false);
  });

  it("blocks approval without diff, evidence, or resolved severe findings", () => {
    const blocked = evaluateApprovalGate({
      diffViewed: false,
      completionReport: { taskId: "task", changed: ["src/a.ts"], tests: [], risks: [] },
      findings: [{ id: "finding", severity: "high", title: "unsafe", resolved: false }]
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reasons).toHaveLength(3);

    const allowed = evaluateApprovalGate({
      diffViewed: true,
      completionReport: { taskId: "task", changed: ["src/a.ts"], tests: [], risks: [] },
      findings: [{ id: "finding", severity: "high", title: "accepted", resolved: false }],
      waiverReason: "user accepted preview risk"
    });
    expect(allowed.ok).toBe(true);
  });
});
