import {
  createErrorResponse,
  createOkResponse,
  type AckRequestPayload,
  type BridgeRequest,
  type BridgeResponse,
  type EventId,
  type EventEnvelope,
  type EventSendRequestPayload,
  type InboxRequestPayload
} from "@agent-team/protocol";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmodSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import * as pty from "node-pty";

export type InboxQuery = {
  agentId: string;
  after?: EventId | null;
};

export type BridgeEventStore = {
  ackEvent(agentId: string, eventId: EventId): boolean;
  appendEvent(event: EventEnvelope): void;
  listAcknowledgements(agentId: string): EventId[];
  listEvents(): EventEnvelope[];
  listInboxEvents(query: InboxQuery): {
    cursor: EventId | null;
    events: EventEnvelope[];
  };
};

export type BridgeRuntime = {
  appendEvent(event: EventEnvelope): void;
  handleRequest(request: BridgeRequest): BridgeResponse;
  listAcknowledgements(agentId: string): string[];
  listEvents(): EventEnvelope[];
};

function roleCanSendEvent(role: BridgeRequest["role"], type: EventEnvelope["type"]): boolean {
  if (role === "planner") {
    return type.startsWith("session.") || type === "task.created" || type === "task.assigned" ||
      type === "review.requested" || type.startsWith("approval.") || type === "evidence.diff_captured";
  }
  if (role === "executor") {
    return type === "task.acknowledged" || type === "task.started" || type === "task.blocked" ||
      type === "task.completed" || type.startsWith("evidence.");
  }
  if (role === "reviewer") return type === "review.reported";
  return false;
}

export function createInMemoryBridgeEventStore(): BridgeEventStore {
  const events: EventEnvelope[] = [];
  const acknowledgements = new Map<string, Set<string>>();

  return {
    ackEvent(agentId, eventId) {
      const agentAcks = acknowledgements.get(agentId) ?? new Set<string>();
      const alreadyAcked = agentAcks.has(eventId);
      agentAcks.add(eventId);
      acknowledgements.set(agentId, agentAcks);
      return !alreadyAcked;
    },
    appendEvent(event) {
      events.push(event);
    },
    listAcknowledgements(agentId) {
      return [...(acknowledgements.get(agentId) ?? new Set<string>())];
    },
    listEvents() {
      return [...events];
    },
    listInboxEvents(query) {
      const afterIndex = query.after
        ? events.findIndex((event) => event.eventId === query.after)
        : -1;
      const visibleEvents = events
        .slice(afterIndex + 1)
        .filter((event) => !event.toAgentId || event.toAgentId === query.agentId);
      return {
        cursor: visibleEvents.at(-1)?.eventId ?? query.after ?? null,
        events: visibleEvents
      };
    }
  };
}

export function createBridgeRuntime(
  expectedToken: string,
  store: BridgeEventStore = createInMemoryBridgeEventStore()
): BridgeRuntime {
  const responses = new Map<string, BridgeResponse>();

  return {
    appendEvent(event) {
      store.appendEvent(event);
    },
    handleRequest(request) {
      const existing = responses.get(request.requestId);
      if (existing) {
        return existing;
      }

      if (request.token !== expectedToken) {
        const response = createErrorResponse(request.requestId, "invalid bridge token");
        responses.set(request.requestId, response);
        return response;
      }

      let response: BridgeResponse;
      if (request.command === "inbox") {
        const payload = request.payload as InboxRequestPayload;
        response = createOkResponse(
          request.requestId,
          store.listInboxEvents({ agentId: request.agentId, after: payload.after ?? null })
        );
      } else if (request.command === "ack") {
        const payload = request.payload as AckRequestPayload;
        if (!payload.eventId) {
          response = createErrorResponse(request.requestId, "ack requires eventId");
        } else {
          const event = store.listEvents().find((item) => item.eventId === payload.eventId);
          if (!event || (event.toAgentId && event.toAgentId !== request.agentId)) {
            response = createErrorResponse(request.requestId, "event is not available to this agent");
          } else {
            store.ackEvent(request.agentId, payload.eventId);
            response = createOkResponse(request.requestId, { eventId: payload.eventId, acked: true });
          }
        }
      } else if (request.command === "event.send") {
        const payload = request.payload as EventSendRequestPayload;
        const event = payload.event;
        if (!event || event.fromAgentId !== request.agentId) {
          response = createErrorResponse(request.requestId, "event sender does not match authenticated agent");
        } else if (!roleCanSendEvent(request.role, event.type)) {
          response = createErrorResponse(request.requestId, `role ${request.role} cannot send ${event.type}`);
        } else if (store.listEvents().some((item) => item.eventId === event.eventId)) {
          response = createOkResponse(request.requestId, { accepted: true, eventId: event.eventId, duplicate: true });
        } else {
          store.appendEvent(event);
          response = createOkResponse(request.requestId, { accepted: true, eventId: event.eventId, duplicate: false });
        }
      } else {
        response = createOkResponse(request.requestId, {
          accepted: true,
          command: request.command
        });
      }
      responses.set(request.requestId, response);
      return response;
    },
    listAcknowledgements(agentId) {
      return store.listAcknowledgements(agentId);
    },
    listEvents() {
      return store.listEvents();
    }
  };
}

