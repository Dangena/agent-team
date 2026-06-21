function ackKey(agentId, eventId) {
  return `${agentId}:${eventId}`;
}

function ackIndex(acks = []) {
  return new Set(acks.map((ack) => ackKey(ack.agentId, ack.eventId)));
}

function eventStatus(event, indexedAcks) {
  if (event.toAgentId && indexedAcks.has(ackKey(event.toAgentId, event.eventId))) {
    return "acked";
  }

  if (event.toAgentId) {
    return "queued";
  }

  return "waiting";
}

function eventSummary(event) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};

  switch (event.type) {
    case "task.assigned":
      return payload.objective ? `派发任务：${payload.objective}` : "任务已派发给 executor";
    case "task.completed":
      return payload.summary || "executor 已提交完成报告";
    case "review.requested":
      return Array.isArray(payload.focus) && payload.focus.length > 0
        ? `请求审查：${payload.focus.join(", ")}`
        : "已请求 reviewer 审查";
    case "review.reported":
      return payload.recommendation ? `审查建议：${payload.recommendation}` : "reviewer 已提交审查结果";
    case "approval.granted":
      return payload.note || "planner 已批准任务";
    case "approval.changes_requested":
      return Array.isArray(payload.reasons) && payload.reasons.length > 0
        ? `要求修改：${payload.reasons.join("; ")}`
        : "planner 要求修改";
    case "evidence.diff_captured":
      return payload.summary || "Diff 证据已记录";
    case "evidence.test_recorded":
      return payload.command ? `测试证据：${payload.command}` : "测试证据已记录";
    default:
      return event.type;
  }
}

export function toBridgeUiEvents(events = [], acks = []) {
  const indexedAcks = ackIndex(acks);

  return events.map((event) => ({
    id: event.eventId,
    type: event.type,
    from: event.fromAgentId,
    to: event.toAgentId || null,
    taskId: event.taskId || null,
    status: eventStatus(event, indexedAcks),
    summary: eventSummary(event),
    time: event.createdAt || ""
  }));
}
