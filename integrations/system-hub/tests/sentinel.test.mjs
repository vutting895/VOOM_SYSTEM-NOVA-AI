import test from "node:test";
import assert from "node:assert/strict";
import {
  SENTINEL_POLICY_VERSION,
  SENTINEL_RETENTION_MS,
  SentinelState,
  assessSentinelThreat,
  callSentinel
} from "../sentinel.js";

function events(event, actorType, count, at = Date.now()) {
  return Array.from({ length: count }, (_, index) => ({
    event, actorType, at: at - index * 1000
  }));
}

test("policy detects repeated invalid sessions with a short cooldown", () => {
  const result = assessSentinelThreat(
    events("invalid_or_expired_session", "ip", 15),
    "ip"
  );
  assert.equal(result.detected, true);
  assert.equal(result.pattern, "credential_spray");
  assert.equal(result.cooldownMs, 60_000);
  assert.equal(result.policyVersion, SENTINEL_POLICY_VERSION);
});

test("policy detects origin probing and user-scoped resource enumeration", () => {
  assert.equal(
    assessSentinelThreat(events("origin_rejected", "ip", 8), "ip").pattern,
    "origin_probing"
  );
  assert.equal(
    assessSentinelThreat(events("resource_not_found", "user", 10), "user").pattern,
    "resource_enumeration"
  );
  assert.equal(
    assessSentinelThreat(events("invalid_resource_id", "user", 8), "user").pattern,
    "malformed_resource_probing"
  );
});

test("policy correlates mixed low-frequency reconnaissance without cross-actor mixing", () => {
  const now = Date.now();
  const mixed = [
    ...events("origin_rejected", "ip", 4, now),
    ...events("invalid_or_expired_session", "ip", 7, now - 100)
  ];
  assert.equal(assessSentinelThreat(mixed, "ip").pattern, "mixed_reconnaissance");
  assert.equal(assessSentinelThreat(mixed, "user").detected, false);
});

test("events outside the window and future-dated events do not trigger a rule", () => {
  const now = Date.now();
  const stale = Array.from({ length: 20 }, (_, index) => ({
    event: "origin_rejected", actorType: "ip", at: now - 3 * 60_000 - index
  }));
  stale.push({ event: "origin_rejected", actorType: "ip", at: now + 60_000 });
  assert.equal(assessSentinelThreat(stale, "ip", now).detected, false);
});

test("sentinel stays inert when explicitly disabled", async () => {
  const result = await callSentinel({ SENTINEL_ENABLED: "false" }, "ip", "192.0.2.1", "check");
  assert.deepEqual(result, { enabled: false, ready: true, blocked: false });
});

test("enabled sentinel fails closed when its secret or state binding is missing", async () => {
  const result = await callSentinel({ SENTINEL_ENABLED: "true" }, "ip", "192.0.2.1", "check");
  assert.deepEqual(result, { enabled: true, ready: false, blocked: false });
});

class MemoryStorage {
  constructor() { this.value = undefined; this.alarmAt = 0; }
  async transaction(callback) {
    const tx = {
      get: async (key) => key === "state" ? structuredClone(this.value) : undefined,
      put: async (key, value) => { if (key === "state") this.value = structuredClone(value); }
    };
    return callback(tx);
  }
  async setAlarm(at) { this.alarmAt = at; }
  async deleteAll() { this.value = undefined; this.alarmAt = 0; }
}
function context() {
  const storage = new MemoryStorage();
  return {
    storage,
    blockConcurrencyWhile: async (callback) => callback()
  };
}

test("Durable Object stores only bounded event classes and locks the same actor at threshold", async () => {
  const ctx = context();
  const actor = new SentinelState(ctx, {});
  for (let i = 0; i < 14; i++) {
    const result = await actor.fetch(new Request("https://sentinel.internal/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorType: "ip", event: "invalid_or_expired_session" })
    }));
    assert.equal((await result.json()).blocked, false);
  }
  const threshold = await actor.fetch(new Request("https://sentinel.internal/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorType: "ip", event: "invalid_or_expired_session" })
  }));
  const locked = await threshold.json();
  assert.equal(locked.blocked, true);
  assert.equal(locked.pattern, "credential_spray");
  assert.equal(locked.retryAfterSeconds, 60);

  const check = await actor.fetch(new Request("https://sentinel.internal/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorType: "ip" })
  }));
  assert.equal((await check.json()).blocked, true);
  assert.equal(ctx.storage.value.events.length, 15);
  assert.deepEqual(Object.keys(ctx.storage.value.events[0]).sort(), ["actorType", "at", "event"]);
  assert.equal(ctx.storage.alarmAt > Date.now(), true);
});

test("Durable Object expires all actor state after retention alarm", async () => {
  const ctx = context();
  const actor = new SentinelState(ctx, {});
  await actor.fetch(new Request("https://sentinel.internal/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorType: "user", event: "resource_not_found" })
  }));
  await actor.alarm();
  assert.equal(ctx.storage.value, undefined);
  assert.equal(ctx.storage.alarmAt, 0);
  assert.equal(SENTINEL_RETENTION_MS, 24 * 60 * 60 * 1000);
});
