import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const TOKEN = "test-access-token";
const ORIGIN = "https://voomsystem.netlify.app";
const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  ALLOWED_ORIGINS: ORIGIN
};
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function request(path, options = {}) {
  return new Request("https://execution.test" + path, options);
}

test("health reports execution and Live Trading hard-disabled", async () => {
  const response = await worker.fetch(request("/health"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.service, "nova-execution-service");
  assert.equal(body.executionEnabled, false);
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(body.brokerAdapterConfigured, false);
});

test("protected status rejects missing bearer token", async () => {
  const response = await worker.fetch(request("/v1/trading/execution/status"), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "authentication_required");
});

test("protected status fails closed when auth settings are absent", async () => {
  const response = await worker.fetch(request("/v1/trading/execution/status", {
    headers: { Authorization: "Bearer " + TOKEN }
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "authentication_not_configured");
});

test("valid Supabase user sees disabled capability status", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://supabase.test");
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
    assert.equal(init.redirect, "error");
    return Response.json({ id: "user-a" });
  };
  const response = await worker.fetch(request("/v1/trading/execution/status", {
    headers: { Authorization: "Bearer " + TOKEN, Origin: ORIGIN }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.authenticated, true);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("intent submission is explicitly rejected and cannot reach a broker", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ id: "user-a" });
  };
  const response = await worker.fetch(request("/v1/trading/intents", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      Origin: ORIGIN,
      "Content-Type": "application/json",
      "Idempotency-Key": "intent-test-001"
    },
    body: JSON.stringify({
      symbol: "XAUUSDm",
      side: "buy",
      executionEnabled: true,
      ordersEnabled: true,
      liveTradingEnabled: true
    })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 423);
  assert.equal(body.error, "execution_disabled");
  assert.equal(body.state, "not_accepted");
  assert.equal(body.intentAccepted, false);
  assert.equal(body.executionEnabled, false);
  assert.equal(body.ordersEnabled, false);
  assert.equal(body.liveTradingEnabled, false);
  assert.equal(calls, 1, "only Supabase Auth may be called; no broker call is allowed");
});

test("invalid Supabase session is rejected before intent handling", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 401 });
  const response = await worker.fetch(request("/v1/trading/intents", {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "XAUUSDm", side: "buy" })
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "invalid_or_expired_session");
});

test("untrusted browser origin is rejected", async () => {
  const response = await worker.fetch(request("/v1/trading/execution/status", {
    headers: { Authorization: "Bearer " + TOKEN, Origin: "https://attacker.example" }
  }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "origin_not_allowed");
});

test("intent lookup is authenticated and fails closed without a durable store", async () => {
  globalThis.fetch = async () => Response.json({ id: "user-a" });
  const response = await worker.fetch(request("/v1/trading/intents/intent-123", {
    headers: { Authorization: "Bearer " + TOKEN }
  }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "intent_store_not_configured");
});

test("unknown paths do not expose an order route", async () => {
  const response = await worker.fetch(request("/api/orders", { method: "POST" }), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "not_found");
});
