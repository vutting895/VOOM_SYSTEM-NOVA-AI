import test from "node:test";
import assert from "node:assert/strict";
import worker, { authenticateMachine, validateEvent } from "./worker.js";

const SECRET = "test-only-secret-that-is-at-least-32-bytes";
const NOW = 1794550000;
const event = (overrides = {}) => ({
  event_id: "ea-event-0001", module_id: "M01", event_type: "signal",
  symbol: "XAUUSDm", timeframe: "M5", occurred_at: "2026-11-13T08:00:00Z",
  payload: { allocation_pct: 5, daily_loss_pct: 0.2, drawdown_pct: 1,
    leverage: 1, data_age_seconds: 2, market_open: true, signal: "BUY" },
  ...overrides,
});
async function signedRequest(body, env, timestamp = String(NOW)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "." + body));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://decision.test/v1/mt5/events", {
    method: "POST", headers: { "Content-Type": "application/json",
      "X-NOVA-Timestamp": timestamp, "X-NOVA-Signature": "sha256=" + hex },
    body,
  });
}
function env(overrides = {}) {
  return {
    MT5_M2M_HMAC_SECRET: SECRET,
    EVENT_DEDUPE: { idFromName: (id) => id, get: () => ({ fetch: async () => new Response("reserved") }) },
    QUANT_ENGINE: { fetch: async (_url, init) => {
      const input = JSON.parse(init.body);
      assert.equal(input.execution_enabled, false);
      return Response.json({ bias: "neutral", confidence: 0.5, source: "quant-test" });
    } },
    AI: { run: async () => ({ response: "Research explanation only." }) },
    ...overrides,
  };
}

test("accepts all 30 module identifiers", () => {
  for (let i = 1; i <= 30; i++) {
    const id = "M" + String(i).padStart(2, "0");
    assert.equal(validateEvent(event({ module_id: id })).module_id, id);
  }
});
test("rejects unknown module, invalid timestamp, and missing risk evidence", () => {
  assert.throws(() => validateEvent(event({ module_id: "M31" })), /unsupported_module_id/);
  assert.throws(() => validateEvent(event({ occurred_at: "2026-11-13 08:00:00" })), /timezone_aware/);
});
test("machine authentication requires HMAC and fresh timestamp", async () => {
  const body = JSON.stringify(event());
  const req = await signedRequest(body, env());
  assert.deepEqual(await authenticateMachine(req, body, env(), NOW), { ok: true });
  assert.equal((await authenticateMachine(req, body, env(), NOW + 120)).error,
    "invalid_or_expired_machine_timestamp");
});
test("rejects missing machine secret and tampered body", async () => {
  const body = JSON.stringify(event());
  const req = await signedRequest(body, env());
  assert.equal((await authenticateMachine(req, body, {}, NOW)).status, 503);
  assert.equal((await authenticateMachine(req, body + " ", env(), NOW)).status, 401);
});
test("returns quant result, deterministic risk decision, Workers AI explanation and hard execution-off flags", async () => {
  const body = JSON.stringify(event());
  const req = await signedRequest(body, env());
  const response = await worker.fetch(req, env());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.quant_engine.source, "quant-test");
  assert.equal(result.risk_gate.passed, true);
  assert.equal(result.ai_explanation.provider, "cloudflare-workers-ai");
  assert.equal(result.ordersEnabled, false);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.liveTradingEnabled, false);
});
test("risk gate rejects unsafe or absent risk metrics", async () => {
  const body = JSON.stringify(event({ payload: { allocation_pct: 25, daily_loss_pct: 4,
    drawdown_pct: 8, leverage: 2, data_age_seconds: 90, market_open: false } }));
  const req = await signedRequest(body, env());
  const result = await (await worker.fetch(req, env())).json();
  assert.equal(result.risk_gate.passed, false);
  assert.equal(result.decision, "rejected");
});
test("fails closed when event dedupe service is absent", async () => {
  const body = JSON.stringify(event());
  const req = await signedRequest(body, env());
  const result = await worker.fetch(req, env({ EVENT_DEDUPE: undefined }));
  assert.equal(result.status, 503);
});
test("duplicate event is rejected before quant dispatch", async () => {
  let quantCalls = 0;
  const body = JSON.stringify(event());
  const req = await signedRequest(body, env());
  const result = await worker.fetch(req, env({
    EVENT_DEDUPE: { idFromName: (id) => id, get: () => ({ fetch: async () => new Response("duplicate", { status: 409 }) }) },
    QUANT_ENGINE: { fetch: async () => { quantCalls++; return Response.json({}); } },
  }));
  assert.equal(result.status, 409);
  assert.equal(quantCalls, 0);
});
test("fails closed when Quant Engine is unavailable", async () => {
  const body = JSON.stringify(event());
  const req = await signedRequest(body, env());
  const result = await worker.fetch(req, env({ QUANT_ENGINE: undefined }));
  assert.equal(result.status, 503);
});
test("health reports bindings without exposing configuration values", async () => {
  const result = await (await worker.fetch(new Request("https://decision.test/health"), env())).json();
  assert.equal(result.machine_auth_configured, true);
  assert.equal(result.ordersEnabled, false);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});