export type BridgeTransportServer = {
  endpoint: string;
  start(): Promise<void>;
  close(): Promise<void>;
};

export function createBridgeTransportServer(endpoint: string, runtime: BridgeRuntime): BridgeTransportServer {
  let server: Server | null = null;
  return {
    endpoint,
    start() {
      if (server) return Promise.resolve();
      if (process.platform !== "win32") rmSync(endpoint, { force: true });
      server = createServer((socket) => {
        socket.setEncoding("utf8");
        let buffer = "";
        socket.on("data", (chunk: string) => {
          buffer += chunk;
          if (buffer.length > 64 * 1024) {
            socket.end(`${JSON.stringify(createErrorResponse("unknown", "bridge request exceeds 64 KiB"))}\n`);
            return;
          }
          const newline = buffer.indexOf("\n");
          if (newline < 0) return;
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try {
            const request = JSON.parse(line) as BridgeRequest;
            socket.end(`${JSON.stringify(runtime.handleRequest(request))}\n`);
          } catch (error) {
            const message = error instanceof Error ? error.message : "invalid bridge request";
            socket.end(`${JSON.stringify(createErrorResponse("unknown", message))}\n`);
          }
        });
      });
      return new Promise((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(endpoint, () => {
          server?.removeListener("error", reject);
          if (process.platform !== "win32") chmodSync(endpoint, 0o600);
          resolve();
        });
      });
    },
    close() {
      const active = server;
      server = null;
      if (!active) return Promise.resolve();
      return new Promise((resolve, reject) => {
        active.close((error) => {
          if (process.platform !== "win32") rmSync(endpoint, { force: true });
          if (error) reject(error); else resolve();
        });
      });
    }
  };
}

export function createInMemoryBridgeRuntime(expectedToken: string): BridgeRuntime {
  return createBridgeRuntime(expectedToken, createInMemoryBridgeEventStore());
}

export type AgentProcessStatus = "starting" | "running" | "exited" | "failed";

export type AgentProcessSnapshot = {
  agentId: string;
  pid: number | null;
  status: AgentProcessStatus;
  exitCode: number | null;
};

export type AgentProcessEvent = AgentProcessSnapshot & {
  type: "status" | "output";
  stream?: "stdout" | "stderr";
  data?: string;
};

export type AgentProcessLaunchInput = {
  agentId: string;
  executable: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
};

export type AgentProcessManager = {
  start(input: AgentProcessLaunchInput): AgentProcessSnapshot;
  stop(agentId: string): boolean;
  stopAll(): void;
  list(): AgentProcessSnapshot[];
};

type ManagedProcess = {
  child: ChildProcessWithoutNullStreams;
  snapshot: AgentProcessSnapshot;
};

