import test from "node:test";
import assert from "node:assert/strict";
import { EventDedupe } from "./event-dedupe.js";

class Storage {
  constructor() { this.values = new Map(); this.alarmAt = null; this.lock = Promise.resolve(); }
  transaction(callback) {
    const run = this.lock.then(() => callback({
      get: async (key) => this.values.get(key),
      put: async (key, value) => this.values.set(key, structuredClone(value)),
      delete: async (key) => this.values.delete(key),
    }));
    this.lock = run.then(() => undefined, () => undefined);
    return run;
  }
  async setAlarm(value) { this.alarmAt = value; }
  async deleteAlarm() { this.alarmAt = null; }
  async get(key) { return this.values.get(key); }
}
function makeObject() {
  const storage = new Storage();
  return { instance: new EventDedupe({ storage }), storage };
}
const reserve = (instance, claimId = "claim-12345678-1234") =>
  instance.fetch(new Request("https://dedupe.test/reserve", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: "ea-event-1", claim_id: claimId, timestamp: "1794550000" }),
  }));

test("first reservation succeeds and duplicate is rejected", async () => {
  const { instance } = makeObject();
  assert.equal((await reserve(instance)).status, 201);
  assert.equal((await reserve(instance, "claim-87654321-4321")).status, 409);
});
test("concurrent reservation permits exactly one owner", async () => {
  const { instance } = makeObject();
  const responses = await Promise.all([
    reserve(instance, "claim-11111111-1111"),
    reserve(instance, "claim-22222222-2222"),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
});
test("only reservation owner can complete or release", async () => {
  const { instance, storage } = makeObject();
  await reserve(instance);
  const wrong = await instance.fetch(new Request("https://dedupe.test/complete", {
    method: "POST", body: JSON.stringify({ event_id: "ea-event-1", claim_id: "claim-wrong-0000" }),
  }));
  assert.equal(wrong.status, 409);
  const done = await instance.fetch(new Request("https://dedupe.test/complete", {
    method: "POST", body: JSON.stringify({ event_id: "ea-event-1", claim_id: "claim-12345678-1234" }),
  }));
  assert.equal(done.status, 200);
  assert.equal((await storage.get("event_reservation")).status, "complete");
  assert.equal((await reserve(instance, "claim-33333333-3333")).status, 409);
});
test("release allows safe retry after a failed downstream call", async () => {
  const { instance } = makeObject();
  await reserve(instance);
  const released = await instance.fetch(new Request("https://dedupe.test/release", {
    method: "POST", body: JSON.stringify({ event_id: "ea-event-1", claim_id: "claim-12345678-1234" }),
  }));
  assert.equal(released.status, 200);
  assert.equal((await reserve(instance, "claim-33333333-3333")).status, 201);
});
test("malformed reservation is rejected", async () => {
  const { instance } = makeObject();
  const response = await instance.fetch(new Request("https://dedupe.test/reserve", {
    method: "POST", body: JSON.stringify({ event_id: "../bad", claim_id: "short", timestamp: "1" }),
  }));
  assert.equal(response.status, 400);
});
