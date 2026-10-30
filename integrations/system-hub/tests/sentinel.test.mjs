import test from "node:test";
import assert from "node:assert/strict";
import worker, { SentinelState } from "../worker.js";
import {
  SENTINEL_POLICY_VERSION,
  SENTINEL_RETENTION_MS,
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


class FakeNamespace {
  constructor() { this.actors = new Map(); }
  idFromName(name) { return name; }
  get(id) {
    if (!this.actors.has(id)) this.actors.set(id, new SentinelState(context(), {}));
    const actor = this.actors.get(id);
    return { fetch: (request) => actor.fetch(request) };
  }
}

test("System Hub throttles repeated invalid sessions for the same pseudonymous source only", async () => {
  const namespace = new FakeNamespace();
  const originalFetch = globalThis.fetch;
  let authCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    assert.equal(url.origin, "https://supabase.test");
    assert.equal(url.pathname, "/auth/v1/user");
    authCalls += 1;
    return Response.json({ message: "invalid" }, { status: 401 });
  };
  const env = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable",
    SENTINEL_ENABLED: "true",
    SENTINEL_HASH_SECRET: "test-only-secret-at-least-32-characters-long",
    SENTINEL_STATE: namespace
  };
  try {
    for (let index = 0; index < 15; index += 1) {
      const response = await worker.fetch(new Request("https://hub.test/v1/integrations", {
        headers: {
          Authorization: "Bearer invalid-session",
          "CF-Connecting-IP": "198.51.100.10"
        }
      }), env);
      assert.equal(response.status, index === 14 ? 429 : 401);
    }
    assert.equal(authCalls, 15);

    const sameActor = await worker.fetch(new Request("https://hub.test/v1/integrations", {
      headers: {
        Authorization: "Bearer invalid-session",
        "CF-Connecting-IP": "198.51.100.10"
      }
    }), env);
    assert.equal(sameActor.status, 429);
    assert.equal(authCalls, 15, "blocked actor must be denied before another Supabase Auth call");

    const differentActor = await worker.fetch(new Request("https://hub.test/v1/integrations", {
      headers: {
        Authorization: "Bearer invalid-session",
        "CF-Connecting-IP": "198.51.100.11"
      }
    }), env);
    assert.equal(differentActor.status, 401, "one source cooldown must not block another source");
    assert.equal(authCalls, 16);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resource enumeration cooldown is user-scoped and does not block another tenant", async () => {
  const namespace = new FakeNamespace();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    assert.equal(url.origin, "https://supabase.test");
    assert.equal(url.pathname, "/auth/v1/user");
    const authorization = init.headers.Authorization;
    return Response.json({ id: authorization === "Bearer user-a-token" ? "user-a" : "user-b" });
  };
  const env = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable",
    SENTINEL_ENABLED: "true",
    SENTINEL_HASH_SECRET: "test-only-secret-at-least-32-characters-long",
    SENTINEL_STATE: namespace
  };
  const call = (token) => worker.fetch(new Request("https://hub.test/v1/connections/not-a-uuid/status", {
    headers: { Authorization: "Bearer " + token, "CF-Connecting-IP": "203.0.113.20" }
  }), env);
  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await call("user-a-token");
      assert.equal(response.status, index === 7 ? 429 : 400);
    }
    assert.equal((await call("user-a-token")).status, 429);
    assert.equal((await call("user-b-token")).status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejected browser Origin probes are counted and temporarily throttled", async () => {
  const namespace = new FakeNamespace();
  const env = {
    SENTINEL_ENABLED: "true",
    SENTINEL_HASH_SECRET: "test-only-secret-at-least-32-characters-long",
    SENTINEL_STATE: namespace
  };
  for (let index = 0; index < 8; index += 1) {
    const response = await worker.fetch(new Request("https://hub.test/v1/integrations", {
      headers: { Origin: "https://attacker.example", "CF-Connecting-IP": "192.0.2.55" }
    }), env);
    assert.equal(response.status, index === 7 ? 429 : 403);
  }
});
