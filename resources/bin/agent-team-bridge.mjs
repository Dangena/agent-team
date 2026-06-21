#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import {
  ackBridgeEvent,
  appendBridgeEvent,
  listInboxEvents,
  readBridgeJsonStore,
  writeBridgeJsonStore
} from "../lib/bridge-json-store.mjs";

const [command = "help", ...args] = process.argv.slice(2);
const sessionId = process.env.AGENT_TEAM_SESSION_ID;
const agentId = process.env.AGENT_TEAM_AGENT_ID;
const role = process.env.AGENT_TEAM_ROLE;
const storePath = process.env.AGENT_TEAM_BRIDGE_STORE;
const socketPath = process.env.AGENT_TEAM_SOCKET;
const token = process.env.AGENT_TEAM_TOKEN;

const usage = {
  commands: [
    "inbox [--after CURSOR]",
    "ack EVENT_ID",
    "send --type EVENT_TYPE [--to AGENT_ID] [--task TASK_ID] [--payload JSON]",
    "task create|assign|start|block|complete",
    "review request|report",
    "approval approve|request-changes"
  ],
  env: [
    "AGENT_TEAM_SESSION_ID",
    "AGENT_TEAM_AGENT_ID",
    "AGENT_TEAM_ROLE",
    "AGENT_TEAM_SOCKET and AGENT_TEAM_TOKEN for desktop transport",
    "AGENT_TEAM_BRIDGE_STORE optional JSON file for zero-install local testing"
  ]
};

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function socketRequest(commandName, payload) {
  if (!socketPath || !token) throw new Error("socket transport requires AGENT_TEAM_SOCKET and AGENT_TEAM_TOKEN");
  const request = {
    requestId: `req_${randomUUID()}`,
    protocolVersion: 1,
    token,
    agentId,
    role,
    command: commandName,
    payload
  };
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => { response += chunk; });
    socket.once("end", () => {
      try { resolve(JSON.parse(response)); } catch (error) { reject(error); }
    });
    socket.once("error", reject);
  });
}

function parseFlags(values) {
  const flags = new Map();
  const positional = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = values[index + 1];
      flags.set(key, next && !next.startsWith("--") ? values[++index] : true);
    } else {
      positional.push(value);
    }
  }

  return { flags, positional };
}

function requireContext() {
  if (!sessionId || !agentId || !role) {
    console.error("agent-team-bridge requires AGENT_TEAM_SESSION_ID, AGENT_TEAM_AGENT_ID, and AGENT_TEAM_ROLE");
    process.exit(2);
  }
}

if (command === "help" || command === "--help" || command === "-h") {
  printJson(usage);
  process.exit(0);
}

requireContext();

if (command === "inbox") {
  const { flags } = parseFlags(args);
  const after = flags.get("after") ?? null;
  if (socketPath) {
    const response = await socketRequest("inbox", { after });
    printJson(response.ok ? { ok: true, sessionId, agentId, ...response.result } : response);
    process.exit(response.ok ? 0 : 2);
  }
  const store = readBridgeJsonStore(storePath);
  const inbox = listInboxEvents(store, agentId, after);

  printJson({
    ok: true,
    sessionId,
    agentId,
    cursor: inbox.cursor,
    events: inbox.events
  });
  process.exit(0);
}

if (command === "ack") {
  const eventId = args[0];
  if (!eventId) {
    printJson({ ok: false, sessionId, agentId, error: "ack requires EVENT_ID" });
    process.exit(2);
  }
  if (socketPath) {
    const response = await socketRequest("ack", { eventId });
    printJson(response.ok ? { ok: true, sessionId, agentId, ...response.result } : response);
    process.exit(response.ok ? 0 : 2);
  }

  const store = readBridgeJsonStore(storePath);
  ackBridgeEvent(store, agentId, eventId);
  writeBridgeJsonStore(storePath, store);

  printJson({ ok: true, sessionId, agentId, eventId, acked: true });
  process.exit(0);
}

if (command === "send") {
  const { flags } = parseFlags(args);
  const type = flags.get("type");
  if (!type) {
    printJson({ ok: false, sessionId, agentId, error: "send requires --type" });
    process.exit(2);
  }

  let payload = {};
  if (flags.has("payload")) {
    payload = JSON.parse(String(flags.get("payload")));
  }

  const event = {
    version: 1,
    eventId: `evt_${randomUUID()}`,
    sessionId,
    taskId: flags.get("task") || undefined,
    type,
    fromAgentId: agentId,
    toAgentId: flags.get("to") || undefined,
    createdAt: new Date().toISOString(),
    payload
  };

  if (socketPath) {
    const response = await socketRequest("event.send", { event });
    printJson(response.ok ? { ok: true, sessionId, agentId, event } : response);
    process.exit(response.ok ? 0 : 2);
  }

  const store = readBridgeJsonStore(storePath);
  appendBridgeEvent(store, event);
  writeBridgeJsonStore(storePath, store);

  printJson({ ok: true, sessionId, agentId, event });
  process.exit(0);
}

printJson({
  ok: true,
  sessionId,
  agentId,
  role,
  command,
  args
});
