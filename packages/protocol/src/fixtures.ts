import { createEventEnvelope } from "./index";

export const protocolFixtureIds = {
  sessionId: "ses_fixture",
  taskId: "task_fixture",
  plannerAgentId: "planner",
  executorAgentId: "executor",
  reviewerAgentId: "reviewer"
} as const;

export const taskAssignedFixture = createEventEnvelope({
  eventId: "evt_task_assigned_fixture",
  sessionId: protocolFixtureIds.sessionId,
  taskId: protocolFixtureIds.taskId,
  type: "task.assigned",
  fromAgentId: protocolFixtureIds.plannerAgentId,
  toAgentId: protocolFixtureIds.executorAgentId,
  createdAt: "2026-06-21T00:00:00.000Z",
  payload: {
    objective: "Implement a deterministic protocol fixture",
    scope: {
      paths: ["packages/protocol/**"],
      notes: "Fixture used by zero-install smoke checks"
    },
    acceptance: [{ id: "acc_fixture", text: "Task can be completed and reviewed", required: true }],
    assigneeAgentId: protocolFixtureIds.executorAgentId,
    assigneeRole: "executor"
  }
});

export const taskCompletedFixture = createEventEnvelope({
  eventId: "evt_task_completed_fixture",
  sessionId: protocolFixtureIds.sessionId,
  taskId: protocolFixtureIds.taskId,
  type: "task.completed",
  fromAgentId: protocolFixtureIds.executorAgentId,
  toAgentId: protocolFixtureIds.plannerAgentId,
  createdAt: "2026-06-21T00:01:00.000Z",
  payload: {
    taskId: protocolFixtureIds.taskId,
    changed: ["packages/protocol/src/index.ts"],
    tests: [{ command: "node scripts/smoke-test.mjs", cwd: ".", exitCode: 0 }],
    risks: [],
    summary: "Fixture task completed"
  }
});

export const reviewReportedFixture = createEventEnvelope({
  eventId: "evt_review_reported_fixture",
  sessionId: protocolFixtureIds.sessionId,
  taskId: protocolFixtureIds.taskId,
  type: "review.reported",
  fromAgentId: protocolFixtureIds.reviewerAgentId,
  toAgentId: protocolFixtureIds.plannerAgentId,
  createdAt: "2026-06-21T00:02:00.000Z",
  payload: {
    taskId: protocolFixtureIds.taskId,
    findings: [],
    testGaps: [],
    recommendation: "approve"
  }
});

export const evidenceDiffCapturedFixture = createEventEnvelope({
  eventId: "evt_evidence_diff_captured_fixture",
  sessionId: protocolFixtureIds.sessionId,
  taskId: protocolFixtureIds.taskId,
  type: "evidence.diff_captured",
  fromAgentId: protocolFixtureIds.executorAgentId,
  toAgentId: protocolFixtureIds.plannerAgentId,
  createdAt: "2026-06-21T00:02:30.000Z",
  payload: {
    taskId: protocolFixtureIds.taskId,
    baseRef: "HEAD~1",
    headRef: "HEAD",
    diffArtifactPath: ".agent-team/sessions/ses_fixture/evidence/diff.patch",
    summary: "Fixture diff captured for planner approval"
  }
});

export const evidenceTestRecordedFixture = createEventEnvelope({
  eventId: "evt_evidence_test_recorded_fixture",
  sessionId: protocolFixtureIds.sessionId,
  taskId: protocolFixtureIds.taskId,
  type: "evidence.test_recorded",
  fromAgentId: protocolFixtureIds.executorAgentId,
  toAgentId: protocolFixtureIds.plannerAgentId,
  createdAt: "2026-06-21T00:02:45.000Z",
  payload: {
    taskId: protocolFixtureIds.taskId,
    command: "node scripts/smoke-test.mjs",
    cwd: ".",
    exitCode: 0,
    note: "Fixture smoke test evidence"
  }
});

export const approvalGrantedFixture = createEventEnvelope({
  eventId: "evt_approval_granted_fixture",
  sessionId: protocolFixtureIds.sessionId,
  taskId: protocolFixtureIds.taskId,
  type: "approval.granted",
  fromAgentId: protocolFixtureIds.plannerAgentId,
  toAgentId: protocolFixtureIds.executorAgentId,
  createdAt: "2026-06-21T00:03:00.000Z",
  payload: {
    taskId: protocolFixtureIds.taskId,
    diffViewed: true,
    evidenceIds: [
      taskCompletedFixture.eventId,
      evidenceDiffCapturedFixture.eventId,
      evidenceTestRecordedFixture.eventId
    ],
    note: "Fixture approved"
  }
});

export const protocolEventFixtures = [
  taskAssignedFixture,
  taskCompletedFixture,
  reviewReportedFixture,
  evidenceDiffCapturedFixture,
  evidenceTestRecordedFixture,
  approvalGrantedFixture
] as const;
