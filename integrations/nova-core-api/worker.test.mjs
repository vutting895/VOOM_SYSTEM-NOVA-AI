import test from "node:test";
import assert from "node:assert/strict";
import worker, { authorizeClaims } from "./worker.js";
const env = { ALLOWED_ORIGIN: "https://voomsystem.netlify.app" };

test("public health reports degraded until dependencies are verified and keeps trading disabled", async () => {
  const response = await worker.fetch(new Request("https://core.example/v1/health"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.liveTrading, false);
  assert.equal(body.brokerWrites, false);
});
test("rejects non-GET methods", async () => {
  const response = await worker.fetch(new Request("https://core.example/v1/health", { method: "POST" }), env);
  assert.equal(response.status, 405);
});
test("unknown and write-like routes are not exposed", async () => {
  for (const path of ["/v1/orders", "/v1/bridge/execute", "/v1/withdrawals", "/anything"]) {
    const response = await worker.fetch(new Request("https://core.example" + path), env);
    assert.equal(response.status, 404);
  }
});
test("protected routes require bearer authentication", async () => {
  const response = await worker.fetch(new Request("https://core.example/v1/me"), env);
  assert.equal(response.status, 401);
});
test("rejects unapproved origins", async () => {
  const response = await worker.fetch(new Request("https://core.example/v1/health", { headers: { Origin: "https://attacker.example" } }), env);
  assert.equal(response.status, 403);
});
test("authorization uses trusted app_metadata only and enforces role hierarchy", () => {
  assert.equal(authorizeClaims({ sub: "u1", app_metadata: { nova_role: "viewer" } }, "viewer").ok, true);
  assert.equal(authorizeClaims({ sub: "u1", user_metadata: { nova_role: "admin" } }, "viewer").status, 403);
  assert.equal(authorizeClaims({ sub: "u1", app_metadata: { nova_role: "viewer" } }, "operator").status, 403);
  assert.equal(authorizeClaims({ sub: "u1", app_metadata: { nova_role: "operator" } }, "operator").ok, true);
  assert.equal(authorizeClaims({ sub: "u1", app_metadata: { nova_role: "root" } }, "viewer").status, 403);
});