export function createAgentProcessManager(
  onEvent: (event: AgentProcessEvent) => void
): AgentProcessManager {
  const processes = new Map<string, ManagedProcess>();

  function publish(managed: ManagedProcess, event: Partial<AgentProcessEvent> = {}) {
    onEvent({ ...managed.snapshot, type: "status", ...event });
  }

  return {
    start(input) {
      const existing = processes.get(input.agentId);
      if (existing && (existing.snapshot.status === "starting" || existing.snapshot.status === "running")) {
        return { ...existing.snapshot };
      }

      const child = spawn(input.executable, input.args, {
        cwd: input.cwd,
        env: { ...process.env, ...input.env },
        shell: false,
        windowsHide: true,
        stdio: "pipe"
      });
      const managed: ManagedProcess = {
        child,
        snapshot: { agentId: input.agentId, pid: child.pid ?? null, status: "starting", exitCode: null }
      };
      processes.set(input.agentId, managed);
      publish(managed);

      child.once("spawn", () => {
        managed.snapshot = { ...managed.snapshot, pid: child.pid ?? null, status: "running" };
        publish(managed);
      });
      child.stdout.on("data", (chunk: Buffer) => {
        publish(managed, { type: "output", stream: "stdout", data: chunk.toString("utf8") });
      });
      child.stderr.on("data", (chunk: Buffer) => {
        publish(managed, { type: "output", stream: "stderr", data: chunk.toString("utf8") });
      });
      child.once("error", (error) => {
        managed.snapshot = { ...managed.snapshot, status: "failed" };
        publish(managed, { type: "output", stream: "stderr", data: `${error.message}\n` });
        publish(managed);
      });
      child.once("close", (code) => {
        managed.snapshot = { ...managed.snapshot, status: "exited", exitCode: code };
        publish(managed);
      });

      return { ...managed.snapshot };
    },
    stop(agentId) {
      const managed = processes.get(agentId);
      if (!managed || managed.snapshot.status === "exited") return false;
      return managed.child.kill();
    },
    stopAll() {
      for (const managed of processes.values()) {
        if (managed.snapshot.status === "starting" || managed.snapshot.status === "running") {
          managed.child.kill();
        }
      }
    },
    list() {
      return [...processes.values()].map(({ snapshot }) => ({ ...snapshot }));
    }
  };
}

export type AgentPtySnapshot = {
  agentId: string;
  pid: number;
  status: "running" | "exited" | "failed";
  exitCode: number | null;
  cols: number;
  rows: number;
};

export type AgentPtyEvent = AgentPtySnapshot & {
  type: "status" | "output";
  data?: string;
};

export type AgentPtyLaunchInput = AgentProcessLaunchInput & {
  cols?: number;
  rows?: number;
};

export type AgentPtyManager = {
  start(input: AgentPtyLaunchInput): AgentPtySnapshot;
  write(agentId: string, data: string): boolean;
  resize(agentId: string, cols: number, rows: number): boolean;
  stop(agentId: string): boolean;
  stopAll(): void;
  list(): AgentPtySnapshot[];
};

type ManagedPty = { terminal: pty.IPty; snapshot: AgentPtySnapshot };

export function createAgentPtyManager(onEvent: (event: AgentPtyEvent) => void): AgentPtyManager {
  const processes = new Map<string, ManagedPty>();

  function publish(
    managed: ManagedPty,
    event: Partial<AgentPtyEvent> = {}
  ) {
    onEvent({ ...managed.snapshot, type: "status", ...event });
  }

  return {
    start(input) {
      const existing = processes.get(input.agentId);
      if (existing?.snapshot.status === "running") return { ...existing.snapshot };

      const cols = Math.max(20, Math.min(input.cols ?? 100, 500));
      const rows = Math.max(5, Math.min(input.rows ?? 30, 200));
      const terminal = pty.spawn(input.executable, input.args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd: input.cwd,
        env: { ...process.env, ...input.env }
      });
      const managed: ManagedPty = {
        terminal,
        snapshot: {
          agentId: input.agentId,
          pid: terminal.pid,
          status: "running",
          exitCode: null,
          cols,
          rows
        }
      };
      processes.set(input.agentId, managed);
      publish(managed);

      terminal.onData((data) => publish(managed, { type: "output", data }));
      terminal.onExit(({ exitCode }) => {
        managed.snapshot = { ...managed.snapshot, status: "exited", exitCode };
        publish(managed);
      });
      return { ...managed.snapshot };
    },
    write(agentId, data) {
      const managed = processes.get(agentId);
      if (!managed || managed.snapshot.status !== "running") return false;
      managed.terminal.write(data);
      return true;
    },
    resize(agentId, cols, rows) {
      const managed = processes.get(agentId);
      if (!managed || managed.snapshot.status !== "running") return false;
      const safeCols = Math.max(20, Math.min(Math.floor(cols), 500));
      const safeRows = Math.max(5, Math.min(Math.floor(rows), 200));
      managed.terminal.resize(safeCols, safeRows);
      managed.snapshot = { ...managed.snapshot, cols: safeCols, rows: safeRows };
      publish(managed);
      return true;
    },
    stop(agentId) {
      const managed = processes.get(agentId);
      if (!managed || managed.snapshot.status !== "running") return false;
      managed.terminal.kill();
      return true;
    },
    stopAll() {
      for (const managed of processes.values()) {
        if (managed.snapshot.status === "running") managed.terminal.kill();
      }
    },
    list() {
      return [...processes.values()].map(({ snapshot }) => ({ ...snapshot }));
    }
  };
}
