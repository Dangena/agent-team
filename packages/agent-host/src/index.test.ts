import { describe, expect, it } from "vitest";
import { createConnection } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAgentProcessManager,
  createBridgeRuntime,
  createBridgeTransportServer,
  type AgentProcessEvent
} from "./index";
import type { BridgeRequest, BridgeResponse, EventEnvelope } from "@agent-team/protocol";

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for agent process event");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("createAgentProcessManager", () => {
  it("streams output and stops a managed child process", async () => {
    const events: AgentProcessEvent[] = [];
    const manager = createAgentProcessManager((event) => events.push(event));

    const started = manager.start({
      agentId: "test-executor",
      executable: process.execPath,
      args: ["-e", "console.log('agent-ready'); setInterval(() => {}, 1000)"],
      cwd: process.cwd()
    });

    expect(started.status).toBe("starting");
    await waitFor(() => events.some((event) => event.status === "running"));
    await waitFor(() => events.some((event) => event.type === "output" && event.data?.includes("agent-ready")));
    expect(manager.list()).toMatchObject([{ agentId: "test-executor", status: "running" }]);

    expect(manager.stop("test-executor")).toBe(true);
    await waitFor(() => events.some((event) => event.status === "exited"));
    expect(manager.list()).toMatchObject([{ agentId: "test-executor", status: "exited" }]);
  });
});

function sendBridgeRequest(endpoint: string, request: BridgeRequest): Promise<BridgeResponse> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint);
    let response = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => { response += chunk; });
    socket.once("end", () => resolve(JSON.parse(response) as BridgeResponse));
    socket.once("error", reject);
  });
}

describe("bridge transport server", () => {
  it("authenticates, authorizes, delivers and acknowledges events", async () => {
    const token = "test-token";
    const runtime = createBridgeRuntime(token);
    const endpoint = process.platform === "win32"
      ? `\\\\.\\pipe\\agent-team-test-${process.pid}`
      : join(tmpdir(), `agent-team-test-${process.pid}.sock`);
    const server = createBridgeTransportServer(endpoint, runtime);
    await server.start();

    const event: EventEnvelope = {
      version: 1,
      eventId: "evt_socket",
      sessionId: "ses_socket",
      taskId: "task_socket",
      type: "task.assigned",
      fromAgentId: "planner",
      toAgentId: "executor",
      createdAt: new Date().toISOString(),
      payload: { objective: "socket test" }
    };
    const base = { protocolVersion: 1 as const, token, payload: {} };
    const sent = await sendBridgeRequest(endpoint, {
      ...base, requestId: "req_send", agentId: "planner", role: "planner",
      command: "event.send", payload: { event }
    });
    expect(sent.ok).toBe(true);

    const inbox = await sendBridgeRequest(endpoint, {
      ...base, requestId: "req_inbox", agentId: "executor", role: "executor",
      command: "inbox", payload: { after: null }
    });
    expect(inbox).toMatchObject({ ok: true, result: { events: [{ eventId: "evt_socket" }] } });

    const ack = await sendBridgeRequest(endpoint, {
      ...base, requestId: "req_ack", agentId: "executor", role: "executor",
      command: "ack", payload: { eventId: "evt_socket" }
    });
    expect(ack.ok).toBe(true);

    const unauthorized = await sendBridgeRequest(endpoint, {
      ...base, requestId: "req_bad_role", agentId: "reviewer", role: "reviewer",
      command: "event.send", payload: { event: { ...event, eventId: "evt_bad", fromAgentId: "reviewer", type: "approval.granted" } }
    });
    expect(unauthorized).toMatchObject({ ok: false, error: expect.stringMatching(/cannot send/) });

    const invalidToken = await sendBridgeRequest(endpoint, {
      ...base, token: "wrong", requestId: "req_bad_token", agentId: "executor", role: "executor",
      command: "inbox", payload: {}
    });
    expect(invalidToken).toMatchObject({ ok: false, error: "invalid bridge token" });
    await server.close();
  });
});
