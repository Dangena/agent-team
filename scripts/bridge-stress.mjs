import assert from "node:assert/strict";
import { ackBridgeEvent, appendBridgeEvent, createEmptyBridgeStore, listInboxEvents } from "../resources/lib/bridge-json-store.mjs";

const store = createEmptyBridgeStore();
for (let index = 0; index < 100; index += 1) {
  appendBridgeEvent(store, {
    version: 1,
    eventId: `evt_stress_${String(index).padStart(3, "0")}`,
    sessionId: "ses_stress",
    type: "task.created",
    fromAgentId: "planner",
    toAgentId: "executor",
    createdAt: new Date(Date.UTC(2026, 5, 21, 0, 0, index)).toISOString(),
    payload: { index }
  });
}

const full = listInboxEvents(store, "executor");
assert.equal(full.events.length, 100);
assert.deepEqual(full.events.map((event) => event.payload.index), Array.from({ length: 100 }, (_, index) => index));
assert.equal(full.cursor, "evt_stress_099");

const replay = listInboxEvents(store, "executor", "evt_stress_049");
assert.equal(replay.events.length, 50);
assert.equal(replay.events[0].eventId, "evt_stress_050");

for (const event of full.events) {
  assert.equal(ackBridgeEvent(store, "executor", event.eventId).created, true);
  assert.equal(ackBridgeEvent(store, "executor", event.eventId).created, false);
}
assert.equal(store.acks.length, 100);

console.log(JSON.stringify({ ok: true, eventCount: store.events.length, ackCount: store.acks.length }));
