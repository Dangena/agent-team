import type { AgentRole } from "@agent-team/agent-team-core";

export const PROTOCOL_VERSION = 1;

export type IsoTimestamp = string;
export type EventId = string;
export type SessionId = string;
export type TaskId = string;
export type AgentId = string;

export type BridgeCommand =
  | "inbox"
  | "ack"
  | "event.send"
  | "task.create"
  | "task.assign"
  | "task.start"
  | "task.block"
  | "task.complete"
  | "review.request"
  | "review.report"
  | "approval.approve"
  | "approval.request_changes";

export type AgentTeamEventType =
  | "session.started"
  | "session.paused"
  | "session.resumed"
  | "session.completed"
  | "session.failed"
  | "todo.created"
  | "todo.updated"
  | "task.created"
  | "task.assigned"
  | "task.acknowledged"
  | "task.started"
  | "task.blocked"
  | "task.completed"
  | "review.requested"
  | "review.reported"
  | "approval.granted"
  | "approval.changes_requested"
  | "evidence.diff_captured"
  | "evidence.test_recorded"
  | "human.takeover_started"
  | "human.takeover_ended";

export type AgentDescriptor = {
  agentId: AgentId;
  role: AgentRole;
  cli: string;
  displayName: string;
};

export type TaskScopePayload = {
  paths: string[];
  notes?: string;
};

export type TodoStatus = "pending" | "active" | "blocked" | "completed";

export type TodoCreatedPayload = {
  id: string;
  title: string;
  detail?: string;
  ownerAgentId?: AgentId;
  ownerRole?: AgentRole;
  status: TodoStatus;
  evidenceIds?: string[];
};

export type TodoUpdatedPayload = {
  id: string;
  title?: string;
  detail?: string;
  ownerAgentId?: AgentId;
  ownerRole?: AgentRole;
  status?: TodoStatus;
  evidenceIds?: string[];
};

export type AcceptancePayload = {
  id: string;
  text: string;
  required: boolean;
};

export type TestEvidencePayload = {
  command: string;
  cwd: string;
  exitCode: number | null;
  durationMs?: number;
  logArtifactPath?: string;
  note?: string;
};

export type ReviewFindingPayload = {
  id: string;
  severity: "blocker" | "high" | "medium" | "low";
  title: string;
  file?: string;
  line?: number;
  resolved: boolean;
};

export type SessionStartedPayload = {
  workspacePath: string;
  goal: string;
  agents: AgentDescriptor[];
};

export type SessionLifecyclePayload = {
  reason?: string;
};

export type TaskCreatedPayload = {
  objective: string;
  scope: TaskScopePayload;
  acceptance: AcceptancePayload[];
};

export type TaskAssignedPayload = TaskCreatedPayload & {
  assigneeAgentId: AgentId;
  assigneeRole: Extract<AgentRole, "executor">;
};

export type TaskAcknowledgedPayload = {
  taskId: TaskId;
  accepted: boolean;
  note?: string;
};

export type TaskStartedPayload = {
  taskId: TaskId;
  note?: string;
};

export type TaskBlockedPayload = {
  taskId: TaskId;
  reason: string;
  needsUserInput: boolean;
};

export type TaskCompletedPayload = {
  taskId: TaskId;
  changed: string[];
  tests: TestEvidencePayload[];
  risks: string[];
  summary: string;
};

export type ReviewRequestedPayload = {
  taskId: TaskId;
  reviewerAgentId: AgentId;
  focus: string[];
};

export type ReviewReportedPayload = {
  taskId: TaskId;
  findings: ReviewFindingPayload[];
  testGaps: string[];
  recommendation: "approve" | "request_changes";
};

export type ApprovalGrantedPayload = {
  taskId: TaskId;
  diffViewed: boolean;
  evidenceIds: string[];
  note?: string;
};

export type ApprovalChangesRequestedPayload = {
  taskId: TaskId;
  reasons: string[];
};

export type EvidenceDiffCapturedPayload = {
  taskId?: TaskId;
  baseRef: string;
  headRef: string;
  diffArtifactPath: string;
  summary: string;
};

export type EvidenceTestRecordedPayload = TestEvidencePayload & {
  taskId?: TaskId;
};

export type HumanTakeoverPayload = {
  agentId: AgentId;
  reason?: string;
};

export type EventPayloadByType = {
  "session.started": SessionStartedPayload;
  "session.paused": SessionLifecyclePayload;
  "session.resumed": SessionLifecyclePayload;
  "session.completed": SessionLifecyclePayload;
  "session.failed": SessionLifecyclePayload;
  "todo.created": TodoCreatedPayload;
  "todo.updated": TodoUpdatedPayload;
  "task.created": TaskCreatedPayload;
  "task.assigned": TaskAssignedPayload;
  "task.acknowledged": TaskAcknowledgedPayload;
  "task.started": TaskStartedPayload;
  "task.blocked": TaskBlockedPayload;
  "task.completed": TaskCompletedPayload;
  "review.requested": ReviewRequestedPayload;
  "review.reported": ReviewReportedPayload;
  "approval.granted": ApprovalGrantedPayload;
  "approval.changes_requested": ApprovalChangesRequestedPayload;
  "evidence.diff_captured": EvidenceDiffCapturedPayload;
  "evidence.test_recorded": EvidenceTestRecordedPayload;
  "human.takeover_started": HumanTakeoverPayload;
  "human.takeover_ended": HumanTakeoverPayload;
};

export type EventPayload<TType extends AgentTeamEventType> = EventPayloadByType[TType];

export type EventEnvelope<
  TPayload = unknown,
  TType extends AgentTeamEventType = AgentTeamEventType
