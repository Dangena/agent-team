import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function createEmptyBridgeStore() {
  return { events: [], acks: [] };
}

export function readBridgeJsonStore(storePath) {
  if (!storePath || !existsSync(storePath)) {
    return createEmptyBridgeStore();
  }

  const store = JSON.parse(readFileSync(storePath, "utf8"));
  return {
    events: Array.isArray(store.events) ? store.events : [],
    acks: Array.isArray(store.acks) ? store.acks : []
  };
}

export function writeBridgeJsonStore(storePath, store) {
  if (!storePath) {
    return;
  }

  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

export function listInboxEvents(store, agentId, after = null) {
  const afterIndex = after ? store.events.findIndex((event) => event.eventId === after) : -1;
  const events = store.events
    .slice(afterIndex + 1)
    .filter((event) => !event.toAgentId || event.toAgentId === agentId);

  return {
    cursor: events.at(-1)?.eventId ?? after,
    events
  };
}

export function appendBridgeEvent(store, event) {
  store.events.push(event);
  return event;
}

export function ackBridgeEvent(store, agentId, eventId, ackedAt = new Date().toISOString()) {
  const existing = store.acks.find((ack) => ack.agentId === agentId && ack.eventId === eventId);
  if (existing) {
    return { acked: true, created: false, ack: existing };
  }

  const ack = { agentId, eventId, ackedAt };
  store.acks.push(ack);
  return { acked: true, created: true, ack };
}
