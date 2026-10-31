import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeIncident } from "../lib/nova-diagnostics.js";
import { safeReadFetch } from "../lib/nova-safe-fetch.js";

test("incident sanitizer removes query strings and rejects untrusted fields", () => {
  const incident = sanitizeIncident({
    incidentId: "not-a-valid-id",
    errorCode: "attacker_supplied_code",
    route: "/broker?token=secret#account",
    component: "broker-page",
    attempt: 99,
    message: "password=secret",
    stack: "secret stack"
  });
  assert.equal(incident.errorCode, "unknown_client_error");
  assert.equal(incident.route, "/broker");
  assert.equal(incident.component, "broker-page");
  assert.equal(incident.attempt, 3);
  assert.equal("message" in incident, false);
  assert.equal("stack" in incident, false);
});

test("safe GET retries a transient response and returns the recovered response", async () => {
  let calls = 0;
  const result = await safeReadFetch(async () => {
    calls += 1;
    return calls === 1 ? { status: 503, headers: { get: () => null } } : { status: 200 };
  }, "/api/status", {}, { sleep: async () => {}, random: () => 0 });
  assert.equal(calls, 2);
  assert.equal(result.status, 200);
});

test("safe GET respects retry limit", async () => {
  let calls = 0;
  const result = await safeReadFetch(async () => {
    calls += 1;
    return { status: 503, headers: { get: () => null } };
  }, "/api/status", {}, { sleep: async () => {}, random: () => 0, maxRetries: 1 });
  assert.equal(calls, 2);
  assert.equal(result.status, 503);
});

test("POST is never automatically retried", async () => {
  let calls = 0;
  const result = await safeReadFetch(async () => {
    calls += 1;
    return { status: 503 };
  }, "/api/change", { method: "POST" }, { sleep: async () => {} });
  assert.equal(calls, 1);
  assert.equal(result.status, 503);
});

test("retry helper never retries permanent authorization failures", async () => {
  let calls = 0;
  const result = await safeReadFetch(async () => {
    calls += 1;
    return { status: 403, headers: { get: () => null } };
  }, "/api/private", {}, { sleep: async () => {} });
  assert.equal(calls, 1);
  assert.equal(result.status, 403);
});

test("HEAD is an allowed safe-read method", async () => {
  let calls = 0;
  const result = await safeReadFetch(async () => {
    calls += 1;
    return calls === 1 ? { status: 504, headers: { get: () => null } } : { status: 200 };
  }, "/health", { method: "HEAD" }, { sleep: async () => {}, random: () => 0 });
  assert.equal(calls, 2);
  assert.equal(result.status, 200);
});