> = {
  version: typeof PROTOCOL_VERSION;
  eventId: EventId;
  sessionId: SessionId;
  taskId?: TaskId;
  type: TType;
  fromAgentId: AgentId;
  toAgentId?: AgentId;
  createdAt: IsoTimestamp;
  payload: TPayload;
};

export type TypedEventEnvelope<TType extends AgentTeamEventType> = EventEnvelope<
  EventPayload<TType>,
  TType
>;

export function createEventEnvelope<TType extends AgentTeamEventType>(input: {
  eventId: EventId;
  sessionId: SessionId;
  taskId?: TaskId;
  type: TType;
  fromAgentId: AgentId;
  toAgentId?: AgentId;
  createdAt: IsoTimestamp;
  payload: EventPayload<TType>;
}): TypedEventEnvelope<TType> {
  return {
    version: PROTOCOL_VERSION,
    ...input
  };
}

export type InboxRequestPayload = {
  after?: EventId | null;
};

export type InboxResult = {
  cursor: EventId | null;
  events: EventEnvelope[];
};

export type AckRequestPayload = {
  eventId: EventId;
};

export type EventSendRequestPayload = {
  event: EventEnvelope;
};

export type AckResult = {
  eventId: EventId;
  acked: boolean;
};

export type BridgeAcknowledgement = {
  agentId: AgentId;
  eventId: EventId;
  ackedAt: IsoTimestamp;
};

export type BridgeUiEventStatus = "acked" | "queued" | "waiting";

export type BridgeUiEvent = {
  id: EventId;
  type: AgentTeamEventType;
  from: AgentId;
  to: AgentId | null;
  taskId: TaskId | null;
  status: BridgeUiEventStatus;
  summary: string;
  time: IsoTimestamp | "";
  payload: unknown;
};

export type BridgeRequest<TPayload = unknown> = {
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  token: string;
  agentId: AgentId;
  role: AgentRole;
  command: BridgeCommand;
  payload: TPayload;
};

export type BridgeResponse<TResult = unknown> = {
  requestId: string;
  ok: boolean;
  result?: TResult;
  error?: string;
};

export function createOkResponse<TResult>(
  requestId: string,
  result: TResult
): BridgeResponse<TResult> {
  return {
    requestId,
    ok: true,
    result
  };
}

export function createErrorResponse(requestId: string, error: string): BridgeResponse<never> {
  return {
    requestId,
    ok: false,
    error
  };
}

function bridgeAckKey(agentId: AgentId, eventId: EventId): string {
  return `${agentId}:${eventId}`;
}

function bridgeAckIndex(acks: BridgeAcknowledgement[]): Set<string> {
  return new Set(acks.map((ack) => bridgeAckKey(ack.agentId, ack.eventId)));
}

function bridgeUiEventStatus(
  event: EventEnvelope,
  indexedAcks: Set<string>
): BridgeUiEventStatus {
  if (event.toAgentId && indexedAcks.has(bridgeAckKey(event.toAgentId, event.eventId))) {
    return "acked";
  }

  if (event.toAgentId) {
    return "queued";
  }

  return "waiting";
}

function eventPayloadObject(event: EventEnvelope): Record<string, unknown> {
  return event.payload && typeof event.payload === "object"
    ? (event.payload as Record<string, unknown>)
    : {};
}

function bridgeUiEventSummary(event: EventEnvelope): string {
  const payload = eventPayloadObject(event);

  switch (event.type) {
    case "todo.created":
      return typeof payload.title === "string" && payload.title
        ? `新增 Todo：${payload.title}`
        : "新增 Todo";
    case "todo.updated":
      return typeof payload.title === "string" && payload.title
        ? `更新 Todo：${payload.title}`
        : "更新 Todo";
    case "task.assigned":
      return typeof payload.objective === "string" && payload.objective
        ? `派发任务：${payload.objective}`
        : "任务已派发给 executor";
    case "task.completed":
      return typeof payload.summary === "string" && payload.summary
        ? payload.summary
        : "executor 已提交完成报告";
    case "review.requested":
      return Array.isArray(payload.focus) && payload.focus.length > 0
        ? `请求审查：${payload.focus.join(", ")}`
        : "已请求 reviewer 审查";
    case "review.reported":
      return typeof payload.recommendation === "string" && payload.recommendation
        ? `审查建议：${payload.recommendation}`
        : "reviewer 已提交审查结果";
    case "approval.granted":
      return typeof payload.note === "string" && payload.note ? payload.note : "planner 已批准任务";
    case "approval.changes_requested":
      return Array.isArray(payload.reasons) && payload.reasons.length > 0
        ? `要求修改：${payload.reasons.join("; ")}`
        : "planner 要求修改";
    case "evidence.diff_captured":
      return typeof payload.summary === "string" && payload.summary
        ? payload.summary
        : "Diff 证据已记录";
    case "evidence.test_recorded":
      return typeof payload.command === "string" && payload.command
        ? `测试证据：${payload.command}`
        : "测试证据已记录";
    default:
      return event.type;
  }
}

export function toBridgeUiEvents(
  events: EventEnvelope[],
  acks: BridgeAcknowledgement[] = []
): BridgeUiEvent[] {
  const indexedAcks = bridgeAckIndex(acks);

  return events.map((event) => ({
    id: event.eventId,
    type: event.type,
    from: event.fromAgentId,
    to: event.toAgentId ?? null,
    taskId: event.taskId ?? null,
    status: bridgeUiEventStatus(event, indexedAcks),
    summary: bridgeUiEventSummary(event),
    time: event.createdAt ?? "",
    payload: event.payload
  }));
}
